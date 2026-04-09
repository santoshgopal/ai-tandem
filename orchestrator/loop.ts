/**
 * @module orchestrator/loop
 *
 * The main orchestration loop. Ties all orchestrator modules together.
 * Processes tickets in priority order: backend agent → contract handoff → frontend agent.
 *
 * Inputs: LoopOptions (config, ticketsDir, dryRun, optional AbortSignal).
 * Outputs: LoopResult (processed, skipped, failed, stoppedAt).
 * Errors: propagates fatal errors (InvalidTransitionError, StateWriteError,
 *         CircularDependencyError, ValidationError on load) to the caller.
 *         Handles per-ticket errors (MaxRetriesExceeded, ContractTimeout)
 *         according to config.pause_on_error.
 */

import { access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTickets } from './ticket-loader.js';
import { TicketStateMachine } from './state-machine.js';
import { buildBackendPrompt, buildFrontendPrompt } from './prompt-builder.js';
import { runAgentWithRetry } from './retry-handler.js';
import { waitForContract } from './contract-watcher.js';
import { parseAgentOutput, writeAudit } from './audit-writer.js';
import {
  InvalidTransitionError,
  StateWriteError,
  CircularDependencyError,
  ValidationError,
  MaxRetriesExceededError,
  ContractTimeoutError,
  ContractValidationError,
} from './errors.js';
import type { TandemConfig } from '../schemas/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoopOptions {
  config: TandemConfig;
  ticketsDir: string;
  dryRun: boolean;
  signal?: AbortSignal;
}

export interface LoopResult {
  processed: number;
  skipped: number;
  failed: number;
  stoppedAt?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function contractSchemaPath(): string {
  return join(__dirname, '..', 'schemas', 'contract.schema.json');
}

async function pauseFileExists(ticketsDir: string): Promise<boolean> {
  const pausePath = join(ticketsDir, '..', '.tandem', 'PAUSE');
  try {
    await access(pausePath);
    return true;
  } catch {
    return false;
  }
}

function log(msg: string, dryRun: boolean): void {
  const prefix = dryRun ? '[DRY RUN] ' : '';
  console.log(`${prefix}${msg}`);
}

// ─── Main loop ────────────────────────────────────────────────────────────────

export async function runLoop(options: LoopOptions): Promise<LoopResult> {
  const { config, ticketsDir, dryRun, signal } = options;
  const result: LoopResult = { processed: 0, skipped: 0, failed: 0 };

  const maxRetries = config.max_retries ?? 2;
  const agentTimeout = config.agent_timeout_minutes ?? 30;
  const contractTimeout = config.contract_timeout_minutes ?? 35;
  const model = config.claude_model ?? 'claude-sonnet-4-20250514';
  const branchPrefix = config.branch_prefix ?? 'tandem/';
  const pauseOnError = config.pause_on_error ?? true;

  // LOAD PHASE
  let queue;
  try {
    queue = await loadTickets(ticketsDir);
  } catch (err) {
    if (
      err instanceof ValidationError ||
      err instanceof CircularDependencyError
    ) {
      console.error(`[tandem] Fatal error loading tickets: ${err.message}`);
      throw err;
    }
    throw err;
  }

  const totalSkipped = queue.done.length + queue.blocked.length + queue.errored.length;
  result.skipped = totalSkipped;

  log(
    `Queue: ${queue.executable.length} executable, ${queue.blocked.length} blocked, ${queue.done.length} done, ${queue.errored.length} errored`,
    dryRun,
  );

  if (queue.executable.length === 0) {
    log('Queue empty. Nothing to run.', dryRun);
    return result;
  }

  // TICKET LOOP
  let firstTicket = true;
  for (const loaded of queue.executable) {
    const { ticket, ticketDir, contractPath, statusPath } = loaded;

    // Check abort signal
    if (signal?.aborted) {
      result.stoppedAt = ticket.id;
      log(`Aborted before processing ${ticket.id}.`, dryRun);
      return result;
    }

    // Check PAUSE file
    if (await pauseFileExists(ticketsDir)) {
      result.stoppedAt = ticket.id;
      log('Paused. Run tandem resume to continue.', dryRun);
      return result;
    }

    // Check loop_until — stop BEFORE processing if not the first ticket
    if (!firstTicket && config.loop_until === ticket.id) {
      result.stoppedAt = ticket.id;
      log(`loop_until target '${ticket.id}' reached before processing. Stopping.`, dryRun);
      return result;
    }
    firstTicket = false;

    log(`▶ Starting ticket ${ticket.id}: ${ticket.title}`, dryRun);

    const sm = new TicketStateMachine(statusPath, ticket.id);

    // ── BACKEND PHASE ──────────────────────────────────────────────────────────

    if (!dryRun) {
      await sm.transition('be-working', { reason: 'Backend agent starting' });
      await sm.updateRunMeta('be', {
        branch: `${branchPrefix}${ticket.id}-be`,
        started_at: new Date().toISOString(),
        completed_at: null,
        exit_code: null,
        retry_count: 0,
        commit: null,
      });
    } else {
      log(`Would transition ${ticket.id} → be-working`, dryRun);
    }

    const bePrompt = buildBackendPrompt(ticket, contractPath, contractSchemaPath());

    let beResult;
    try {
      beResult = await runAgentWithRetry(
        {
          ticketId: ticket.id,
          role: 'be',
          repoPath: config.be_repo,
          prompt: bePrompt,
          model,
          timeoutMinutes: agentTimeout,
          dryRun,
        },
        sm,
        maxRetries,
        signal,
      );
    } catch (err) {
      if (err instanceof MaxRetriesExceededError) {
        if (!dryRun) {
          await sm.transition('error', {
            reason: err.message,
          });
        }
        result.failed++;
        if (pauseOnError) {
          log(
            `Paused on error for ticket ${ticket.id}: ${err.message}`,
            dryRun,
          );
          result.stoppedAt = ticket.id;
          return result;
        }
        log(`Skipping errored ticket ${ticket.id}: ${err.message}`, dryRun);
        continue;
      }
      if (
        err instanceof InvalidTransitionError ||
        err instanceof StateWriteError
      ) {
        console.error(`[tandem] Fatal error: ${err.message}`);
        throw err;
      }
      throw err;
    }

    if (!dryRun) {
      await sm.updateRunMeta('be', {
        completed_at: new Date().toISOString(),
        exit_code: beResult.exitCode,
        commit: null, // parsed from stdout if visible
      });
      const beParsed = parseAgentOutput(beResult.stdout);
      await writeAudit(
        ticketDir,
        'be',
        ticket,
        beResult,
        beParsed,
        new Date().toISOString(),
      );
    }

    // ── CONTRACT PHASE ────────────────────────────────────────────────────────

    if (!dryRun) {
      await sm.transition('contract-ready');
    }

    log(`⏳ Waiting for contract.json at ${contractPath}...`, dryRun);

    let contract;
    if (!dryRun) {
      try {
        contract = await waitForContract(contractPath, ticket.id, contractTimeout);
      } catch (err) {
        if (
          err instanceof ContractTimeoutError ||
          err instanceof ContractValidationError
        ) {
          await sm.transition('error', { reason: err.message });
          result.failed++;
          if (pauseOnError) {
            log(`Paused on error for ticket ${ticket.id}: ${err.message}`, dryRun);
            result.stoppedAt = ticket.id;
            return result;
          }
          log(`Skipping errored ticket ${ticket.id}: ${err.message}`, dryRun);
          continue;
        }
        throw err;
      }
    } else {
      log(
        `Would wait for contract.json at ${contractPath} (timeout: ${contractTimeout}m)`,
        dryRun,
      );
      // In dry-run mode, build a minimal contract from the example for prompt building
      contract = null;
    }

    // ── FRONTEND PHASE ────────────────────────────────────────────────────────

    log(`▶ Starting frontend agent for ${ticket.id}`, dryRun);

    if (!dryRun) {
      await sm.updateRunMeta('fe', {
        branch: `${branchPrefix}${ticket.id}-fe`,
        started_at: new Date().toISOString(),
        completed_at: null,
        exit_code: null,
        retry_count: 0,
        commit: null,
      });
    }

    let fePrompt: string;
    if (contract !== null) {
      fePrompt = buildFrontendPrompt(ticket, contract);
    } else {
      // Dry run without contract — build a minimal placeholder prompt
      fePrompt = `[DRY RUN] Frontend prompt for ${ticket.id} — no contract available in dry-run mode`;
    }

    let feResult;
    try {
      feResult = await runAgentWithRetry(
        {
          ticketId: ticket.id,
          role: 'fe',
          repoPath: config.fe_repo,
          prompt: fePrompt,
          model,
          timeoutMinutes: agentTimeout,
          dryRun,
        },
        sm,
        maxRetries,
        signal,
      );
    } catch (err) {
      if (err instanceof MaxRetriesExceededError) {
        if (!dryRun) {
          await sm.transition('error', { reason: err.message });
        }
        result.failed++;
        if (pauseOnError) {
          log(`Paused on error for ticket ${ticket.id}: ${err.message}`, dryRun);
          result.stoppedAt = ticket.id;
          return result;
        }
        log(`Skipping errored ticket ${ticket.id}: ${err.message}`, dryRun);
        continue;
      }
      if (
        err instanceof InvalidTransitionError ||
        err instanceof StateWriteError
      ) {
        console.error(`[tandem] Fatal error: ${err.message}`);
        throw err;
      }
      throw err;
    }

    // ── COMPLETION PHASE ──────────────────────────────────────────────────────

    if (!dryRun) {
      await sm.updateRunMeta('fe', {
        completed_at: new Date().toISOString(),
        exit_code: feResult.exitCode,
      });
      const feParsed = parseAgentOutput(feResult.stdout);
      await writeAudit(
        ticketDir,
        'fe',
        ticket,
        feResult,
        feParsed,
        new Date().toISOString(),
      );
      await sm.transition('done');
    }

    log(`✓ Ticket ${ticket.id} complete.`, dryRun);
    result.processed++;

    // LOOP CONTROL
    if (!config.loop) {
      log('Single-run mode. Stopping after first ticket.', dryRun);
      return result;
    }

    if (config.loop_until === ticket.id) {
      log(`Reached loop_until target '${ticket.id}'. Stopping.`, dryRun);
      return result;
    }
  }

  log(
    `Loop complete. Processed: ${result.processed}, Failed: ${result.failed}, Skipped: ${result.skipped}`,
    dryRun,
  );
  return result;
}

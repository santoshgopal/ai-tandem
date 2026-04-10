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
import type { Logger } from '../types/logger.interface.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoopOptions {
  config: TandemConfig;
  ticketsDir: string;
  dryRun: boolean;
  signal?: AbortSignal;
  logger?: Logger;
  /** Absolute path to the PAUSE file. When omitted, derived from ticketsDir. */
  pauseFilePath?: string;
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

async function pauseFileExists(pausePath: string): Promise<boolean> {
  try {
    await access(pausePath);
    return true;
  } catch {
    return false;
  }
}

/** Fallback console-based logger used when no logger is injected. */
const consoleFallback: Logger = {
  info: (msg: string) => console.log(msg),
  success: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
  error: (msg: string) => console.error(msg),
  agent: (_role: 'be' | 'fe', msg: string) => console.log(msg),
  phase: (msg: string) => console.log(`\n${msg}\n`),
  dryRun: (msg: string) => console.log(`[DRY RUN] ${msg}`),
  blank: () => console.log(''),
  table: (_h: string[], r: string[][]) => console.table(r),
  isTTY: process.stdout.isTTY ?? false,
};

// ─── Main loop ────────────────────────────────────────────────────────────────

export async function runLoop(options: LoopOptions): Promise<LoopResult> {
  const { config, ticketsDir, dryRun, signal } = options;
  const out: Logger = options.logger ?? consoleFallback;
  const pausePath = options.pauseFilePath ?? join(ticketsDir, '..', '.tandem', 'PAUSE');
  const result: LoopResult = { processed: 0, skipped: 0, failed: 0 };

  /** Emit an informational message, using dryRun prefix when appropriate. */
  const emit = (msg: string): void => {
    if (dryRun) {
      out.dryRun(msg);
    } else {
      out.info(msg);
    }
  };

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
      out.error(`[tandem] Fatal error loading tickets: ${err.message}`);
      throw err;
    }
    throw err;
  }

  const totalSkipped = queue.done.length + queue.blocked.length + queue.errored.length;
  result.skipped = totalSkipped;

  emit(
    `Queue: ${queue.executable.length} executable, ${queue.blocked.length} blocked, ${queue.done.length} done, ${queue.errored.length} errored`,
  );

  if (queue.executable.length === 0) {
    emit('Queue empty. Nothing to run.');
    return result;
  }

  // TICKET LOOP
  let firstTicket = true;
  for (const loaded of queue.executable) {
    const { ticket, ticketDir, contractPath, statusPath } = loaded;

    // Check abort signal
    if (signal?.aborted) {
      result.stoppedAt = ticket.id;
      emit(`Aborted before processing ${ticket.id}.`);
      return result;
    }

    // Check PAUSE file
    if (await pauseFileExists(pausePath)) {
      result.stoppedAt = ticket.id;
      emit('Paused. Run tandem resume to continue.');
      return result;
    }

    // Check loop_until — stop BEFORE processing if not the first ticket
    if (!firstTicket && config.loop_until === ticket.id) {
      result.stoppedAt = ticket.id;
      emit(`loop_until target '${ticket.id}' reached before processing. Stopping.`);
      return result;
    }
    firstTicket = false;

    out.phase(`▶ Starting ticket ${ticket.id}: ${ticket.title}`);

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
      out.dryRun(`Would transition ${ticket.id} → be-working`);
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
          emit(`Paused on error for ticket ${ticket.id}: ${err.message}`);
          result.stoppedAt = ticket.id;
          return result;
        }
        emit(`Skipping errored ticket ${ticket.id}: ${err.message}`);
        continue;
      }
      if (
        err instanceof InvalidTransitionError ||
        err instanceof StateWriteError
      ) {
        out.error(`[tandem] Fatal error: ${err.message}`);
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

    emit(`⏳ Waiting for contract.json at ${contractPath}...`);

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
            emit(`Paused on error for ticket ${ticket.id}: ${err.message}`);
            result.stoppedAt = ticket.id;
            return result;
          }
          emit(`Skipping errored ticket ${ticket.id}: ${err.message}`);
          continue;
        }
        throw err;
      }
    } else {
      out.dryRun(
        `Would wait for contract.json at ${contractPath} (timeout: ${contractTimeout}m)`,
      );
      // In dry-run mode, build a minimal contract from the example for prompt building
      contract = null;
    }

    // ── FRONTEND PHASE ────────────────────────────────────────────────────────

    out.phase(`▶ Starting frontend agent for ${ticket.id}`);

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
          emit(`Paused on error for ticket ${ticket.id}: ${err.message}`);
          result.stoppedAt = ticket.id;
          return result;
        }
        emit(`Skipping errored ticket ${ticket.id}: ${err.message}`);
        continue;
      }
      if (
        err instanceof InvalidTransitionError ||
        err instanceof StateWriteError
      ) {
        out.error(`[tandem] Fatal error: ${err.message}`);
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

    out.phase(`✓ Ticket ${ticket.id} complete.`);
    result.processed++;

    // LOOP CONTROL
    if (!config.loop) {
      emit('Single-run mode. Stopping after first ticket.');
      return result;
    }

    if (config.loop_until === ticket.id) {
      emit(`Reached loop_until target '${ticket.id}'. Stopping.`);
      return result;
    }
  }

  emit(
    `Loop complete. Processed: ${result.processed}, Failed: ${result.failed}, Skipped: ${result.skipped}`,
  );
  return result;
}

/**
 * @module cli/error-formatter
 *
 * Formats every TandemError subclass into a human-readable terminal message.
 * This is the only place that knows about error types and their
 * human-readable representations.
 *
 * All output goes through the Logger interface — never console.log directly.
 */

import {
  TandemError,
  ValidationError,
  TicketReadError,
  CircularDependencyError,
  InvalidTransitionError,
  AgentRunError,
  AgentTimeoutError,
  ContractTimeoutError,
  ContractValidationError,
  MaxRetriesExceededError,
  StateWriteError,
  TemplateMissingKeyError,
} from '../orchestrator/errors.js';
import type { Logger } from '../types/logger.interface.js';

// ─── Public function ──────────────────────────────────────────────────────────

export function formatAndLogError(err: unknown, logger: Logger): void {
  const debug = process.env['DEBUG'] === 'tandem';

  if (err instanceof ValidationError) {
    logger.error(`Validation failed: ${err.message}`);
    const errs = err.errors as unknown[];
    const shown = errs.slice(0, 3) as unknown[];
    for (const e of shown) {
      const msg = typeof e === 'object' && e !== null && 'message' in e
        ? String((e as Record<string, unknown>)['message'])
        : String(e);
      logger.info(`  • ${msg}`);
    }
    if (errs.length > 3) {
      logger.info(`  (and ${errs.length - 3} more errors)`);
    }
    if (debug && err.stack) logger.info(err.stack);
    return;
  }

  if (err instanceof TicketReadError) {
    logger.error(`Cannot read ticket [${err.ticketId}]: ${err.message}`);
    if (debug && err.stack) logger.info(err.stack);
    return;
  }

  if (err instanceof CircularDependencyError) {
    logger.error('Circular dependency detected:');
    logger.info(`  ${err.cycle.join(' → ')}`);
    if (debug && err.stack) logger.info(err.stack);
    return;
  }

  if (err instanceof InvalidTransitionError) {
    logger.error(`Invalid state transition:\n  ${err.message}`);
    logger.info('  This is likely a bug — please open an issue.');
    if (debug && err.stack) logger.info(err.stack);
    return;
  }

  if (err instanceof AgentRunError) {
    logger.error(
      `Agent failed for [${err.ticketId}] (exit code ${err.exitCode}):\n  ${err.message}`,
    );
    if (err.stderr) {
      logger.info('  Last stderr output:');
      const excerpt = err.stderr.slice(0, 500);
      for (const line of excerpt.split('\n')) {
        logger.info(`    ${line}`);
      }
    }
    if (debug && err.stack) logger.info(err.stack);
    return;
  }

  if (err instanceof AgentTimeoutError) {
    const roleLabel = err.message.startsWith('Backend') ? 'Backend' : 'Frontend';
    logger.error(
      `${roleLabel} agent timed out for [${err.ticketId}] after ${err.timeoutMinutes}m`,
    );
    logger.info('  Increase agent_timeout_minutes in .tandem/config.json');
    if (debug && err.stack) logger.info(err.stack);
    return;
  }

  if (err instanceof ContractTimeoutError) {
    logger.error(
      `Backend agent did not write contract.json within ${err.timeoutMinutes}m for [${err.ticketId}]`,
    );
    logger.info(`  Check the backend audit log: tickets/${err.ticketId}/be_audit.md`);
    logger.info('  To retry: tandem run --tickets ./path/to/tickets');
    if (debug && err.stack) logger.info(err.stack);
    return;
  }

  if (err instanceof ContractValidationError) {
    logger.error(`contract.json for [${err.ticketId}] failed schema validation:`);
    logger.info(`  ${err.message}`);
    logger.info(`  Check the backend agent's output in tickets/${err.ticketId}/be_audit.md`);
    if (debug && err.stack) logger.info(err.stack);
    return;
  }

  if (err instanceof MaxRetriesExceededError) {
    const roleLabel = err.role === 'be' ? 'Backend' : 'Frontend';
    logger.error(
      `${roleLabel} agent failed after ${err.attempts} attempt(s) for [${err.ticketId}]`,
    );
    const auditFile = err.role === 'be' ? 'be_audit.md' : 'fe_audit.md';
    logger.info(
      `  Ticket set to error state. Inspect: tickets/${err.ticketId}/${auditFile}`,
    );
    logger.info(
      '  To retry this ticket: edit status.json → set current to "queued"',
    );
    if (debug && err.stack) logger.info(err.stack);
    return;
  }

  if (err instanceof StateWriteError) {
    logger.error(`State write failed for [${err.ticketId}]: ${err.message}`);
    if (debug && err.stack) logger.info(err.stack);
    return;
  }

  if (err instanceof TemplateMissingKeyError) {
    logger.error(`Template error — missing key '${err.key}': ${err.message}`);
    if (debug && err.stack) logger.info(err.stack);
    return;
  }

  if (err instanceof TandemError) {
    logger.error(`[${err.code}] ${err.message}`);
    if (debug && err.stack) logger.info(err.stack);
    return;
  }

  // Non-TandemError (unexpected)
  if (err instanceof Error) {
    logger.error(`Unexpected error: ${err.message}`);
    if (err.stack) {
      for (const line of err.stack.split('\n').slice(1)) {
        logger.info(line);
      }
    }
    return;
  }

  // Primitive or unknown type
  logger.error(`Unexpected error: ${String(err)}`);
}

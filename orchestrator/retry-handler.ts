/**
 * @module orchestrator/retry-handler
 *
 * Wraps runAgent() with retry logic. Manages retry count, exponential backoff,
 * and throws MaxRetriesExceededError after all attempts are exhausted.
 *
 * Inputs: AgentRunOptions, TicketStateMachine, maxRetries count.
 * Outputs: AgentRunResult on success.
 * Errors: throws MaxRetriesExceededError after max attempts;
 *         re-throws any non-retryable errors immediately.
 *
 * Backoff: 2^(attempt-1) * 10_000 ms (10s, 20s, 40s for attempts 1, 2, 3).
 * The backoff is interruptible via AbortSignal (SIGTERM handling).
 */

import { runAgent, type AgentRunOptions, type AgentRunResult } from './agent-runner.js';
import { type TicketStateMachine } from './state-machine.js';
import {
  AgentRunError,
  AgentTimeoutError,
  MaxRetriesExceededError,
} from './errors.js';

// ─── Backoff helper ───────────────────────────────────────────────────────────

/** Returns the backoff duration in ms for a given attempt number (1-indexed). */
export function backoffMs(attempt: number): number {
  return Math.pow(2, attempt - 1) * 10_000;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(resolve, ms);

    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    }
  });
}

// ─── Retry wrapper ────────────────────────────────────────────────────────────

export async function runAgentWithRetry(
  agentOptions: AgentRunOptions,
  stateMachine: TicketStateMachine,
  maxRetries: number,
  signal?: AbortSignal,
): Promise<AgentRunResult> {
  let attempts = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempts++;
    const startedAt = new Date().toISOString();

    if (!agentOptions.dryRun) {
      await stateMachine.updateRunMeta(agentOptions.role, {
        started_at: startedAt,
        completed_at: null,
        exit_code: null,
        retry_count: attempts - 1,
      });
    }

    try {
      const result = await runAgent(agentOptions);

      if (!agentOptions.dryRun) {
        await stateMachine.updateRunMeta(agentOptions.role, {
          completed_at: new Date().toISOString(),
          exit_code: result.exitCode,
          retry_count: attempts - 1,
        });
      }

      return result;
    } catch (err) {
      if (err instanceof AgentRunError || err instanceof AgentTimeoutError) {
        if (!agentOptions.dryRun) {
          await stateMachine.updateRunMeta(agentOptions.role, {
            completed_at: new Date().toISOString(),
            exit_code: err instanceof AgentRunError ? err.exitCode : -1,
            retry_count: attempts - 1,
          });
        }

        if (attempts <= maxRetries) {
          const delay = backoffMs(attempts);
          const errSummary = err.message.slice(0, 200);
          console.log(
            `[tandem] ${agentOptions.role} agent attempt ${attempts} failed: ${errSummary}`,
          );
          // Print stderr from Claude so the user can see the actual error
          if (err instanceof AgentRunError && err.stderr.trim()) {
            console.error(`[tandem] claude stderr:\n${err.stderr.trim()}`);
          }
          console.log(
            `[tandem] Retrying in ${delay / 1000}s (attempt ${attempts + 1} of ${maxRetries + 1})...`,
          );
          await sleep(delay, signal);

          if (signal?.aborted) {
            throw new MaxRetriesExceededError(
              agentOptions.ticketId,
              agentOptions.role,
              attempts,
            );
          }
          continue;
        }

        // Print stderr on final failure too
        if (err instanceof AgentRunError && err.stderr.trim()) {
          console.error(`[tandem] claude stderr (final attempt):\n${err.stderr.trim()}`);
        }
        throw new MaxRetriesExceededError(
          agentOptions.ticketId,
          agentOptions.role,
          attempts,
        );
      }

      // Non-retryable error — rethrow immediately
      throw err;
    }
  }
}

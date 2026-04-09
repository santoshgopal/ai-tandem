/**
 * @module cli/shutdown
 *
 * Registers OS signal handlers and returns an AbortSignal that the
 * main loop uses for graceful shutdown on SIGTERM or SIGINT (Ctrl+C).
 */

import type { Logger } from '../types/logger.interface.js';

// ─── Module-level handler references for clearShutdownHandler ────────────────

let _sigtermHandler: (() => void) | null = null;
let _sigintHandler: (() => void) | null = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register SIGTERM and SIGINT handlers.
 * Returns an AbortSignal that is aborted when either signal fires.
 * The first signal wins; duplicate signals are ignored.
 */
export function registerShutdownHandler(
  logger: Logger,
  onShutdown?: () => void,
): AbortSignal {
  const controller = new AbortController();
  let terminated = false;

  const handle = (removeSibling: () => void): void => {
    if (terminated) return;
    terminated = true;
    logger.phase('Shutdown requested. Finishing current ticket...');
    controller.abort();
    onShutdown?.();
    removeSibling();
  };

  const sigtermHandler = (): void =>
    handle(() => {
      if (_sigintHandler) process.removeListener('SIGINT', _sigintHandler);
    });

  const sigintHandler = (): void =>
    handle(() => {
      if (_sigtermHandler) process.removeListener('SIGTERM', _sigtermHandler);
    });

  _sigtermHandler = sigtermHandler;
  _sigintHandler = sigintHandler;

  process.once('SIGTERM', sigtermHandler);
  process.once('SIGINT', sigintHandler);

  return controller.signal;
}

/**
 * Remove both signal listeners. Call this after the loop exits cleanly
 * to prevent Node from keeping the process alive unnecessarily.
 */
export function clearShutdownHandler(): void {
  if (_sigtermHandler) {
    process.removeListener('SIGTERM', _sigtermHandler);
    _sigtermHandler = null;
  }
  if (_sigintHandler) {
    process.removeListener('SIGINT', _sigintHandler);
    _sigintHandler = null;
  }
}

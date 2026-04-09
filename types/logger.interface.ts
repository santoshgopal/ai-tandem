/**
 * @module types/logger.interface
 *
 * Logger interface shared between the orchestrator and CLI.
 * The CLI provides a concrete implementation (cli/logger.ts).
 * The orchestrator accepts this interface to avoid coupling to the CLI.
 *
 * This file must NOT import from cli/ or orchestrator/ — it is a shared type.
 */

export interface Logger {
  /** Informational — grey prefix, normal message */
  info(message: string): void;
  /** Success — green checkmark prefix */
  success(message: string): void;
  /** Warning — yellow warning prefix */
  warn(message: string): void;
  /** Error — red X prefix, writes to stderr */
  error(message: string): void;
  /** Agent output — dim, prefixed with [BE] or [FE] in respective colours */
  agent(role: 'be' | 'fe', message: string): void;
  /** Phase transition — prominent, full-width separator line + message */
  phase(message: string): void;
  /** Dry run — dim cyan [DRY RUN] prefix */
  dryRun(message: string): void;
  /** Blank line */
  blank(): void;
  /** Table — renders a fixed-width table to stdout */
  table(headers: string[], rows: string[][], columnWidths?: number[]): void;
  /** Whether output is a TTY (used to disable colours in CI) */
  readonly isTTY: boolean;
}

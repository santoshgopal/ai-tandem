/**
 * @module cli/logger
 *
 * The single output interface for all CLI output. No command ever calls
 * console.log directly — everything goes through the logger.
 *
 * Provides consistent formatting and makes --quiet support straightforward.
 * Uses chalk for coloured output; automatically disables colour when not TTY.
 */

import chalk from 'chalk';
import type { Logger } from '../types/logger.interface.js';

// Re-export Logger type so callers don't need to import from two places
export type { Logger };

// ─── ANSI strip helper ────────────────────────────────────────────────────────

/** Strip ANSI escape codes to get the visible character count. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

// ─── Table helper ─────────────────────────────────────────────────────────────

function renderTable(
  headers: string[],
  rows: string[][],
  columnWidths?: number[],
): void {
  const numCols = headers.length;

  const widths: number[] = columnWidths ?? headers.map((h, i) => {
    const rowLengths = rows.map((r) => stripAnsi(r[i] ?? '').length);
    return Math.max(h.length, 0, ...rowLengths);
  });

  // Pad a cell accounting for invisible ANSI codes
  const pad = (s: string, w: number): string => {
    const visible = stripAnsi(s).length;
    return s + ' '.repeat(Math.max(0, w - visible));
  };

  // Truncate a cell to visible width w (strips ANSI — used as fallback)
  const trunc = (s: string, w: number): string => {
    const stripped = stripAnsi(s);
    if (stripped.length <= w) return pad(s, w);
    return stripped.slice(0, w - 1) + '…';
  };

  // Header row
  const headerParts = headers.map((h, i) => pad(h, widths[i] ?? 0));
  process.stdout.write(headerParts.join('  ') + '\n');

  // Separator
  const sep = widths.map((w) => '─'.repeat(w)).join('──');
  process.stdout.write(sep + '\n');

  // Data rows
  for (const row of rows) {
    const cells: string[] = [];
    for (let i = 0; i < numCols; i++) {
      const cell = row[i] ?? '';
      const w = widths[i] ?? 0;
      cells.push(trunc(cell, w));
    }
    process.stdout.write(cells.join('  ') + '\n');
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export interface LoggerOptions {
  quiet?: boolean;
}

export function createLogger(options?: LoggerOptions): Logger {
  const quiet = options?.quiet ?? false;
  const isTTY = process.stdout.isTTY === true;

  // Disable chalk colours when not writing to a terminal
  if (!isTTY) {
    chalk.level = 0;
  }

  return {
    get isTTY() {
      return isTTY;
    },

    info(message: string): void {
      if (quiet) return;
      process.stdout.write(chalk.dim('  ') + message + '\n');
    },

    success(message: string): void {
      process.stdout.write(chalk.green('✓') + ' ' + message + '\n');
    },

    warn(message: string): void {
      process.stdout.write(chalk.yellow('⚠') + ' ' + message + '\n');
    },

    error(message: string): void {
      process.stderr.write(chalk.red('✗') + ' ' + message + '\n');
    },

    agent(role: 'be' | 'fe', message: string): void {
      if (quiet) return;
      const prefix =
        role === 'be'
          ? chalk.hex('#D85A30').bold('[BE]')
          : chalk.hex('#378ADD').bold('[FE]');
      process.stdout.write(prefix + ' ' + chalk.dim(message) + '\n');
    },

    phase(message: string): void {
      process.stdout.write('\n' + chalk.bold(message) + '\n\n');
    },

    dryRun(message: string): void {
      if (quiet) return;
      process.stdout.write(chalk.cyan('[DRY RUN]') + ' ' + chalk.dim(message) + '\n');
    },

    blank(): void {
      process.stdout.write('\n');
    },

    table(headers: string[], rows: string[][], columnWidths?: number[]): void {
      renderTable(headers, rows, columnWidths);
    },
  };
}

/** Default logger instance used by most commands. */
export const log = createLogger();

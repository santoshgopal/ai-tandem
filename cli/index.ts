#!/usr/bin/env node
/**
 * ai-tandem CLI entry point.
 * Registered as `tandem` binary via package.json bin field.
 */

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { log } from './logger.js';
import { formatAndLogError } from './error-formatter.js';
import { initCommand } from './commands/init.js';
import { runCommand } from './commands/run.js';
import { statusCommand } from './commands/status.js';
import { pauseCommand } from './commands/pause.js';
import { resumeCommand } from './commands/resume.js';
import { validateCommand } from './commands/validate.js';
import { newTicketCommand } from './commands/new-ticket.js';

// Read version from package.json at runtime
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
) as { version: string };

// ─── Top-level error handler ──────────────────────────────────────────────────

function handleTopLevelError(err: unknown): void {
  formatAndLogError(err, log);
  process.exit(1);
}

// ─── Program ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('tandem')
  .description(
    'Multi-repo agent orchestrator. Backend builds first. Frontend builds on top.',
  )
  .version(pkg.version, '-v, --version', 'Print version number')
  .helpOption('-h, --help', 'Display help');

// ─── Commands ─────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Set up ai-tandem in a new workspace')
  .option('--config <path>', 'explicit path to write .tandem/config.json')
  .action((options: { config?: string }) =>
    initCommand(options).catch(handleTopLevelError),
  );

program
  .command('run')
  .description('Process tickets through the BE → contract → FE pipeline')
  .option('--config <path>', 'path to .tandem/config.json')
  .option('--tickets <path>', 'override tickets directory path')
  .option('--dry-run', 'validate and render prompts without invoking claude')
  .option('--loop', 'override config: keep processing until queue is empty')
  .option('--loop-until <ticketId>', 'stop after completing this ticket ID')
  .option('--quiet', 'suppress agent output, show only phase transitions')
  .option('--verbose', 'stream every line of agent output to the terminal in real time')
  .action(
    (options: {
      config?: string;
      tickets?: string;
      dryRun?: boolean;
      loop?: boolean;
      loopUntil?: string;
      quiet?: boolean;
      verbose?: boolean;
    }) => runCommand(options).catch(handleTopLevelError),
  );

program
  .command('status')
  .description('Show the current status of all tickets')
  .option('--config <path>', 'path to .tandem/config.json')
  .option('--tickets <path>', 'override tickets directory path')
  .option('--watch', 'refresh every N seconds')
  .option('--interval <seconds>', 'refresh interval in seconds (default: 5)', '5')
  .action(
    (options: {
      config?: string;
      tickets?: string;
      watch?: boolean;
      interval?: string;
    }) => statusCommand(options).catch(handleTopLevelError),
  );

program
  .command('validate')
  .description('Validate all tickets against schemas and check dependencies')
  .option('--config <path>', 'path to .tandem/config.json')
  .option('--tickets <path>', 'override tickets directory path')
  .action(
    (options: { config?: string; tickets?: string }) =>
      validateCommand(options).catch(handleTopLevelError),
  );

program
  .command('new-ticket [title]')
  .description('Scaffold a new ticket with guided prompts')
  .option('--config <path>', 'path to .tandem/config.json')
  .option('--priority <number>', 'explicit priority number (default: auto)')
  .action(
    (title: string | undefined, options: { config?: string; priority?: string }) =>
      newTicketCommand(title, options).catch(handleTopLevelError),
  );

program
  .command('pause')
  .description('Pause the loop after the current ticket completes')
  .option('--config <path>', 'path to .tandem/config.json')
  .action((options: { config?: string }) =>
    pauseCommand(options).catch(handleTopLevelError),
  );

program
  .command('resume')
  .description('Resume the loop after a pause or error')
  .option('--config <path>', 'path to .tandem/config.json')
  .action((options: { config?: string }) =>
    resumeCommand(options).catch(handleTopLevelError),
  );

// ─── Parse ────────────────────────────────────────────────────────────────────

program.parse(process.argv);

if (process.argv.length <= 2) {
  program.help();
}

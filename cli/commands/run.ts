/**
 * @module cli/commands/run
 *
 * tandem run — The primary command. Loads config, registers shutdown handler,
 * calls runLoop(), streams output, and reports the result.
 */

import { access } from 'node:fs/promises';
import { createLogger } from '../logger.js';
import { discoverConfig, loadConfigFromPath, verifyRepoPaths } from '../config-loader.js';
import { registerShutdownHandler, clearShutdownHandler } from '../shutdown.js';
import { formatAndLogError } from '../error-formatter.js';
import { runLoop } from '../../orchestrator/loop.js';

export async function runCommand(options: {
  config?: string;
  tickets?: string;
  dryRun?: boolean;
  loop?: boolean;
  loopUntil?: string;
  quiet?: boolean;
}): Promise<void> {
  const log = createLogger(options.quiet === true ? { quiet: true } : undefined);

  // ── Load config ────────────────────────────────────────────────────────────

  let resolved;
  try {
    resolved = options.config
      ? await loadConfigFromPath(options.config)
      : await discoverConfig();
  } catch (err) {
    formatAndLogError(err, log);
    process.exit(1);
  }

  const config = { ...resolved.config };
  let ticketsDir = resolved.ticketsDir;

  // ── Apply flag overrides ───────────────────────────────────────────────────

  if (options.loop) {
    config.loop = true;
  }
  if (options.loopUntil !== undefined) {
    config.loop_until = options.loopUntil;
  }
  if (options.tickets !== undefined) {
    ticketsDir = options.tickets;
  }

  const dryRun = options.dryRun === true;

  // ── Verify repo paths ─────────────────────────────────────────────────────

  try {
    await verifyRepoPaths(resolved);
  } catch (err) {
    formatAndLogError(err, log);
    process.exit(1);
  }

  // ── Check PAUSE file ───────────────────────────────────────────────────────

  try {
    await access(resolved.pauseFilePath);
    // File exists — we are paused
    log.error('Tandem is paused. Run tandem resume to continue.');
    process.exit(1);
  } catch {
    // Not paused — proceed
  }

  // ── Register shutdown handler ──────────────────────────────────────────────

  const signal = registerShutdownHandler(log);

  // ── Print startup banner ───────────────────────────────────────────────────

  log.phase('ai-tandem  ▶  run');
  log.info(`Config:   ${resolved.configPath}`);
  log.info(`Tickets:  ${ticketsDir}`);
  log.info(
    `Mode:     loop=${String(config.loop ?? false)}, dry-run=${String(dryRun)}`,
  );
  log.blank();

  // ── Run loop ───────────────────────────────────────────────────────────────

  try {
    const result = await runLoop({
      config,
      ticketsDir,
      dryRun,
      signal,
      logger: log,
      pauseFilePath: resolved.pauseFilePath,
    });

    // ── Print result summary ─────────────────────────────────────────────────

    log.blank();
    log.success('Run complete');
    log.blank();
    log.info(`Processed:  ${result.processed} tickets`);
    log.info(`Failed:     ${result.failed} tickets`);
    log.info(`Skipped:    ${result.skipped} tickets`);
    if (result.stoppedAt) {
      log.info(`Stopped at: ${result.stoppedAt}`);
    }

    if (config.open_prs === true) {
      log.blank();
      log.warn(
        'open_prs is enabled but PR automation requires Phase 3.\n' +
        '  PRs were not opened. Run tandem with Phase 3 installed to enable.',
      );
    }
  } catch (err) {
    formatAndLogError(err, log);
    clearShutdownHandler();
    process.exit(1);
  }

  clearShutdownHandler();
}

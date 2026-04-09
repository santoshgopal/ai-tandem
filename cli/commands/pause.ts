/**
 * @module cli/commands/pause
 *
 * tandem pause — Writes the PAUSE signal file so the running loop
 * stops after the current ticket completes.
 */

import { writeFile, access } from 'node:fs/promises';
import { createLogger } from '../logger.js';
import { discoverConfig, loadConfigFromPath } from '../config-loader.js';
import { formatAndLogError } from '../error-formatter.js';

export async function pauseCommand(options: { config?: string }): Promise<void> {
  const log = createLogger();

  let resolved;
  try {
    resolved = options.config
      ? await loadConfigFromPath(options.config)
      : await discoverConfig();
  } catch (err) {
    formatAndLogError(err, log);
    process.exit(1);
  }

  const { pauseFilePath } = resolved;

  // Check if already paused
  try {
    await access(pauseFilePath);
    log.warn('Already paused. Run tandem resume to unpause.');
    return;
  } catch {
    // Not paused — proceed
  }

  await writeFile(pauseFilePath, new Date().toISOString() + '\n', 'utf8');

  log.success('Pause requested.');
  log.info('  The loop will stop after the current ticket completes.');
  log.info('  Run tandem resume to continue.');
}

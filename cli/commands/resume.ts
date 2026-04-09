/**
 * @module cli/commands/resume
 *
 * tandem resume — Removes the PAUSE file so the loop can continue
 * on the next `tandem run`.
 */

import { unlink, access } from 'node:fs/promises';
import { createLogger } from '../logger.js';
import { discoverConfig, loadConfigFromPath } from '../config-loader.js';
import { formatAndLogError } from '../error-formatter.js';

export async function resumeCommand(options: { config?: string }): Promise<void> {
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

  // Check if currently paused
  try {
    await access(pauseFilePath);
  } catch {
    log.warn('Not currently paused. Run tandem run to start a new session.');
    return;
  }

  await unlink(pauseFilePath);

  log.success('Resumed.');
  log.info('  Run tandem run to continue processing tickets.');
}

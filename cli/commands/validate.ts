/**
 * @module cli/commands/validate
 *
 * tandem validate — Validates all tickets against schemas and checks
 * dependency graph. Safe to run at any time — read-only, no writes.
 */

import chalk from 'chalk';
import { createLogger } from '../logger.js';
import { discoverConfig, loadConfigFromPath } from '../config-loader.js';
import { formatAndLogError } from '../error-formatter.js';
import { loadTickets } from '../../orchestrator/ticket-loader.js';
import {
  CircularDependencyError,
  TicketReadError,
  ValidationError,
} from '../../orchestrator/errors.js';

export async function validateCommand(options: {
  config?: string;
  tickets?: string;
}): Promise<void> {
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

  const ticketsDir = options.tickets ?? resolved.ticketsDir;
  log.info(`Validating tickets in ${ticketsDir}...`);
  log.blank();

  let queue;
  let loadError: unknown = null;

  try {
    queue = await loadTickets(ticketsDir);
  } catch (err) {
    loadError = err;
  }

  if (loadError !== null) {
    if (loadError instanceof CircularDependencyError) {
      log.error('Circular dependency detected:');
      log.info(`  ${loadError.cycle.join(' → ')}`);
      process.exit(1);
    }
    if (loadError instanceof TicketReadError || loadError instanceof ValidationError) {
      formatAndLogError(loadError, log);
      process.exit(1);
    }
    formatAndLogError(loadError, log);
    process.exit(1);
  }

  if (!queue) {
    log.error('Failed to load tickets.');
    process.exit(1);
  }

  // Merge all ticket groups
  const allTickets = [
    ...queue.executable,
    ...queue.blocked,
    ...queue.done,
    ...queue.errored,
  ];

  if (allTickets.length === 0) {
    log.warn(`No tickets found in ${ticketsDir}`);
    log.info('Create a ticket directory with ticket.json to get started.');
    return;
  }

  // Build dependency info
  const doneIds = new Set(queue.done.map((t) => t.ticket.id));
  let validCount = 0;
  let invalidCount = 0;

  for (const loaded of allTickets) {
    const { ticket } = loaded;
    const deps = ticket.depends_on ?? [];

    let depStatus = '(no deps)';
    if (deps.length > 0) {
      const depParts = deps.map((dep) =>
        doneIds.has(dep)
          ? `depends on ${dep} ${chalk.green('✓')}`
          : `depends on ${dep}`,
      );
      depStatus = depParts.join(', ');
    }

    log.info(
      `${chalk.green('✓')}  ${ticket.id.padEnd(10)} ${ticket.title.slice(0, 38).padEnd(38)} ${ticket.status.padEnd(16)} ${depStatus}`,
    );
    validCount++;
  }

  log.blank();
  log.info('Queue summary:');
  log.info(`  Executable:  ${queue.executable.length} tickets`);
  log.info(`  Blocked:     ${queue.blocked.length} tickets`);
  log.info(`  Done:        ${queue.done.length} tickets`);
  log.info(`  Errored:     ${queue.errored.length} tickets`);

  if (invalidCount > 0) {
    log.blank();
    log.error(`${invalidCount} validation error(s) found.`);
    process.exit(1);
  } else {
    log.blank();
    log.success(`All ${validCount} ticket(s) valid.`);
  }
}

/**
 * @module cli/commands/new-ticket
 *
 * tandem new-ticket — Scaffold a new ticket directory with a populated ticket.json.
 * Auto-assigns ticket ID and priority based on existing tickets.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';
import { createLogger } from '../logger.js';
import { discoverConfig, loadConfigFromPath } from '../config-loader.js';
import { formatAndLogError } from '../error-formatter.js';
import { loadTickets } from '../../orchestrator/ticket-loader.js';
import { validateTicket } from '../../orchestrator/schema-validator.js';
import type { Ticket } from '../../schemas/index.js';

export async function newTicketCommand(
  title: string | undefined,
  options: { config?: string; priority?: string },
): Promise<void> {
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

  const { config, ticketsDir } = resolved;
  const prefix = config.ticket_prefix;

  // ── Determine title ────────────────────────────────────────────────────────

  let ticketTitle = title ?? '';
  if (!ticketTitle) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('? Ticket title: ');
    await rl.close();
    ticketTitle = answer.trim();
  }

  if (!ticketTitle) {
    log.error('Ticket title is required.');
    process.exit(1);
  }

  // ── Load existing tickets to determine next ID and priority ────────────────

  let existingQueue;
  try {
    existingQueue = await loadTickets(ticketsDir);
  } catch {
    existingQueue = { executable: [], blocked: [], done: [], errored: [] };
  }

  const allExisting = [
    ...existingQueue.executable,
    ...existingQueue.blocked,
    ...existingQueue.done,
    ...existingQueue.errored,
  ];

  // Parse max N from existing IDs matching this prefix
  const existingNums = allExisting
    .map((lt) => lt.ticket.id)
    .filter((id) => id.startsWith(`${prefix}-`))
    .map((id) => {
      const numStr = id.slice(prefix.length + 1);
      const n = parseInt(numStr, 10);
      return isNaN(n) ? 0 : n;
    });

  const maxN = existingNums.length > 0 ? Math.max(...existingNums) : 0;
  const ticketId = `${prefix}-${maxN + 1}`;

  // Determine priority
  let priority: number;
  if (options.priority !== undefined) {
    priority = parseInt(options.priority, 10);
    if (isNaN(priority)) {
      log.error(`Invalid priority: ${options.priority}`);
      process.exit(1);
    }
  } else {
    const maxPriority = allExisting.reduce(
      (max, lt) => Math.max(max, lt.ticket.priority),
      0,
    );
    priority = maxPriority > 0 ? maxPriority + 10 : 10;
  }

  // ── Interactive prompts for required fields ────────────────────────────────

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const userStory = (
    await rl.question('? User story (As a ... I want ... so that ...): ')
  ).trim();
  const beScope = (await rl.question('? Backend scope (what the API must do): ')).trim();
  const feScope = (await rl.question('? Frontend scope (what the UI must do): ')).trim();

  await rl.close();

  // ── Build ticket object ────────────────────────────────────────────────────

  const ticket: Ticket = {
    id: ticketId,
    title: ticketTitle,
    status: 'queued',
    priority,
    depends_on: [],
    user_story: userStory,
    acceptance: ['[TODO: add acceptance criteria]'],
    be_scope: beScope,
    be_constraints: [],
    be_hints: [],
    fe_scope: feScope,
    fe_constraints: [],
    fe_hints: [],
    meta: {
      created_at: new Date().toISOString(),
      created_by: process.env['USER'] ?? 'unknown',
    },
  };

  // Validate before writing
  validateTicket(ticket);

  // ── Write to disk ──────────────────────────────────────────────────────────

  const ticketDir = join(ticketsDir, ticketId);
  await mkdir(ticketDir, { recursive: true });
  await writeFile(
    join(ticketDir, 'ticket.json'),
    JSON.stringify(ticket, null, 2),
    'utf8',
  );

  log.blank();
  log.success(`Created tickets/${ticketId}/ticket.json`);
  log.blank();
  log.info('Edit it to add acceptance criteria and constraints:');
  log.info(`  tickets/${ticketId}/ticket.json`);
  log.blank();
  log.info('Then validate: tandem validate');
}

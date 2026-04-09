/**
 * @module cli/commands/status
 *
 * tandem status — Reads all ticket status files and renders a live table.
 * No orchestrator logic — purely reads status.json and ticket.json from disk.
 */

import { readFile } from 'node:fs/promises';
import chalk from 'chalk';
import { createLogger } from '../logger.js';
import { discoverConfig, loadConfigFromPath } from '../config-loader.js';
import { formatAndLogError } from '../error-formatter.js';
import { loadTickets } from '../../orchestrator/ticket-loader.js';
import type { TicketStatus, TicketStatusRecord } from '../../schemas/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function colorStatus(status: TicketStatus): string {
  switch (status) {
    case 'done':
      return chalk.green(status);
    case 'be-working':
    case 'fe-working':
      return chalk.yellow(status);
    case 'error':
      return chalk.red(status);
    case 'blocked':
      return chalk.dim(status);
    case 'contract-ready':
      return chalk.cyan(status);
    default:
      return status;
  }
}

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

function calcDuration(
  statusRecord: TicketStatusRecord | null,
  currentStatus: TicketStatus,
): string {
  if (!statusRecord) return '—';
  if (currentStatus === 'queued' || currentStatus === 'blocked') return '—';

  const beStart = statusRecord.be_run?.started_at;
  const feEnd = statusRecord.fe_run?.completed_at;

  if (beStart && feEnd) {
    const ms = new Date(feEnd).getTime() - new Date(beStart).getTime();
    return formatDuration(ms);
  }
  if (beStart) {
    const ms = Date.now() - new Date(beStart).getTime();
    return formatDuration(ms);
  }
  return '—';
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

// ─── Sort order for statuses ──────────────────────────────────────────────────

const STATUS_ORDER: Record<TicketStatus, number> = {
  error: 0,
  'be-working': 1,
  'fe-working': 1,
  'contract-ready': 1,
  queued: 2,
  blocked: 2,
  done: 3,
};

// ─── Print status table ───────────────────────────────────────────────────────

async function printStatusTable(
  ticketsDir: string,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  let queue;
  try {
    queue = await loadTickets(ticketsDir);
  } catch (err) {
    formatAndLogError(err, log);
    return;
  }

  const all = [
    ...queue.errored,
    ...queue.executable,
    ...queue.blocked,
    ...queue.done,
  ].sort((a, b) => {
    const aOrder = STATUS_ORDER[a.ticket.status] ?? 9;
    const bOrder = STATUS_ORDER[b.ticket.status] ?? 9;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.ticket.priority - b.ticket.priority;
  });

  if (all.length === 0) {
    log.warn('No tickets found.');
    return;
  }

  // Read status records for timing data
  const statusMap = new Map<string, TicketStatusRecord | null>();
  for (const loaded of all) {
    try {
      const raw = await readFile(loaded.statusPath, 'utf8');
      statusMap.set(loaded.ticket.id, JSON.parse(raw) as TicketStatusRecord);
    } catch {
      statusMap.set(loaded.ticket.id, null);
    }
  }

  // Resolve effective status: prefer status.json current over ticket.status
  const getEffectiveStatus = (id: string, defaultStatus: TicketStatus): TicketStatus => {
    const rec = statusMap.get(id);
    return rec?.current ?? defaultStatus;
  };

  const headers = ['ID', 'TITLE', 'STATUS', 'PRIORITY', 'DURATION'];
  const rawRows: string[][] = [];
  const coloredRows: string[][] = [];

  for (const loaded of all) {
    const { ticket } = loaded;
    const effectiveStatus = getEffectiveStatus(ticket.id, ticket.status);
    const statusRecord = statusMap.get(ticket.id) ?? null;
    const duration = calcDuration(statusRecord, effectiveStatus);

    rawRows.push([
      ticket.id,
      truncate(ticket.title, 35),
      effectiveStatus,
      String(ticket.priority),
      duration,
    ]);
    coloredRows.push([
      ticket.id,
      truncate(ticket.title, 35),
      colorStatus(effectiveStatus),
      String(ticket.priority),
      duration,
    ]);
  }

  // Calculate column widths from raw (uncolored) rows for accurate alignment
  const widths = headers.map((h, i) => {
    const maxRow = Math.max(...rawRows.map((r) => (r[i] ?? '').length));
    return Math.max(h.length, maxRow);
  });

  log.table(headers, coloredRows, widths);
  log.blank();

  const activeCount = all.filter((lt) => {
    const s = getEffectiveStatus(lt.ticket.id, lt.ticket.status);
    return s === 'be-working' || s === 'fe-working' || s === 'contract-ready';
  }).length;

  log.info(
    `Executable: ${queue.executable.length}  |  ` +
    `Active: ${activeCount}  |  ` +
    `Done: ${queue.done.length}  |  ` +
    `Errored: ${queue.errored.length}  |  ` +
    `Blocked: ${queue.blocked.length}`,
  );
}

// ─── Command ──────────────────────────────────────────────────────────────────

export async function statusCommand(options: {
  config?: string;
  tickets?: string;
  watch?: boolean;
  interval?: string;
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

  if (options.watch) {
    const intervalSecs = parseInt(options.interval ?? '5', 10);
    const intervalMs = (isNaN(intervalSecs) ? 5 : intervalSecs) * 1000;

    process.once('SIGINT', () => {
      process.stdout.write('\n');
      process.exit(0);
    });

    while (true) {
      process.stdout.write('\x1Bc'); // Clear screen
      await printStatusTable(ticketsDir, log);
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }
  } else {
    await printStatusTable(ticketsDir, log);
  }
}

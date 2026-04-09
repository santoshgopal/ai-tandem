/**
 * @module orchestrator/ticket-loader
 *
 * Reads all ticket directories from `tickets_dir`, validates each one,
 * builds a priority-sorted execution queue, and detects dependency issues.
 *
 * Inputs: absolute path to the tickets directory.
 * Outputs: TicketQueue with tickets sorted by priority and categorized by status.
 * Errors: throws TicketReadError, ValidationError, or CircularDependencyError.
 */

import { readdir, readFile, access } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import type { Ticket, TicketStatusRecord } from '../schemas/index.js';
import { validateTicket, validateStatus } from './schema-validator.js';
import { TicketReadError, CircularDependencyError } from './errors.js';

// ─── Exported types ───────────────────────────────────────────────────────────

export interface LoadedTicket {
  ticket: Ticket;
  ticketDir: string;
  contractPath: string;
  statusPath: string;
}

export interface TicketQueue {
  executable: LoadedTicket[];
  blocked: LoadedTicket[];
  done: LoadedTicket[];
  errored: LoadedTicket[];
}

// ─── Circular dependency detection ───────────────────────────────────────────

function detectCycles(tickets: Map<string, Ticket>): void {
  const WHITE = 0; // unvisited
  const GRAY = 1; // in current DFS path
  const BLACK = 2; // fully visited
  const color = new Map<string, number>();
  const path: string[] = [];

  for (const id of tickets.keys()) {
    color.set(id, WHITE);
  }

  function dfs(id: string): void {
    color.set(id, GRAY);
    path.push(id);

    const ticket = tickets.get(id);
    const deps = ticket?.depends_on ?? [];
    for (const dep of deps) {
      if (!tickets.has(dep)) continue; // unknown dep handled separately
      const c = color.get(dep) ?? WHITE;
      if (c === GRAY) {
        const cycleStart = path.indexOf(dep);
        const cycle = [...path.slice(cycleStart), dep];
        throw new CircularDependencyError(cycle);
      }
      if (c === WHITE) {
        dfs(dep);
      }
    }

    path.pop();
    color.set(id, BLACK);
  }

  for (const id of tickets.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE) {
      dfs(id);
    }
  }
}

// ─── Main loader ──────────────────────────────────────────────────────────────

export async function loadTickets(ticketsDir: string): Promise<TicketQueue> {
  // Verify ticketsDir exists
  try {
    await access(ticketsDir);
  } catch {
    throw new TicketReadError(
      `Tickets directory not found: ${ticketsDir}`,
      '<unknown>',
    );
  }

  let entries: Dirent<string>[];
  try {
    entries = await readdir(ticketsDir, { withFileTypes: true, encoding: 'utf8' });
  } catch (err) {
    throw new TicketReadError(
      `Failed to read tickets directory ${ticketsDir}: ${String(err)}`,
      '<unknown>',
    );
  }

  const dirs = entries.filter((e) => e.isDirectory());

  if (dirs.length === 0) {
    return { executable: [], blocked: [], done: [], errored: [] };
  }

  const loadedTickets: LoadedTicket[] = [];
  const ticketMap = new Map<string, Ticket>();

  for (const dir of dirs) {
    const ticketDir = join(ticketsDir, dir.name);
    const ticketPath = join(ticketDir, 'ticket.json');
    const statusPath = join(ticketDir, 'status.json');
    const contractPath = join(ticketDir, 'contract.json');

    let raw: string;
    try {
      raw = await readFile(ticketPath, 'utf8');
    } catch {
      throw new TicketReadError(
        `Could not read ticket.json in directory '${dir.name}'. Expected file at: ${ticketPath}`,
        dir.name,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new TicketReadError(
        `ticket.json in directory '${dir.name}' is not valid JSON`,
        dir.name,
      );
    }

    // Validate (throws ValidationError on failure)
    validateTicket(parsed);
    const ticket: Ticket = parsed;

    if (dir.name !== ticket.id) {
      throw new TicketReadError(
        `Directory name '${dir.name}' does not match ticket id '${ticket.id}'. They must match.`,
        ticket.id,
      );
    }

    ticketMap.set(ticket.id, ticket);
    loadedTickets.push({ ticket, ticketDir, contractPath, statusPath });
  }

  // Validate all depends_on references exist
  for (const { ticket } of loadedTickets) {
    for (const dep of ticket.depends_on ?? []) {
      if (!ticketMap.has(dep)) {
        throw new TicketReadError(
          `Ticket '${ticket.id}' depends on '${dep}', but no directory named '${dep}' exists in ${ticketsDir}`,
          ticket.id,
        );
      }
    }
  }

  // Detect circular dependencies
  detectCycles(ticketMap);

  // Load effective status from status.json for each ticket
  const effectiveStatus = new Map<string, string>();
  for (const loaded of loadedTickets) {
    let statusRaw: string | null = null;
    try {
      statusRaw = await readFile(loaded.statusPath, 'utf8');
    } catch {
      // status.json doesn't exist → treat as queued
    }

    if (statusRaw !== null) {
      let statusParsed: unknown;
      try {
        statusParsed = JSON.parse(statusRaw);
      } catch {
        effectiveStatus.set(loaded.ticket.id, 'queued');
        continue;
      }
      try {
        validateStatus(statusParsed);
        const record = statusParsed as TicketStatusRecord;
        effectiveStatus.set(loaded.ticket.id, record.current);
      } catch {
        effectiveStatus.set(loaded.ticket.id, 'queued');
      }
    } else {
      effectiveStatus.set(loaded.ticket.id, 'queued');
    }
  }

  // Build the queue
  const done: LoadedTicket[] = [];
  const errored: LoadedTicket[] = [];
  const blocked: LoadedTicket[] = [];
  const executable: LoadedTicket[] = [];

  const doneIds = new Set<string>();
  for (const loaded of loadedTickets) {
    const status = effectiveStatus.get(loaded.ticket.id) ?? 'queued';
    if (status === 'done') {
      doneIds.add(loaded.ticket.id);
    }
  }

  for (const loaded of loadedTickets) {
    const status = effectiveStatus.get(loaded.ticket.id) ?? 'queued';

    if (status === 'done') {
      done.push(loaded);
    } else if (status === 'error') {
      errored.push(loaded);
    } else {
      const deps = loaded.ticket.depends_on ?? [];
      const hasUnmetDep = deps.some((dep) => !doneIds.has(dep));
      if (hasUnmetDep) {
        blocked.push(loaded);
      } else {
        executable.push(loaded);
      }
    }
  }

  executable.sort((a, b) => {
    if (a.ticket.priority !== b.ticket.priority) {
      return a.ticket.priority - b.ticket.priority;
    }
    return a.ticket.id.localeCompare(b.ticket.id);
  });

  return { executable, blocked, done, errored };
}

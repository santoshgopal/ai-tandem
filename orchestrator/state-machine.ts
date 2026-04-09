/**
 * @module orchestrator/state-machine
 *
 * Manages the state of a single ticket. Writes status.json atomically.
 * The state machine is the only code that ever writes status.json.
 *
 * Inputs: statusPath (absolute path to status.json), ticketId.
 * Outputs: TicketStatusRecord after each transition or metadata update.
 * Errors: throws InvalidTransitionError for illegal transitions,
 *         StateWriteError if atomic write fails.
 *
 * Atomic write pattern: write to temp file → rename into place.
 * This guarantees status.json is never partially written.
 */

import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type {
  TicketStatus,
  TicketStatusRecord,
  StatusTransition,
  AgentRunMeta,
} from '../schemas/index.js';
import { InvalidTransitionError, StateWriteError } from './errors.js';

// ─── Valid transition map ─────────────────────────────────────────────────────

// Key: `${from}→${to}`, where from is 'null' for the initial transition.
const VALID_TRANSITIONS = new Set<string>([
  'null→queued',
  'queued→be-working',
  'queued→blocked',
  'be-working→contract-ready',
  'be-working→error',
  'contract-ready→fe-working',
  'fe-working→done',
  'fe-working→error',
  'error→queued',
  'blocked→queued',
]);

function transitionKey(from: TicketStatus | null, to: TicketStatus): string {
  return `${from ?? 'null'}→${to}`;
}

// ─── TicketStateMachine ───────────────────────────────────────────────────────

export class TicketStateMachine {
  private cached: TicketStatusRecord | null = null;

  constructor(
    private readonly statusPath: string,
    private readonly ticketId: string,
  ) {}

  /** Read current status from disk. Returns null if status.json does not exist. */
  async read(): Promise<TicketStatusRecord | null> {
    let raw: string;
    try {
      raw = await readFile(this.statusPath, 'utf8');
    } catch {
      return null;
    }
    const parsed = JSON.parse(raw) as TicketStatusRecord;
    this.cached = parsed;
    return parsed;
  }

  /**
   * Transition to a new state. Throws InvalidTransitionError if not valid.
   * Writes status.json atomically. Returns the updated record.
   */
  async transition(
    to: TicketStatus,
    options?: {
      reason?: string;
      beRun?: Partial<AgentRunMeta>;
      feRun?: Partial<AgentRunMeta>;
      prUrls?: { be_pr_url?: string; fe_pr_url?: string };
    },
  ): Promise<TicketStatusRecord> {
    const current = await this.read();
    const from: TicketStatus | null = current?.current ?? null;

    const key = transitionKey(from, to);
    if (!VALID_TRANSITIONS.has(key)) {
      throw new InvalidTransitionError(from, to, this.ticketId);
    }

    const newTransition: StatusTransition = {
      from,
      to,
      at: new Date().toISOString(),
      ...(options?.reason !== undefined ? { reason: options.reason } : {}),
    };

    const baseRecord: TicketStatusRecord = current ?? {
      ticket_id: this.ticketId,
      current: to,
      transitions: [],
    };

    const updated: TicketStatusRecord = {
      ...baseRecord,
      current: to,
      transitions: [...baseRecord.transitions, newTransition],
    };

    if (options?.beRun) {
      updated.be_run = { ...updated.be_run, ...options.beRun } as AgentRunMeta;
    }
    if (options?.feRun) {
      updated.fe_run = { ...updated.fe_run, ...options.feRun } as AgentRunMeta;
    }
    if (options?.prUrls) {
      updated.pr_urls = { ...updated.pr_urls, ...options.prUrls };
    }

    await this.writeAtomic(updated);
    this.cached = updated;
    return updated;
  }

  /**
   * Update agent run metadata without changing state.
   * Used to record mid-run data (started_at, branch, etc.).
   */
  async updateRunMeta(
    role: 'be' | 'fe',
    meta: Partial<AgentRunMeta>,
  ): Promise<TicketStatusRecord> {
    const current = await this.read();
    if (!current) {
      throw new StateWriteError(
        `Cannot update run meta: status.json does not exist for ticket ${this.ticketId}`,
        this.ticketId,
      );
    }

    const updated: TicketStatusRecord = { ...current };
    if (role === 'be') {
      updated.be_run = { ...current.be_run, ...meta } as AgentRunMeta;
    } else {
      updated.fe_run = { ...current.fe_run, ...meta } as AgentRunMeta;
    }

    await this.writeAtomic(updated);
    this.cached = updated;
    return updated;
  }

  /** Get current state. Uses cached value if available; reads disk otherwise. */
  async currentState(): Promise<TicketStatus> {
    if (this.cached !== null) {
      return this.cached.current;
    }
    const record = await this.read();
    if (!record) {
      return 'queued';
    }
    return record.current;
  }

  private async writeAtomic(record: TicketStatusRecord): Promise<void> {
    const hex = randomBytes(8).toString('hex');
    const tmpPath = join(tmpdir(), `tandem-status-${hex}.json`);
    try {
      await writeFile(tmpPath, JSON.stringify(record, null, 2), 'utf8');
      await rename(tmpPath, this.statusPath);
    } catch (err) {
      throw new StateWriteError(
        `Failed to write status.json for ticket ${this.ticketId}: ${String(err)}`,
        this.ticketId,
      );
    }
  }
}

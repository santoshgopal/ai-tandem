/**
 * Unit tests for TicketStateMachine.
 * Uses a temp directory for each test — never writes to the repo.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TicketStateMachine } from '../../orchestrator/state-machine.js';
import { InvalidTransitionError } from '../../orchestrator/errors.js';

let tempDir: string;
let statusPath: string;
const TICKET_ID = 'PROJ-1';

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'tandem-test-'));
  statusPath = join(tempDir, 'status.json');
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ─── read() ───────────────────────────────────────────────────────────────────

describe('TicketStateMachine.read()', () => {
  it('returns null when status.json does not exist', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    const result = await sm.read();
    expect(result).toBeNull();
  });

  it('returns parsed record when status.json exists', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    const result = await sm.read();
    expect(result).not.toBeNull();
    expect(result?.current).toBe('queued');
    expect(result?.ticket_id).toBe(TICKET_ID);
  });
});

// ─── transition() ─────────────────────────────────────────────────────────────

describe('TicketStateMachine.transition()', () => {
  it('creates status.json on first transition (null → queued)', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    const record = await sm.transition('queued');
    expect(record.current).toBe('queued');
    expect(record.transitions).toHaveLength(1);
    expect(record.transitions[0]?.from).toBeNull();
    expect(record.transitions[0]?.to).toBe('queued');
  });

  it('transitions queued → be-working', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    const record = await sm.transition('be-working');
    expect(record.current).toBe('be-working');
    expect(record.transitions).toHaveLength(2);
  });

  it('transitions be-working → contract-ready', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    await sm.transition('be-working');
    const record = await sm.transition('contract-ready');
    expect(record.current).toBe('contract-ready');
  });

  it('transitions contract-ready → fe-working', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    await sm.transition('be-working');
    await sm.transition('contract-ready');
    const record = await sm.transition('fe-working');
    expect(record.current).toBe('fe-working');
  });

  it('transitions fe-working → done', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    await sm.transition('be-working');
    await sm.transition('contract-ready');
    await sm.transition('fe-working');
    const record = await sm.transition('done');
    expect(record.current).toBe('done');
    expect(record.transitions).toHaveLength(5);
  });

  it('transitions be-working → error with reason', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    await sm.transition('be-working');
    const record = await sm.transition('error', { reason: 'Agent timed out' });
    expect(record.current).toBe('error');
    const lastTransition = record.transitions[record.transitions.length - 1];
    expect(lastTransition?.reason).toBe('Agent timed out');
  });

  it('throws InvalidTransitionError for queued → done', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    await expect(sm.transition('done')).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('throws InvalidTransitionError for done → be-working', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    await sm.transition('be-working');
    await sm.transition('contract-ready');
    await sm.transition('fe-working');
    await sm.transition('done');
    await expect(sm.transition('be-working')).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('throws InvalidTransitionError for fe-working → contract-ready', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    await sm.transition('be-working');
    await sm.transition('contract-ready');
    await sm.transition('fe-working');
    await expect(sm.transition('contract-ready')).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
  });

  it('appends to transitions array — does not replace', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    await sm.transition('be-working');
    await sm.transition('contract-ready');
    const record = await sm.read();
    expect(record?.transitions).toHaveLength(3);
  });

  it('each transition has a valid ISO 8601 at timestamp', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    const record = await sm.transition('queued');
    const at = record.transitions[0]?.at ?? '';
    expect(new Date(at).toISOString()).toBe(at);
  });

  it('writes atomically — file is valid JSON after rename completes', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    const raw = await readFile(statusPath, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
    const parsed = JSON.parse(raw) as { current: string };
    expect(parsed.current).toBe('queued');
  });
});

// ─── updateRunMeta() ──────────────────────────────────────────────────────────

describe('TicketStateMachine.updateRunMeta()', () => {
  it('sets be_run.started_at without adding a transition', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    await sm.transition('be-working');
    const before = await sm.read();
    const transitionCount = before?.transitions.length ?? 0;

    await sm.updateRunMeta('be', {
      started_at: '2026-01-01T00:00:00Z',
      completed_at: null,
      exit_code: null,
      retry_count: 0,
      branch: 'tandem/PROJ-1-be',
      commit: null,
    });

    const after = await sm.read();
    expect(after?.transitions).toHaveLength(transitionCount);
    expect(after?.be_run?.started_at).toBe('2026-01-01T00:00:00Z');
  });

  it('sets fe_run.branch without adding a transition', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    await sm.transition('be-working');
    await sm.transition('contract-ready');
    await sm.transition('fe-working');
    const before = await sm.read();
    const transitionCount = before?.transitions.length ?? 0;

    await sm.updateRunMeta('fe', { branch: 'tandem/PROJ-1-fe' });

    const after = await sm.read();
    expect(after?.transitions).toHaveLength(transitionCount);
    expect(after?.fe_run?.branch).toBe('tandem/PROJ-1-fe');
  });

  it('merges partial metadata — does not overwrite unrelated fields', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    await sm.transition('be-working');

    await sm.updateRunMeta('be', {
      started_at: '2026-01-01T00:00:00Z',
      branch: 'tandem/PROJ-1-be',
    });
    await sm.updateRunMeta('be', { retry_count: 1 });

    const record = await sm.read();
    // started_at set in first update should still be present
    expect(record?.be_run?.started_at).toBe('2026-01-01T00:00:00Z');
    expect(record?.be_run?.branch).toBe('tandem/PROJ-1-be');
    expect(record?.be_run?.retry_count).toBe(1);
  });

  it('transitions array length is unchanged after updateRunMeta', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    await sm.transition('be-working');
    const before = await sm.read();

    await sm.updateRunMeta('be', { retry_count: 0 });

    const after = await sm.read();
    expect(after?.transitions).toHaveLength(before?.transitions.length ?? 0);
  });
});

// ─── currentState() ───────────────────────────────────────────────────────────

describe('TicketStateMachine.currentState()', () => {
  it('returns the current state without reading disk again after transition', async () => {
    const sm = new TicketStateMachine(statusPath, TICKET_ID);
    await sm.transition('queued');
    await sm.transition('be-working');
    // currentState() should use cached value
    const state = await sm.currentState();
    expect(state).toBe('be-working');
  });

  it('reads disk if not yet loaded', async () => {
    // Create a fresh state machine pointing to an existing file
    const sm1 = new TicketStateMachine(statusPath, TICKET_ID);
    await sm1.transition('queued');

    // New instance, no cache
    const sm2 = new TicketStateMachine(statusPath, TICKET_ID);
    const state = await sm2.currentState();
    expect(state).toBe('queued');
  });
});

/**
 * Integration tests for the orchestrator in dry-run mode.
 * Does NOT invoke the claude binary. All I/O is on a temp directory.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { loadTickets } from '../../orchestrator/ticket-loader.js';
import { validateTicket } from '../../orchestrator/schema-validator.js';
import { buildBackendPrompt, buildFrontendPrompt } from '../../orchestrator/prompt-builder.js';
import { runLoop } from '../../orchestrator/loop.js';
import type { Ticket, Contract, TandemConfig } from '../../schemas/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..', '..');

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(root, path), 'utf8')) as T;
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let tempDir: string;
let ticketsDir: string;
let ticketDir: string;

const demoTicket = loadJson<Ticket>('examples/tickets/DEMO-1/ticket.json');
const demoContract = loadJson<Contract>('examples/tickets/DEMO-1/contract.json');

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'tandem-integration-'));
  ticketsDir = join(tempDir, 'tickets');
  ticketDir = join(ticketsDir, 'DEMO-1');

  await mkdir(ticketsDir, { recursive: true });
  await mkdir(ticketDir, { recursive: true });

  // Write ticket.json with status reset to 'queued'
  const queued: Ticket = { ...demoTicket, status: 'queued' };
  await writeFile(join(ticketDir, 'ticket.json'), JSON.stringify(queued, null, 2));

  // Write a minimal initial status.json (queued state)
  const initialStatus = {
    ticket_id: 'DEMO-1',
    current: 'queued',
    transitions: [{ from: null, to: 'queued', at: new Date().toISOString() }],
  };
  await writeFile(
    join(ticketDir, 'status.json'),
    JSON.stringify(initialStatus, null, 2),
  );

  // Do NOT write contract.json — dry-run won't wait for it
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('dry-run integration', () => {
  it('loadTickets finds the DEMO-1 ticket and puts it in executable queue', async () => {
    const queue = await loadTickets(ticketsDir);
    expect(queue.executable.length).toBeGreaterThanOrEqual(1);
    const found = queue.executable.find((lt) => lt.ticket.id === 'DEMO-1');
    expect(found).toBeDefined();
  });

  it('validateTicket passes on the DEMO-1 ticket', () => {
    const data: unknown = { ...demoTicket };
    expect(() => validateTicket(data)).not.toThrow();
  });

  it('buildBackendPrompt produces a non-empty string for DEMO-1', () => {
    const contractPath = join(ticketDir, 'contract.json');
    const schemaPath = join(root, 'schemas', 'contract.schema.json');
    const prompt = buildBackendPrompt(demoTicket, contractPath, schemaPath);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(50);
    expect(prompt).toContain('DEMO-1');
  });

  it('buildFrontendPrompt produces a non-empty string for DEMO-1 with its contract', () => {
    const prompt = buildFrontendPrompt(demoTicket, demoContract);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(50);
    expect(prompt).toContain('DEMO-1');
  });

  it('runLoop in dry-run mode returns LoopResult without throwing', async () => {
    const config: TandemConfig = {
      ticket_prefix: 'DEMO',
      be_repo: tempDir,
      fe_repo: tempDir,
      tickets_dir: ticketsDir,
      loop: false,
      max_retries: 0,
      agent_timeout_minutes: 5,
      contract_timeout_minutes: 6,
      claude_model: 'claude-sonnet-4-20250514',
      branch_prefix: 'tandem/',
    };

    const result = await runLoop({
      config,
      ticketsDir,
      dryRun: true,
    });

    expect(result).toHaveProperty('processed');
    expect(result).toHaveProperty('skipped');
    expect(result).toHaveProperty('failed');
    // In dry-run mode, no actual processing happens
    expect(typeof result.processed).toBe('number');
  });

  it('runLoop dry-run does NOT write status.json (in addition to initial one)', async () => {
    const config: TandemConfig = {
      ticket_prefix: 'DEMO',
      be_repo: tempDir,
      fe_repo: tempDir,
      tickets_dir: ticketsDir,
      loop: false,
      max_retries: 0,
      agent_timeout_minutes: 5,
      contract_timeout_minutes: 6,
      claude_model: 'claude-sonnet-4-20250514',
      branch_prefix: 'tandem/',
    };

    // Run dry-run loop
    await runLoop({ config, ticketsDir, dryRun: true });

    // Status file should still be at the initial 'queued' state
    // (dry-run must not write new transitions)
    const raw = readFileSync(join(ticketDir, 'status.json'), 'utf8');
    const status = JSON.parse(raw) as { current: string };
    expect(status.current).toBe('queued');
  });

  it('runLoop dry-run does NOT write audit files', async () => {
    const config: TandemConfig = {
      ticket_prefix: 'DEMO',
      be_repo: tempDir,
      fe_repo: tempDir,
      tickets_dir: ticketsDir,
      loop: false,
      max_retries: 0,
      agent_timeout_minutes: 5,
      contract_timeout_minutes: 6,
      claude_model: 'claude-sonnet-4-20250514',
      branch_prefix: 'tandem/',
    };

    await runLoop({ config, ticketsDir, dryRun: true });

    // Audit files must not exist in dry-run mode
    await expect(access(join(ticketDir, 'be_audit.md'))).rejects.toThrow();
    await expect(access(join(ticketDir, 'fe_audit.md'))).rejects.toThrow();
  });
});

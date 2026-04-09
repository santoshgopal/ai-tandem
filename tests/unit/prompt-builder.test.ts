/**
 * Unit tests for prompt-builder.
 * Uses DEMO-1 ticket and contract as fixtures.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBackendPrompt,
  buildFrontendPrompt,
} from '../../orchestrator/prompt-builder.js';
import type { Ticket, Contract } from '../../schemas/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..', '..');

function loadFixture<T>(path: string): T {
  return JSON.parse(readFileSync(join(root, path), 'utf8')) as T;
}

const ticket = loadFixture<Ticket>('examples/tickets/DEMO-1/ticket.json');
const contract = loadFixture<Contract>('examples/tickets/DEMO-1/contract.json');

const CONTRACT_OUTPUT_PATH = '/tmp/tickets/DEMO-1/contract.json';
const CONTRACT_SCHEMA_PATH = '/path/to/schemas/contract.schema.json';

// ─── buildBackendPrompt ───────────────────────────────────────────────────────

describe('buildBackendPrompt', () => {
  it('includes TICKET_ID in output', () => {
    const prompt = buildBackendPrompt(ticket, CONTRACT_OUTPUT_PATH, CONTRACT_SCHEMA_PATH);
    expect(prompt).toContain(ticket.id);
  });

  it('includes TICKET_TITLE in output', () => {
    const prompt = buildBackendPrompt(ticket, CONTRACT_OUTPUT_PATH, CONTRACT_SCHEMA_PATH);
    expect(prompt).toContain(ticket.title);
  });

  it('includes BE_SCOPE in output', () => {
    const prompt = buildBackendPrompt(ticket, CONTRACT_OUTPUT_PATH, CONTRACT_SCHEMA_PATH);
    expect(prompt).toContain(ticket.be_scope);
  });

  it('includes user_story in output', () => {
    const prompt = buildBackendPrompt(ticket, CONTRACT_OUTPUT_PATH, CONTRACT_SCHEMA_PATH);
    expect(prompt).toContain(ticket.user_story);
  });

  it('formats acceptance array as bullet list', () => {
    const prompt = buildBackendPrompt(ticket, CONTRACT_OUTPUT_PATH, CONTRACT_SCHEMA_PATH);
    for (const item of ticket.acceptance) {
      expect(prompt).toContain(`- ${item}`);
    }
  });

  it('formats be_constraints as bullet list', () => {
    const prompt = buildBackendPrompt(ticket, CONTRACT_OUTPUT_PATH, CONTRACT_SCHEMA_PATH);
    for (const constraint of ticket.be_constraints ?? []) {
      expect(prompt).toContain(`- ${constraint}`);
    }
  });

  it('uses fallback text when be_hints is empty', () => {
    const ticketNoHints: Ticket = { ...ticket, be_hints: [] };
    const prompt = buildBackendPrompt(
      ticketNoHints,
      CONTRACT_OUTPUT_PATH,
      CONTRACT_SCHEMA_PATH,
    );
    expect(prompt).toContain('No additional hints.');
  });

  it('includes CONTRACT_OUTPUT_PATH in output', () => {
    const prompt = buildBackendPrompt(ticket, CONTRACT_OUTPUT_PATH, CONTRACT_SCHEMA_PATH);
    expect(prompt).toContain(CONTRACT_OUTPUT_PATH);
  });

  it('includes CLAUDE-shared.md content in output', () => {
    const prompt = buildBackendPrompt(ticket, CONTRACT_OUTPUT_PATH, CONTRACT_SCHEMA_PATH);
    // The shared template contains this distinctive phrase
    expect(prompt).toContain('You are a tandem agent');
  });

  it('does not contain unresolved {{CONTRACT_JSON}} token', () => {
    const prompt = buildBackendPrompt(ticket, CONTRACT_OUTPUT_PATH, CONTRACT_SCHEMA_PATH);
    // CONTRACT_JSON is FE-only and must not appear unreplaced in BE output
    expect(prompt).not.toContain('{{CONTRACT_JSON}}');
  });

  it('produces a non-empty string', () => {
    const prompt = buildBackendPrompt(ticket, CONTRACT_OUTPUT_PATH, CONTRACT_SCHEMA_PATH);
    expect(prompt.length).toBeGreaterThan(100);
  });
});

// ─── buildFrontendPrompt ──────────────────────────────────────────────────────

describe('buildFrontendPrompt', () => {
  it('includes CONTRACT_JSON serialized as pretty JSON', () => {
    const prompt = buildFrontendPrompt(ticket, contract);
    expect(prompt).toContain(JSON.stringify(contract, null, 2));
  });

  it('includes FE_SCOPE in output', () => {
    const prompt = buildFrontendPrompt(ticket, contract);
    expect(prompt).toContain(ticket.fe_scope);
  });

  it('includes fe_constraints as bullet list', () => {
    const prompt = buildFrontendPrompt(ticket, contract);
    for (const constraint of ticket.fe_constraints ?? []) {
      expect(prompt).toContain(`- ${constraint}`);
    }
  });

  it('uses fallback text when fe_hints is empty', () => {
    const ticketNoHints: Ticket = { ...ticket, fe_hints: [] };
    const prompt = buildFrontendPrompt(ticketNoHints, contract);
    expect(prompt).toContain('No additional hints.');
  });

  it('includes the full contract endpoint list in JSON output', () => {
    const prompt = buildFrontendPrompt(ticket, contract);
    // The first endpoint path should appear in the contract JSON
    const firstEndpoint = contract.endpoints[0];
    if (firstEndpoint) {
      expect(prompt).toContain(firstEndpoint.path);
    }
  });

  it('does not contain unresolved {{BE_SCOPE}} token', () => {
    const prompt = buildFrontendPrompt(ticket, contract);
    expect(prompt).not.toContain('{{BE_SCOPE}}');
  });

  it('produces a non-empty string', () => {
    const prompt = buildFrontendPrompt(ticket, contract);
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('includes shared rules (You are a tandem agent)', () => {
    const prompt = buildFrontendPrompt(ticket, contract);
    expect(prompt).toContain('You are a tandem agent');
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('prompt-builder edge cases', () => {
  it('handles a ticket with all optional arrays populated', () => {
    const fullTicket: Ticket = {
      ...ticket,
      be_constraints: ['Constraint 1', 'Constraint 2'],
      be_hints: ['Hint 1', 'Hint 2'],
      fe_constraints: ['FE Constraint 1'],
      fe_hints: ['FE Hint 1'],
    };
    const bePrompt = buildBackendPrompt(
      fullTicket,
      CONTRACT_OUTPUT_PATH,
      CONTRACT_SCHEMA_PATH,
    );
    expect(bePrompt).toContain('- Constraint 1');
    expect(bePrompt).toContain('- Constraint 2');
    expect(bePrompt).toContain('- Hint 1');

    const fePrompt = buildFrontendPrompt(fullTicket, contract);
    expect(fePrompt).toContain('- FE Constraint 1');
    expect(fePrompt).toContain('- FE Hint 1');
  });

  it('handles a ticket with all optional arrays empty', () => {
    const minimalTicket: Ticket = {
      ...ticket,
      be_constraints: [],
      be_hints: [],
      fe_constraints: [],
      fe_hints: [],
    };
    const bePrompt = buildBackendPrompt(
      minimalTicket,
      CONTRACT_OUTPUT_PATH,
      CONTRACT_SCHEMA_PATH,
    );
    expect(bePrompt).toContain('No additional constraints.');
    expect(bePrompt).toContain('No additional hints.');

    const fePrompt = buildFrontendPrompt(minimalTicket, contract);
    expect(fePrompt).toContain('No additional constraints.');
    expect(fePrompt).toContain('No additional hints.');
  });

  it('single-item arrays still render as bullet lists', () => {
    const ticketOneConstraint: Ticket = {
      ...ticket,
      be_constraints: ['Only one constraint'],
    };
    const prompt = buildBackendPrompt(
      ticketOneConstraint,
      CONTRACT_OUTPUT_PATH,
      CONTRACT_SCHEMA_PATH,
    );
    expect(prompt).toContain('- Only one constraint');
  });
});

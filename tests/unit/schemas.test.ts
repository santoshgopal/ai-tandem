/**
 * Unit tests for schema validation functions.
 * Verifies that each validator correctly accepts valid data and rejects invalid data.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateTicket,
  validateContract,
  validateConfig,
  validateStatus,
} from '../../orchestrator/schema-validator.js';
import { ValidationError } from '../../orchestrator/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..', '..');

function loadFixture(path: string): unknown {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

// ─── validateTicket ───────────────────────────────────────────────────────────

describe('validateTicket', () => {
  it('accepts a valid minimal ticket', () => {
    const data = loadFixture('tests/fixtures/ticket.valid.json');
    expect(() => validateTicket(data)).not.toThrow();
  });

  it('accepts a fully populated ticket', () => {
    const data = loadFixture('examples/tickets/DEMO-1/ticket.json');
    expect(() => validateTicket(data)).not.toThrow();
  });

  it('rejects missing required field: id', () => {
    const data = { ...loadFixture('tests/fixtures/ticket.valid.json') as object };
    delete (data as Record<string, unknown>)['id'];
    expect(() => validateTicket(data)).toThrow(ValidationError);
  });

  it('rejects invalid status enum value', () => {
    const data = {
      ...(loadFixture('tests/fixtures/ticket.valid.json') as object),
      status: 'in-progress',
    };
    expect(() => validateTicket(data)).toThrow(ValidationError);
  });

  it('rejects priority below minimum (< 1)', () => {
    const data = {
      ...(loadFixture('tests/fixtures/ticket.valid.json') as object),
      priority: 0,
    };
    expect(() => validateTicket(data)).toThrow(ValidationError);
  });

  it('rejects empty acceptance array', () => {
    const data = {
      ...(loadFixture('tests/fixtures/ticket.valid.json') as object),
      acceptance: [],
    };
    expect(() => validateTicket(data)).toThrow(ValidationError);
  });

  it('rejects id not matching pattern (lowercase)', () => {
    const data = {
      ...(loadFixture('tests/fixtures/ticket.valid.json') as object),
      id: 'proj-1',
    };
    expect(() => validateTicket(data)).toThrow(ValidationError);
  });

  it('throws ValidationError with errors array', () => {
    const data = { id: 'proj-1', status: 'bad', priority: 0 };
    try {
      validateTicket(data);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).errors).toBeInstanceOf(Array);
      expect((err as ValidationError).errors.length).toBeGreaterThan(0);
    }
  });

  it('type-narrows to Ticket after validation passes', () => {
    const data: unknown = loadFixture('tests/fixtures/ticket.valid.json');
    validateTicket(data);
    // After the assert, TypeScript narrows data to Ticket
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('be_scope');
  });
});

// ─── validateContract ─────────────────────────────────────────────────────────

describe('validateContract', () => {
  it('accepts a valid minimal contract', () => {
    const data = loadFixture('tests/fixtures/contract.valid.json');
    expect(() => validateContract(data)).not.toThrow();
  });

  it('accepts a fully populated contract', () => {
    const data = loadFixture('examples/tickets/DEMO-1/contract.json');
    expect(() => validateContract(data)).not.toThrow();
  });

  it('rejects missing ticket_id', () => {
    const data = {
      ...(loadFixture('tests/fixtures/contract.valid.json') as object),
    };
    delete (data as Record<string, unknown>)['ticket_id'];
    expect(() => validateContract(data)).toThrow(ValidationError);
  });

  it('rejects empty endpoints array', () => {
    const data = {
      ...(loadFixture('tests/fixtures/contract.valid.json') as object),
      endpoints: [],
    };
    expect(() => validateContract(data)).toThrow(ValidationError);
  });

  it('rejects endpoint with invalid HTTP method', () => {
    const base = loadFixture('tests/fixtures/contract.valid.json') as Record<string, unknown>;
    const endpoints = (base['endpoints'] as unknown[]).slice();
    const firstEndpoint = { ...(endpoints[0] as object), method: 'FETCH' };
    endpoints[0] = firstEndpoint;
    const data = { ...base, endpoints };
    expect(() => validateContract(data)).toThrow(ValidationError);
  });

  it('throws ValidationError on invalid data', () => {
    const data = { ticket_id: 'proj-1', be_commit: 'abc', generated_at: 'not-a-date' };
    expect(() => validateContract(data)).toThrow(ValidationError);
  });
});

// ─── validateStatus ───────────────────────────────────────────────────────────

describe('validateStatus', () => {
  it('accepts a valid done status record', () => {
    const data = loadFixture('examples/tickets/DEMO-1/status.json');
    expect(() => validateStatus(data)).not.toThrow();
  });

  it('accepts a status with empty transitions array', () => {
    // transitions CAN be empty — schema has no minItems
    const data = {
      ticket_id: 'PROJ-1',
      current: 'queued',
      transitions: [],
    };
    expect(() => validateStatus(data)).not.toThrow();
  });

  it('rejects unknown status enum value', () => {
    const data = {
      ticket_id: 'PROJ-1',
      current: 'in-progress',
      transitions: [],
    };
    expect(() => validateStatus(data)).toThrow(ValidationError);
  });

  it('rejects missing ticket_id', () => {
    const data = {
      current: 'queued',
      transitions: [],
    };
    expect(() => validateStatus(data)).toThrow(ValidationError);
  });

  it('rejects invalid ticket_id pattern', () => {
    const data = {
      ticket_id: 'proj-1',
      current: 'queued',
      transitions: [],
    };
    expect(() => validateStatus(data)).toThrow(ValidationError);
  });
});

// ─── validateConfig ───────────────────────────────────────────────────────────

describe('validateConfig', () => {
  it('accepts a valid config with only required fields', () => {
    const data = {
      ticket_prefix: 'PROJ',
      be_repo: '../api',
      fe_repo: '../web',
      tickets_dir: './tickets',
    };
    expect(() => validateConfig(data)).not.toThrow();
  });

  it('rejects missing ticket_prefix', () => {
    const data = {
      be_repo: '../api',
      fe_repo: '../web',
      tickets_dir: './tickets',
    };
    expect(() => validateConfig(data)).toThrow(ValidationError);
  });

  it('rejects ticket_prefix with lowercase letters', () => {
    const data = {
      ticket_prefix: 'proj',
      be_repo: '../api',
      fe_repo: '../web',
      tickets_dir: './tickets',
    };
    expect(() => validateConfig(data)).toThrow(ValidationError);
  });

  it('rejects max_retries above 5', () => {
    const data = {
      ticket_prefix: 'PROJ',
      be_repo: '../api',
      fe_repo: '../web',
      tickets_dir: './tickets',
      max_retries: 6,
    };
    expect(() => validateConfig(data)).toThrow(ValidationError);
  });
});

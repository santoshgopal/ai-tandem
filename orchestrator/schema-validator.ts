/**
 * @module orchestrator/schema-validator
 *
 * Singleton AJV instance pre-loaded with all four tandem schemas.
 * Provides typed assertion functions used by ticket-loader and contract-watcher.
 *
 * Inputs: raw `unknown` values parsed from JSON files.
 * Outputs: typed assertion (narrows to the correct interface if valid).
 * Errors: throws ValidationError if validation fails.
 *
 * Schemas are read once at module load time from schemas/*.schema.json
 * relative to this file's location, so the module works from both src/ and dist/.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { ValidationError } from './errors.js';
import type {
  Ticket,
  Contract,
  TandemConfig,
  TicketStatusRecord,
} from '../schemas/index.js';

// ─── AJV setup ────────────────────────────────────────────────────────────────

// strict: false to allow draft-07 schemas with $defs and $ref+sibling keywords
const ajv = new Ajv({ allErrors: true, strict: false });
// ajv-formats uses a CJS default export; cast to handle ESM interop mismatch
(addFormats as unknown as (instance: Ajv) => void)(ajv);

// Resolve the schemas directory relative to this compiled file's location.
// Works from both src/ (tsx) and dist/ (compiled JS) because we use import.meta.url.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemasDir = join(__dirname, '..', 'schemas');

function loadSchema(filename: string): object {
  const raw = readFileSync(join(schemasDir, filename), 'utf8');
  return JSON.parse(raw) as object;
}

const ticketSchema = loadSchema('ticket.schema.json');
const contractSchema = loadSchema('contract.schema.json');
const configSchema = loadSchema('config.schema.json');
const statusSchema = loadSchema('status.schema.json');

ajv.addSchema(ticketSchema);
ajv.addSchema(contractSchema);
ajv.addSchema(configSchema);
ajv.addSchema(statusSchema);

// ─── Internal helper ──────────────────────────────────────────────────────────

/**
 * Validates `data` against the schema identified by `schemaId`.
 * Throws ValidationError if validation fails.
 * `label` is used in error messages to identify what is being validated.
 */
export function validate(schemaId: string, data: unknown, label: string): void {
  const validator = ajv.getSchema(schemaId);
  if (!validator) {
    throw new ValidationError(`No schema registered for id: ${schemaId}`, []);
  }
  const valid = validator(data);
  if (!valid) {
    const errs = validator.errors ?? [];
    const first3 = errs.slice(0, 3).map((e) => {
      const path = e.instancePath || '/';
      return `  ${path}: ${e.message ?? 'unknown error'}`;
    });
    const total = errs.length;
    const extra = total > 3 ? ` (and ${total - 3} more)` : '';
    const message = `${label} failed schema validation:\n${first3.join('\n')}${extra}`;
    throw new ValidationError(message, errs as unknown[]);
  }
}

// ─── Public assertion functions ───────────────────────────────────────────────

export function validateTicket(data: unknown): asserts data is Ticket {
  validate(
    'https://github.com/santoshgopal/ai-tandem/schemas/ticket.schema.json',
    data,
    'Ticket',
  );
}

export function validateContract(data: unknown): asserts data is Contract {
  validate(
    'https://github.com/santoshgopal/ai-tandem/schemas/contract.schema.json',
    data,
    'Contract',
  );
}

export function validateConfig(data: unknown): asserts data is TandemConfig {
  validate(
    'https://github.com/santoshgopal/ai-tandem/schemas/config.schema.json',
    data,
    'TandemConfig',
  );
}

export function validateStatus(data: unknown): asserts data is TicketStatusRecord {
  validate(
    'https://github.com/santoshgopal/ai-tandem/schemas/status.schema.json',
    data,
    'TicketStatusRecord',
  );
}

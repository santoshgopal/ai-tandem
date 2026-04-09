#!/usr/bin/env tsx
/**
 * Validates all fixture and example JSON files against their schemas.
 * Run with: npm run validate-schemas
 * Used in CI to catch schema regressions.
 *
 * Exit 0 if all checks pass. Exit 1 if any check fails.
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateTicket,
  validateContract,
  validateStatus,
} from '../orchestrator/schema-validator.js';
import { isTandemError, ValidationError } from '../orchestrator/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

// ─── Check helper ─────────────────────────────────────────────────────────────

type Validator = (data: unknown) => void;

interface CheckResult {
  passed: boolean;
  message: string;
}

async function check(
  filePath: string,
  validator: Validator,
  expectValid: boolean,
): Promise<CheckResult> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return { passed: false, message: `Could not read file: ${filePath}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    if (!expectValid) {
      return { passed: true, message: '✓ correctly invalid (not valid JSON)' };
    }
    return { passed: false, message: 'File is not valid JSON' };
  }

  try {
    validator(parsed);
    // Validation passed
    if (expectValid) {
      return { passed: true, message: '✓ valid' };
    } else {
      return { passed: false, message: 'Expected invalid but schema validation passed' };
    }
  } catch (err) {
    if (isTandemError(err) && err instanceof ValidationError) {
      if (!expectValid) {
        return { passed: true, message: '✓ correctly invalid' };
      }
      return { passed: false, message: `Validation failed: ${err.message}` };
    }
    // Unexpected error
    return { passed: false, message: `Unexpected error: ${String(err)}` };
  }
}

// ─── Checks ───────────────────────────────────────────────────────────────────

interface CheckSpec {
  filePath: string;
  label: string;
  schemaLabel: string;
  validator: Validator;
  expectValid: boolean;
}

const checks: CheckSpec[] = [
  {
    filePath: join(root, 'tests/fixtures/ticket.valid.json'),
    label: 'tests/fixtures/ticket.valid.json',
    schemaLabel: 'ticket',
    validator: validateTicket,
    expectValid: true,
  },
  {
    filePath: join(root, 'tests/fixtures/ticket.invalid.json'),
    label: 'tests/fixtures/ticket.invalid.json',
    schemaLabel: 'ticket',
    validator: validateTicket,
    expectValid: false,
  },
  {
    filePath: join(root, 'tests/fixtures/contract.valid.json'),
    label: 'tests/fixtures/contract.valid.json',
    schemaLabel: 'contract',
    validator: validateContract,
    expectValid: true,
  },
  {
    filePath: join(root, 'examples/tickets/DEMO-1/ticket.json'),
    label: 'examples/tickets/DEMO-1/ticket.json',
    schemaLabel: 'ticket',
    validator: validateTicket,
    expectValid: true,
  },
  {
    filePath: join(root, 'examples/tickets/DEMO-1/contract.json'),
    label: 'examples/tickets/DEMO-1/contract.json',
    schemaLabel: 'contract',
    validator: validateContract,
    expectValid: true,
  },
  {
    filePath: join(root, 'examples/tickets/DEMO-1/status.json'),
    label: 'examples/tickets/DEMO-1/status.json',
    schemaLabel: 'status',
    validator: validateStatus,
    expectValid: true,
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Validating fixtures...\n');

  const results: Array<{ spec: CheckSpec; result: CheckResult }> = [];

  for (const spec of checks) {
    const result = await check(spec.filePath, spec.validator, spec.expectValid);
    results.push({ spec, result });
  }

  // Print table
  for (const { spec, result } of results) {
    const icon = result.passed ? '✓ ' : '✗ ';
    const label = spec.label.padEnd(52);
    const schema = `[${spec.schemaLabel}]`.padEnd(12);
    console.log(`${icon} ${label} ${schema} ${result.message}`);
  }

  const passed = results.filter((r) => r.result.passed).length;
  const total = results.length;
  console.log(`\n${passed}/${total} checks passed.`);

  if (passed < total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('validate-fixtures crashed:', err);
  process.exit(1);
});

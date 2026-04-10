/**
 * @module orchestrator/contract-watcher
 *
 * Watches for contract.json to appear at a given path.
 * Returns a Promise that resolves when the file appears AND is valid JSON
 * matching the contract schema. Rejects on timeout or persistent validation failure.
 *
 * Inputs: contractPath (absolute), ticketId, timeoutMinutes.
 * Outputs: validated Contract object.
 * Errors: throws ContractTimeoutError on timeout, ContractValidationError after 3 failed attempts.
 *
 * Uses chokidar with awaitWriteFinish to avoid reading partial files.
 */

import { access, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import chokidar from 'chokidar';
import { validateContract } from './schema-validator.js';
import {
  ContractTimeoutError,
  ContractValidationError,
  ValidationError,
} from './errors.js';
import type { Contract } from '../schemas/index.js';

// ─── Watcher ──────────────────────────────────────────────────────────────────

export async function waitForContract(
  contractPath: string,
  ticketId: string,
  timeoutMinutes: number,
): Promise<Contract> {
  // Fast path: file already exists — validate and return immediately.
  // If the file exists but fails validation, throw right away rather than
  // falling through to the watcher (which would block forever on a stable file).
  try {
    await access(contractPath);
    // File exists — attempt to read and validate
    const raw = await readFile(contractPath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ContractValidationError(
        `contract.json contains invalid JSON for ticket ${ticketId}`,
        ticketId,
        [],
      );
    }
    try {
      validateContract(parsed);
      return parsed as Contract;
    } catch (err) {
      const errors = err instanceof ValidationError ? err.errors : [];
      throw new ContractValidationError(
        `contract.json failed schema validation for ticket ${ticketId}`,
        ticketId,
        errors,
      );
    }
  } catch (err) {
    // Re-throw ContractValidationError — file exists but is invalid
    if (err instanceof ContractValidationError) throw err;
    // Otherwise file doesn't exist yet — fall through to watcher
  }

  const dir = dirname(contractPath);
  const timeoutMs = timeoutMinutes * 60 * 1000;

  return new Promise<Contract>((resolve, reject) => {
    let validationAttempts = 0;
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const watcher = chokidar.watch(dir, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    function cleanup(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      void watcher.close();
    }

    async function tryValidate(): Promise<void> {
      if (settled) return;

      let raw: string;
      try {
        raw = await readFile(contractPath, 'utf8');
      } catch {
        // File not readable yet — wait for next event
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        validationAttempts++;
        if (validationAttempts >= 3) {
          settled = true;
          cleanup();
          reject(
            new ContractValidationError(
              `contract.json contains invalid JSON after 3 attempts for ticket ${ticketId}`,
              ticketId,
              [],
            ),
          );
        }
        return;
      }

      try {
        validateContract(parsed);
        settled = true;
        cleanup();
        resolve(parsed as Contract);
      } catch (err) {
        validationAttempts++;
        if (validationAttempts >= 3) {
          settled = true;
          cleanup();
          const errors = err instanceof ValidationError ? err.errors : [];
          reject(
            new ContractValidationError(
              `contract.json failed schema validation after 3 attempts for ticket ${ticketId}`,
              ticketId,
              errors,
            ),
          );
        }
        // Otherwise wait for next write event (agent may still be writing)
      }
    }

    // Timeout
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new ContractTimeoutError(ticketId, timeoutMinutes));
    }, timeoutMs);

    // Watcher ready — do one final check in case the file appeared between
    // the fast-path access() check and now (closes the setup race window)
    watcher.on('ready', () => {
      void tryValidate();
    });

    watcher.on('add', (filePath: string) => {
      if (filePath === contractPath) void tryValidate();
    });

    watcher.on('change', (filePath: string) => {
      if (filePath === contractPath) void tryValidate();
    });

    watcher.on('error', (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });
  });
}

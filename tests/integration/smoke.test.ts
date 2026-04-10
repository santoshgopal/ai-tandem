/**
 * Smoke tests for the built CLI binary.
 * Runs against dist/cli/index.js — requires `npm run build` first.
 *
 * Run with: npm run test:smoke
 * Not included in the default `npm test` run because it requires a build artifact.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..', '..');
const bin = join(root, 'dist', 'cli', 'index.js');

function run(args: string[]): { stdout: string; stderr: string; code: number } {
  const result = spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    cwd: join(root, 'tests'), // cwd with no .tandem dir
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    code: result.status ?? 1,
  };
}

describe('CLI smoke tests (built binary)', () => {
  it('--version prints version and exits 0', () => {
    const { stdout, code } = run(['--version']);
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('--help lists all 7 commands and exits 0', () => {
    const { stdout, code } = run(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('init');
    expect(stdout).toContain('run');
    expect(stdout).toContain('status');
    expect(stdout).toContain('validate');
    expect(stdout).toContain('new-ticket');
    expect(stdout).toContain('pause');
    expect(stdout).toContain('resume');
  });

  it('validate with no config exits 1 with CONFIG_NOT_FOUND', () => {
    const { stderr, code } = run(['validate']);
    expect(code).toBe(1);
    expect(stderr).toContain('CONFIG_NOT_FOUND');
  });

  it('status with no config exits 1 with CONFIG_NOT_FOUND', () => {
    const { stderr, code } = run(['status']);
    expect(code).toBe(1);
    expect(stderr).toContain('CONFIG_NOT_FOUND');
  });

  it('run with no config exits 1 with CONFIG_NOT_FOUND', () => {
    const { stderr, code } = run(['run']);
    expect(code).toBe(1);
    expect(stderr).toContain('CONFIG_NOT_FOUND');
  });

  it('pause with no config exits 1 with CONFIG_NOT_FOUND', () => {
    const { stderr, code } = run(['pause']);
    expect(code).toBe(1);
    expect(stderr).toContain('CONFIG_NOT_FOUND');
  });

  it('resume with no config exits 1 with CONFIG_NOT_FOUND', () => {
    const { stderr, code } = run(['resume']);
    expect(code).toBe(1);
    expect(stderr).toContain('CONFIG_NOT_FOUND');
  });
});

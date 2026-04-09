/**
 * Unit tests for CLI modules: logger, config-loader, error-formatter.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createLogger } from '../../cli/logger.js';
import { writeConfig, loadConfigFromPath, discoverConfig } from '../../cli/config-loader.js';
import { formatAndLogError } from '../../cli/error-formatter.js';
import {
  ValidationError,
  AgentRunError,
  ContractTimeoutError,
  MaxRetriesExceededError,
  CircularDependencyError,
  TandemError,
} from '../../orchestrator/errors.js';
import type { Logger } from '../../types/logger.interface.js';
import type { TandemConfig } from '../../schemas/index.js';

// ─── Logger tests ─────────────────────────────────────────────────────────────

describe('logger', () => {
  let stdoutData: string;
  let stderrData: string;
  let origStdout: typeof process.stdout.write;
  let origStderr: typeof process.stderr.write;

  beforeEach(() => {
    stdoutData = '';
    stderrData = '';
    origStdout = process.stdout.write.bind(process.stdout);
    origStderr = process.stderr.write.bind(process.stderr);
    process.stdout.write = (data: string | Uint8Array): boolean => {
      stdoutData += typeof data === 'string' ? data : data.toString();
      return true;
    };
    process.stderr.write = (data: string | Uint8Array): boolean => {
      stderrData += typeof data === 'string' ? data : data.toString();
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
  });

  it('createLogger returns an object with all required methods', () => {
    const log = createLogger();
    expect(typeof log.info).toBe('function');
    expect(typeof log.success).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.agent).toBe('function');
    expect(typeof log.phase).toBe('function');
    expect(typeof log.dryRun).toBe('function');
    expect(typeof log.blank).toBe('function');
    expect(typeof log.table).toBe('function');
    expect(typeof log.isTTY).toBe('boolean');
  });

  it('log.success writes to stdout', () => {
    const log = createLogger();
    log.success('All good');
    expect(stdoutData).toContain('All good');
  });

  it('log.error writes to stderr', () => {
    const log = createLogger();
    log.error('Something failed');
    expect(stderrData).toContain('Something failed');
    expect(stdoutData).not.toContain('Something failed');
  });

  it('log.table renders headers and rows', () => {
    const log = createLogger();
    log.table(['ID', 'STATUS'], [['PROJ-1', 'queued'], ['PROJ-2', 'done']]);
    expect(stdoutData).toContain('ID');
    expect(stdoutData).toContain('STATUS');
    expect(stdoutData).toContain('PROJ-1');
    expect(stdoutData).toContain('queued');
    expect(stdoutData).toContain('PROJ-2');
    expect(stdoutData).toContain('done');
    // Separator line
    expect(stdoutData).toContain('─');
  });

  it('log.table truncates cells exceeding column width', () => {
    const log = createLogger();
    log.table(['NAME'], [['short']], [3]);
    expect(stdoutData).toContain('…');
  });

  it('log.agent prefixes with [BE] for be role', () => {
    const log = createLogger();
    log.agent('be', 'backend message');
    expect(stdoutData).toContain('[BE]');
    expect(stdoutData).toContain('backend message');
  });

  it('log.agent prefixes with [FE] for fe role', () => {
    const log = createLogger();
    log.agent('fe', 'frontend message');
    expect(stdoutData).toContain('[FE]');
    expect(stdoutData).toContain('frontend message');
  });

  it('quiet mode suppresses info but not success', () => {
    const log = createLogger({ quiet: true });
    log.info('suppressed info');
    log.success('visible success');
    expect(stdoutData).not.toContain('suppressed info');
    expect(stdoutData).toContain('visible success');
  });

  it('quiet mode suppresses agent output', () => {
    const log = createLogger({ quiet: true });
    log.agent('be', 'suppressed agent output');
    expect(stdoutData).not.toContain('suppressed agent output');
  });
});

// ─── Config-loader tests ──────────────────────────────────────────────────────

describe('config-loader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'tandem-cli-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const makeMinimalConfig = (overrides?: Partial<TandemConfig>): TandemConfig => ({
    ticket_prefix: 'TEST',
    be_repo: tempDir,
    fe_repo: tempDir,
    tickets_dir: tempDir,
    ...overrides,
  });

  it('writeConfig creates .tandem/config.json', async () => {
    const configDir = join(tempDir, '.tandem');
    const config = makeMinimalConfig();
    const written = await writeConfig(configDir, config);
    expect(written).toBe(join(configDir, 'config.json'));
  });

  it('writeConfig creates the directory if it does not exist', async () => {
    const configDir = join(tempDir, 'nested', '.tandem');
    const config = makeMinimalConfig();
    await expect(writeConfig(configDir, config)).resolves.toBeDefined();
  });

  it('loadConfigFromPath reads and validates a written config', async () => {
    const configDir = join(tempDir, '.tandem');
    const config = makeMinimalConfig();
    const written = await writeConfig(configDir, config);
    const resolved = await loadConfigFromPath(written);
    expect(resolved.config.ticket_prefix).toBe('TEST');
    expect(resolved.configPath).toBe(written);
  });

  it('loadConfigFromPath throws TandemError on missing file', async () => {
    await expect(
      loadConfigFromPath(join(tempDir, 'nonexistent', 'config.json')),
    ).rejects.toMatchObject({ code: 'CONFIG_READ_ERROR' });
  });

  it('loadConfigFromPath throws ValidationError on invalid config', async () => {
    const { writeFile } = await import('node:fs/promises');
    const configDir = join(tempDir, '.tandem');
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({ invalid: true }),
      'utf8',
    );
    await expect(loadConfigFromPath(join(configDir, 'config.json'))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('discoverConfig finds config.json in cwd', async () => {
    const configDir = join(tempDir, '.tandem');
    const config = makeMinimalConfig();
    await writeConfig(configDir, config);
    const resolved = await discoverConfig(tempDir);
    expect(resolved.config.ticket_prefix).toBe('TEST');
  });

  it('discoverConfig finds config.json in parent directory', async () => {
    const configDir = join(tempDir, '.tandem');
    const config = makeMinimalConfig();
    await writeConfig(configDir, config);
    // Start search from a child directory
    const childDir = join(tempDir, 'subdir');
    await mkdir(childDir, { recursive: true });
    const resolved = await discoverConfig(childDir);
    expect(resolved.config.ticket_prefix).toBe('TEST');
  });

  it('discoverConfig throws with CONFIG_NOT_FOUND code when not found', async () => {
    // Use a directory that definitely has no .tandem ancestor
    const isolated = join(tempDir, 'isolated');
    await mkdir(isolated, { recursive: true });
    // Override process.cwd to prevent walking into actual project
    await expect(discoverConfig(isolated)).rejects.toMatchObject({
      code: 'CONFIG_NOT_FOUND',
    });
  });

  it('resolvedConfig.pauseFilePath is .tandem/PAUSE relative to configDir', async () => {
    const configDir = join(tempDir, '.tandem');
    const config = makeMinimalConfig();
    const written = await writeConfig(configDir, config);
    const resolved = await loadConfigFromPath(written);
    expect(resolved.pauseFilePath).toBe(join(configDir, 'PAUSE'));
  });
});

// ─── Error-formatter tests ────────────────────────────────────────────────────

describe('error-formatter', () => {
  function makeMockLogger(): { logger: Logger; messages: Array<{ type: string; msg: string }> } {
    const messages: Array<{ type: string; msg: string }> = [];
    const logger: Logger = {
      info: (msg) => { messages.push({ type: 'info', msg }); },
      success: (msg) => { messages.push({ type: 'success', msg }); },
      warn: (msg) => { messages.push({ type: 'warn', msg }); },
      error: (msg) => { messages.push({ type: 'error', msg }); },
      agent: (_role, msg) => { messages.push({ type: 'agent', msg }); },
      phase: (msg) => { messages.push({ type: 'phase', msg }); },
      dryRun: (msg) => { messages.push({ type: 'dryRun', msg }); },
      blank: () => { messages.push({ type: 'blank', msg: '' }); },
      table: () => { messages.push({ type: 'table', msg: '' }); },
      isTTY: false,
    };
    return { logger, messages };
  }

  it('formats ValidationError with error list', () => {
    const { logger, messages } = makeMockLogger();
    const err = new ValidationError('Schema check failed', [
      { message: 'id is required' },
      { message: 'status must be a string' },
    ]);
    formatAndLogError(err, logger);
    const errorMsg = messages.find((m) => m.type === 'error');
    expect(errorMsg?.msg).toContain('Validation failed');
    const infoMsgs = messages.filter((m) => m.type === 'info');
    expect(infoMsgs.some((m) => m.msg.includes('id is required'))).toBe(true);
  });

  it('formats AgentRunError with exit code and stderr excerpt', () => {
    const { logger, messages } = makeMockLogger();
    const err = new AgentRunError('Agent crashed', 1, 'fatal: something went wrong', 'PROJ-1');
    formatAndLogError(err, logger);
    const errorMsg = messages.find((m) => m.type === 'error');
    expect(errorMsg?.msg).toContain('exit code 1');
    expect(errorMsg?.msg).toContain('PROJ-1');
    const infoMsgs = messages.filter((m) => m.type === 'info');
    expect(infoMsgs.some((m) => m.msg.includes('fatal: something went wrong'))).toBe(true);
  });

  it('formats ContractTimeoutError with helpful next steps', () => {
    const { logger, messages } = makeMockLogger();
    const err = new ContractTimeoutError('PROJ-2', 35);
    formatAndLogError(err, logger);
    const errorMsg = messages.find((m) => m.type === 'error');
    expect(errorMsg?.msg).toContain('35m');
    expect(errorMsg?.msg).toContain('PROJ-2');
    const infoMsgs = messages.filter((m) => m.type === 'info');
    expect(infoMsgs.some((m) => m.msg.includes('be_audit.md'))).toBe(true);
  });

  it('formats MaxRetriesExceededError with retry instructions', () => {
    const { logger, messages } = makeMockLogger();
    const err = new MaxRetriesExceededError('PROJ-3', 'be', 3);
    formatAndLogError(err, logger);
    const errorMsg = messages.find((m) => m.type === 'error');
    expect(errorMsg?.msg).toContain('3 attempt');
    const infoMsgs = messages.filter((m) => m.type === 'info');
    expect(infoMsgs.some((m) => m.msg.includes('queued'))).toBe(true);
  });

  it('formats CircularDependencyError with cycle path', () => {
    const { logger, messages } = makeMockLogger();
    const err = new CircularDependencyError(['PROJ-1', 'PROJ-2', 'PROJ-1']);
    formatAndLogError(err, logger);
    const errorMsg = messages.find((m) => m.type === 'error');
    expect(errorMsg?.msg).toContain('Circular');
    const infoMsgs = messages.filter((m) => m.type === 'info');
    expect(infoMsgs.some((m) => m.msg.includes('PROJ-1'))).toBe(true);
  });

  it('formats unknown errors with stack trace', () => {
    const { logger, messages } = makeMockLogger();
    const err = new Error('unexpected boom');
    formatAndLogError(err, logger);
    const errorMsg = messages.find((m) => m.type === 'error');
    expect(errorMsg?.msg).toContain('unexpected boom');
  });

  it('does not throw when err is a plain string', () => {
    const { logger } = makeMockLogger();
    expect(() => formatAndLogError('plain string error', logger)).not.toThrow();
  });

  it('does not throw when err is null', () => {
    const { logger } = makeMockLogger();
    expect(() => formatAndLogError(null, logger)).not.toThrow();
  });

  it('formats TandemError base class with error code', () => {
    const { logger, messages } = makeMockLogger();
    const err = new TandemError('Config not found', 'CONFIG_NOT_FOUND');
    formatAndLogError(err, logger);
    const errorMsg = messages.find((m) => m.type === 'error');
    expect(errorMsg?.msg).toContain('CONFIG_NOT_FOUND');
    expect(errorMsg?.msg).toContain('Config not found');
  });
});

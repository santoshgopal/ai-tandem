/**
 * @module cli/config-loader
 *
 * Discovers, reads, and validates .tandem/config.json.
 * Every command except `tandem init` calls this before doing anything else.
 *
 * Inputs: optional startDir (defaults to process.cwd()).
 * Outputs: ResolvedConfig with all paths resolved to absolute paths.
 * Errors: TandemError with codes CONFIG_NOT_FOUND, REPO_NOT_FOUND, or
 *         TICKETS_DIR_NOT_FOUND; ValidationError if schema check fails.
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { validateConfig } from '../orchestrator/schema-validator.js';
import { TandemError } from '../orchestrator/errors.js';
import type { TandemConfig } from '../schemas/index.js';

// ─── Exported types ───────────────────────────────────────────────────────────

export interface ResolvedConfig {
  config: TandemConfig;
  configPath: string;
  configDir: string;
  ticketsDir: string;
  beRepoPath: string;
  feRepoPath: string;
  pauseFilePath: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildResolved(configPath: string, config: TandemConfig): ResolvedConfig {
  const configDir = dirname(configPath);

  const beRepoPath = resolve(configDir, config.be_repo);
  const feRepoPath = resolve(configDir, config.fe_repo);
  const ticketsDir = resolve(configDir, config.tickets_dir);
  const pauseFilePath = join(configDir, 'PAUSE');

  return { config, configPath, configDir, ticketsDir, beRepoPath, feRepoPath, pauseFilePath };
}

async function readAndValidate(configPath: string): Promise<ResolvedConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch {
    throw new TandemError(
      `Cannot read config file: ${configPath}`,
      'CONFIG_READ_ERROR',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TandemError(
      `Config file is not valid JSON: ${configPath}`,
      'CONFIG_PARSE_ERROR',
    );
  }

  validateConfig(parsed); // throws ValidationError if invalid
  const config = parsed as TandemConfig;
  return buildResolved(configPath, config);
}

/**
 * Verify that be_repo, fe_repo, and tickets_dir exist on disk.
 * Called only by `tandem run` — other commands must work on fresh clones
 * where repos may not yet be set up.
 * Throws TandemError with REPO_NOT_FOUND or TICKETS_DIR_NOT_FOUND.
 */
export async function verifyRepoPaths(resolved: ResolvedConfig): Promise<void> {
  for (const [label, repoPath] of [
    ['be_repo', resolved.beRepoPath],
    ['fe_repo', resolved.feRepoPath],
  ] as const) {
    try {
      await access(repoPath);
    } catch {
      throw new TandemError(
        `${label} directory not found: ${repoPath}\nUpdate .tandem/config.json or create the directory.`,
        'REPO_NOT_FOUND',
      );
    }
  }

  try {
    await access(resolved.ticketsDir);
  } catch {
    throw new TandemError(
      `tickets_dir not found: ${resolved.ticketsDir}\nRun: mkdir -p ${resolved.ticketsDir}`,
      'TICKETS_DIR_NOT_FOUND',
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Discover .tandem/config.json by walking up from startDir.
 * Throws TandemError(CONFIG_NOT_FOUND) if not found anywhere.
 */
export async function discoverConfig(startDir?: string): Promise<ResolvedConfig> {
  let dir = startDir ?? process.cwd();

  while (true) {
    const candidate = join(dir, '.tandem', 'config.json');
    try {
      await access(candidate);
      return await readAndValidate(candidate);
    } catch (err) {
      // If it's a real TandemError (from readAndValidate), re-throw
      if (err instanceof TandemError) throw err;

      const parent = dirname(dir);
      if (parent === dir) {
        // Filesystem root reached
        throw new TandemError(
          'No .tandem/config.json found.\nRun tandem init to set up a new project.',
          'CONFIG_NOT_FOUND',
        );
      }
      dir = parent;
    }
  }
}

/**
 * Load config from an explicit path. Used when --config flag is provided.
 * Throws if the file is missing, invalid JSON, or fails schema validation.
 */
export async function loadConfigFromPath(configPath: string): Promise<ResolvedConfig> {
  const absPath = resolve(configPath);
  return readAndValidate(absPath);
}

/**
 * Write a config to configDir/config.json.
 * Creates the directory if it does not exist.
 * Returns the absolute path of the written file.
 */
export async function writeConfig(
  configDir: string,
  config: TandemConfig,
): Promise<string> {
  await mkdir(configDir, { recursive: true });
  const configPath = join(configDir, 'config.json');
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  return configPath;
}

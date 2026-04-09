/**
 * @module cli/commands/init
 *
 * tandem init — Interactive first-time setup.
 * Creates .tandem/config.json, injects CLAUDE.md into both repos,
 * and creates the tickets directory with a DEMO-1 example ticket.
 */

import { readFile, writeFile, mkdir, access, copyFile, readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../logger.js';
import { writeConfig } from '../config-loader.js';
import type { TandemConfig } from '../../schemas/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// cli/commands/ → cli/ → root
const PACKAGE_ROOT = join(__dirname, '..', '..');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function copyDirectory(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true, encoding: 'utf8' });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

// ─── Command ──────────────────────────────────────────────────────────────────

export async function initCommand(options: { config?: string }): Promise<void> {
  const log = createLogger();
  const cwd = process.cwd();

  log.phase('Welcome to ai-tandem.');
  log.info('This will create .tandem/config.json in your workspace.');
  log.blank();

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const prompt = async (question: string): Promise<string> => {
    const answer = await rl.question(question);
    return answer.trim();
  };

  // ── Ticket prefix ──────────────────────────────────────────────────────────

  let ticketPrefix = '';
  while (!ticketPrefix || !/^[A-Z]+$/.test(ticketPrefix)) {
    if (ticketPrefix) {
      log.error('Ticket prefix must be uppercase letters only (e.g. PROJ, APP).');
    }
    ticketPrefix = await prompt('? Ticket prefix (e.g. PROJ, APP, MYCO): ');
  }

  // ── Repo paths ─────────────────────────────────────────────────────────────

  const beRepoRaw = await prompt('? Path to your backend repo: ');
  const feRepoRaw = await prompt('? Path to your frontend repo: ');
  const ticketsDirRaw = await prompt('? Path to store tickets (default: ./tickets): ');
  const loopRaw = await prompt(
    '? Start with loop mode ON? (runs all tickets in sequence) [y/N]: ',
  );

  await rl.close();

  const beRepoPath = resolve(cwd, beRepoRaw || '.');
  const feRepoPath = resolve(cwd, feRepoRaw || '.');
  const ticketsDir = resolve(cwd, ticketsDirRaw || './tickets');
  const loopMode = loopRaw.toLowerCase() === 'y';

  // Warn if repos don't exist (do not block)
  for (const [label, repoPath] of [
    ['Backend', beRepoPath],
    ['Frontend', feRepoPath],
  ] as const) {
    try {
      await access(repoPath);
    } catch {
      log.warn(
        `${label} directory does not exist yet — it will be created when tandem runs`,
      );
    }
  }

  // ── Write config ───────────────────────────────────────────────────────────

  await mkdir(ticketsDir, { recursive: true });

  const config: TandemConfig = {
    ticket_prefix: ticketPrefix,
    be_repo: beRepoPath,
    fe_repo: feRepoPath,
    tickets_dir: ticketsDir,
    loop: loopMode,
    max_retries: 2,
    pause_on_error: true,
    branch_prefix: 'tandem/',
    open_prs: false,
    pr_base_branch: 'main',
    claude_model: 'claude-sonnet-4-20250514',
    agent_timeout_minutes: 30,
    contract_timeout_minutes: 35,
  };

  const configDir = options.config
    ? dirname(resolve(cwd, options.config))
    : join(cwd, '.tandem');

  const configPath = await writeConfig(configDir, config);
  log.success(`Created ${configPath}`);

  // ── Copy DEMO-1 example ticket ─────────────────────────────────────────────

  const exampleSrc = join(PACKAGE_ROOT, 'examples', 'tickets', 'DEMO-1');
  const exampleDest = join(ticketsDir, 'DEMO-1');

  try {
    await copyDirectory(exampleSrc, exampleDest);
    // Reset status.json to queued state with no transitions
    await writeFile(
      join(exampleDest, 'status.json'),
      JSON.stringify(
        { ticket_id: 'DEMO-1', current: 'queued', transitions: [] },
        null,
        2,
      ),
      'utf8',
    );
    log.success(`Created ${exampleDest}/ (example ticket)`);
  } catch (err) {
    log.warn(`Could not copy example ticket: ${String(err)}`);
  }

  // ── Inject CLAUDE.md into repos ────────────────────────────────────────────

  const templateDir = join(PACKAGE_ROOT, 'templates');

  for (const [role, repoPath] of [
    ['backend', beRepoPath],
    ['frontend', feRepoPath],
  ] as const) {
    const templateFile = join(templateDir, `CLAUDE-${role}.md`);
    const destFile = join(repoPath, 'CLAUDE.md');

    let shouldWrite = true;

    try {
      await access(destFile);
      // File already exists — ask user before overwriting
      const rl2 = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl2.question(
        `? CLAUDE.md already exists in ${repoPath}. Overwrite? [y/N]: `,
      );
      await rl2.close();
      shouldWrite = answer.trim().toLowerCase() === 'y';
    } catch {
      // File does not exist — proceed
    }

    if (shouldWrite) {
      try {
        await mkdir(repoPath, { recursive: true });
        const content = await readFile(templateFile, 'utf8');
        await writeFile(destFile, content, 'utf8');
        log.success(`Wrote CLAUDE.md to ${destFile}`);
      } catch (err) {
        log.warn(`Could not write CLAUDE.md to ${destFile}: ${String(err)}`);
      }
    }
  }

  // ── Print next steps ───────────────────────────────────────────────────────

  log.blank();
  log.info('Next steps:');
  log.info('  1. Review the example ticket: tickets/DEMO-1/ticket.json');
  log.info('  2. Validate your setup:   tandem validate');
  log.info('  3. Dry run:               tandem run --dry-run');
  log.info('  4. Full run:              tandem run');
}

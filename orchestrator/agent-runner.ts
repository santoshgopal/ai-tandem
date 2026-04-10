/**
 * @module orchestrator/agent-runner
 *
 * Spawns `claude` as a child process in a specific working directory.
 * Captures all output. Enforces a timeout. Returns structured output.
 * Contains NO business logic — pure subprocess wrapper.
 *
 * Security note: repoPath is validated by the caller (ticket-loader verifies it exists).
 * This module trusts its inputs and does not perform additional path validation.
 *
 * Inputs: AgentRunOptions (ticketId, role, repoPath, prompt, model, timeout).
 * Outputs: AgentRunResult with exit code, stdout, stderr, duration.
 * Errors: throws AgentRunError on non-zero exit, AgentTimeoutError on timeout.
 */

import { spawn } from 'node:child_process';
import { AgentRunError, AgentTimeoutError } from './errors.js';
import type { Logger } from '../types/logger.interface.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentRunOptions {
  ticketId: string;
  role: 'be' | 'fe';
  repoPath: string;
  prompt: string;
  model: string;
  timeoutMinutes: number;
  allowedTools?: string[];
  dryRun?: boolean;
  /** Stream agent stdout/stderr lines to this logger as they arrive. */
  logger?: Logger;
}

export interface AgentRunResult {
  ticketId: string;
  role: 'be' | 'fe';
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

const DEFAULT_TOOLS = ['Edit', 'Write', 'Bash', 'Read'];

export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const {
    ticketId,
    role,
    repoPath,
    prompt,
    model,
    timeoutMinutes,
    allowedTools = DEFAULT_TOOLS,
    dryRun = false,
    logger,
  } = options;

  // Dry run mode — log and return without spawning
  if (dryRun) {
    const truncated = prompt.length > 500
      ? prompt.slice(0, 500) + `\n... [${prompt.length - 500} more characters]`
      : prompt;
    console.log(`[DRY RUN] Would run ${role} agent for ${ticketId}`);
    console.log(`[DRY RUN] Model: ${model}`);
    console.log(`[DRY RUN] Repo:  ${repoPath}`);
    console.log(`[DRY RUN] Prompt (first 500 chars):\n${truncated}`);
    return { ticketId, role, exitCode: 0, stdout: '', stderr: '', durationMs: 0, timedOut: false };
  }

  // claude --print <prompt> runs non-interactively and exits when done.
  // --output-format text ensures plain text output (not JSON).
  const args = [
    '--print', prompt,
    '--model', model,
    '--allowedTools', allowedTools.join(','),
    '--output-format', 'text',
  ];

  const startMs = Date.now();
  let timedOut = false;
  let stdoutBuf = '';
  let stderrBuf = '';

  const child = spawn('claude', args, {
    cwd: repoPath,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  // Collect output; optionally stream each line to the logger
  child.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    stdoutBuf += text;
    if (logger) {
      for (const line of text.split('\n')) {
        if (line.trim()) logger.agent(role, line);
      }
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    stderrBuf += text;
    if (logger) {
      for (const line of text.split('\n')) {
        if (line.trim()) logger.agent(role, `[stderr] ${line}`);
      }
    }
  });

  // Timeout logic
  const timeoutMs = timeoutMinutes * 60 * 1000;
  let killTimer: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    killTimer = setTimeout(async () => {
      timedOut = true;
      child.kill('SIGTERM');
      await new Promise<void>((res) => setTimeout(res, 5000));
      if (!child.killed) child.kill('SIGKILL');
      reject(new AgentTimeoutError(ticketId, timeoutMinutes, role));
    }, timeoutMs);
  });

  const runPromise = new Promise<number>((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
  });

  let exitCode: number;
  try {
    exitCode = await Promise.race([runPromise, timeoutPromise]);
  } catch (err) {
    if (killTimer !== null) clearTimeout(killTimer);
    throw err;
  }

  if (killTimer !== null) clearTimeout(killTimer);

  const durationMs = Date.now() - startMs;

  if (exitCode !== 0 && !timedOut) {
    throw new AgentRunError(
      `${role === 'be' ? 'Backend' : 'Frontend'} agent exited with code ${exitCode} for ticket ${ticketId}`,
      exitCode,
      stderrBuf.slice(0, 2000),
      ticketId,
    );
  }

  return { ticketId, role, exitCode, stdout: stdoutBuf, stderr: stderrBuf, durationMs, timedOut };
}

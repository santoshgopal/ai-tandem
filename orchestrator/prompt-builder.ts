/**
 * @module orchestrator/prompt-builder
 *
 * Pure function module — no async I/O during rendering.
 * Reads template files from disk once at module load time (cached).
 * Renders the final prompt string for backend and frontend agent runs.
 *
 * Inputs: Ticket, optional Contract, file paths for contract output.
 * Outputs: fully rendered prompt string.
 * Errors: throws TemplateMissingKeyError if a {{TOKEN}} remains unresolved
 *         after rendering (excluding tokens inside substituted values, which
 *         are handled by pre-substituting SHARED_RULES before the render pass).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import type { Ticket, Contract } from '../schemas/index.js';
import { TemplateMissingKeyError } from './errors.js';

// ─── Template loading (cached at module init) ─────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const templatesDir = join(__dirname, '..', 'templates');

const sharedTemplate = readFileSync(join(templatesDir, 'CLAUDE-shared.md'), 'utf8');
const backendTemplate = readFileSync(join(templatesDir, 'CLAUDE-backend.md'), 'utf8');
const frontendTemplate = readFileSync(join(templatesDir, 'CLAUDE-frontend.md'), 'utf8');

// ─── Rendering ────────────────────────────────────────────────────────────────

// Only matches uppercase-alpha-underscore tokens to avoid false positives
// on agent-instruction text like {{brief description}}.
const TOKEN_RE = /\{\{([A-Z][A-Z_]*)\}\}/g;

/**
 * Replace every {{KEY}} in `template` with `context[KEY]`.
 * After replacement, scans for any remaining {{UPPERCASE}} patterns and throws
 * TemplateMissingKeyError for the first one found.
 * Replacement is not recursive.
 */
function render(template: string, context: Record<string, string>): string {
  const result = template.replace(TOKEN_RE, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      return context[key] ?? '';
    }
    // Leave unreplaced — we'll catch it in the scan below
    return match;
  });

  // Scan for any remaining uppercase tokens
  TOKEN_RE.lastIndex = 0;
  const remaining = TOKEN_RE.exec(result);
  TOKEN_RE.lastIndex = 0;
  if (remaining !== null) {
    const key = remaining[1] ?? '';
    throw new TemplateMissingKeyError(key, template);
  }

  return result;
}

// ─── List formatting ──────────────────────────────────────────────────────────

function formatList(items: string[] | undefined, fallback: string): string {
  if (!items || items.length === 0) return fallback;
  return items.map((item) => `- ${item}`).join('\n');
}

// ─── Public builders ──────────────────────────────────────────────────────────

/**
 * Build the prompt for the backend agent.
 * Pre-substitutes SHARED_RULES before the render pass so that {{TICKET_ID}}
 * inside the shared template (used as an example for agents) gets resolved
 * along with all other ticket tokens in a single render pass.
 */
export function buildBackendPrompt(
  ticket: Ticket,
  contractOutputPath: string,
  contractSchemaPath: string,
): string {
  // Pre-substitute {{SHARED_RULES}} so the shared template's own {{TICKET_ID}}
  // token is included in scope for the render pass.
  const tpl = backendTemplate.replace('{{SHARED_RULES}}', sharedTemplate);

  return render(tpl, {
    TICKET_ID: ticket.id,
    TICKET_TITLE: ticket.title,
    USER_STORY: ticket.user_story,
    ACCEPTANCE_CRITERIA: formatList(ticket.acceptance, 'No acceptance criteria specified.'),
    BE_SCOPE: ticket.be_scope,
    BE_CONSTRAINTS: formatList(ticket.be_constraints, 'No additional constraints.'),
    BE_HINTS: formatList(ticket.be_hints, 'No additional hints.'),
    CONTRACT_OUTPUT_PATH: contractOutputPath,
    CONTRACT_SCHEMA_PATH: contractSchemaPath,
  });
}

/**
 * Build the prompt for the frontend agent.
 * Pre-substitutes SHARED_RULES before the render pass.
 */
export function buildFrontendPrompt(ticket: Ticket, contract: Contract): string {
  const tpl = frontendTemplate.replace('{{SHARED_RULES}}', sharedTemplate);

  return render(tpl, {
    TICKET_ID: ticket.id,
    TICKET_TITLE: ticket.title,
    USER_STORY: ticket.user_story,
    ACCEPTANCE_CRITERIA: formatList(ticket.acceptance, 'No acceptance criteria specified.'),
    FE_SCOPE: ticket.fe_scope,
    FE_CONSTRAINTS: formatList(ticket.fe_constraints, 'No additional constraints.'),
    FE_HINTS: formatList(ticket.fe_hints, 'No additional hints.'),
    CONTRACT_JSON: JSON.stringify(contract, null, 2),
  });
}

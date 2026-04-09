/**
 * @module orchestrator/errors
 *
 * Custom error classes for the entire tandem orchestrator.
 * Every thrown error in orchestrator code must be one of these typed classes.
 * Never throw `new Error()` directly from orchestrator code.
 *
 * All errors extend TandemError, which extends Error. This allows callers to:
 *   - Catch all tandem errors with `catch (e) { if (isTandemError(e)) ... }`
 *   - Distinguish error types with instanceof checks
 *   - Access structured fields (ticketId, exitCode, cycle, etc.)
 */

// ─── Base ─────────────────────────────────────────────────────────────────────

export class TandemError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Thrown when a ticket.json or contract.json fails JSON Schema validation. */
export class ValidationError extends TandemError {
  constructor(
    message: string,
    public readonly errors: unknown[],
  ) {
    super(message, 'VALIDATION_ERROR');
  }
}

// ─── Ticket loading ───────────────────────────────────────────────────────────

/** Thrown when a ticket file or directory cannot be read from disk. */
export class TicketReadError extends TandemError {
  constructor(
    message: string,
    public readonly ticketId: string,
  ) {
    super(message, 'TICKET_READ_ERROR');
  }
}

/** Thrown when a circular dependency is detected between tickets. */
export class CircularDependencyError extends TandemError {
  constructor(public readonly cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' → ')}`, 'CIRCULAR_DEPENDENCY');
  }
}

// ─── State machine ────────────────────────────────────────────────────────────

/** Thrown when an invalid state transition is attempted. */
export class InvalidTransitionError extends TandemError {
  constructor(from: string | null, to: string, ticketId: string) {
    super(
      `Invalid transition for ticket ${ticketId}: ${from ?? 'null'} → ${to}`,
      'INVALID_TRANSITION',
    );
  }
}

/** Thrown when the status.json atomic write fails. */
export class StateWriteError extends TandemError {
  constructor(
    message: string,
    public readonly ticketId: string,
  ) {
    super(message, 'STATE_WRITE_ERROR');
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

/** Thrown when a template placeholder is missing from the render context. */
export class TemplateMissingKeyError extends TandemError {
  constructor(
    public readonly key: string,
    template: string,
  ) {
    super(
      `Template token {{${key}}} was not provided in render context (template starts with: "${template.slice(0, 80)}...")`,
      'TEMPLATE_MISSING_KEY',
    );
  }
}

// ─── Agent runner ─────────────────────────────────────────────────────────────

/** Thrown when the claude subprocess exits with a non-zero code. */
export class AgentRunError extends TandemError {
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly stderr: string,
    public readonly ticketId: string,
  ) {
    super(message, 'AGENT_RUN_ERROR');
  }
}

/** Thrown when the agent run exceeds the configured timeout. */
export class AgentTimeoutError extends TandemError {
  constructor(
    public readonly ticketId: string,
    public readonly timeoutMinutes: number,
    role: 'be' | 'fe',
  ) {
    super(
      `${role === 'be' ? 'Backend' : 'Frontend'} agent timed out after ${timeoutMinutes} minutes for ticket ${ticketId}`,
      'AGENT_TIMEOUT',
    );
  }
}

// ─── Contract watcher ─────────────────────────────────────────────────────────

/** Thrown when contract.json does not appear within the contract timeout. */
export class ContractTimeoutError extends TandemError {
  constructor(
    public readonly ticketId: string,
    public readonly timeoutMinutes: number,
  ) {
    super(
      `contract.json not written within ${timeoutMinutes} minutes for ticket ${ticketId}`,
      'CONTRACT_TIMEOUT',
    );
  }
}

/** Thrown when contract.json appears but fails schema validation. */
export class ContractValidationError extends TandemError {
  constructor(
    message: string,
    public readonly ticketId: string,
    public readonly errors: unknown[],
  ) {
    super(message, 'CONTRACT_VALIDATION_ERROR');
  }
}

// ─── Retry handler ────────────────────────────────────────────────────────────

/** Thrown when max retries is exceeded for an agent run. */
export class MaxRetriesExceededError extends TandemError {
  constructor(
    public readonly ticketId: string,
    public readonly role: 'be' | 'fe',
    public readonly attempts: number,
  ) {
    super(
      `Max retries exceeded for ${role === 'be' ? 'backend' : 'frontend'} agent on ticket ${ticketId} after ${attempts} attempt(s)`,
      'MAX_RETRIES_EXCEEDED',
    );
  }
}

// ─── Union type + type guard ───────────────────────────────────────────────────

export type AnyTandemError =
  | ValidationError
  | TicketReadError
  | CircularDependencyError
  | InvalidTransitionError
  | StateWriteError
  | TemplateMissingKeyError
  | AgentRunError
  | AgentTimeoutError
  | ContractTimeoutError
  | ContractValidationError
  | MaxRetriesExceededError;

/** Type guard: returns true if err is any TandemError subclass. */
export function isTandemError(err: unknown): err is TandemError {
  return err instanceof TandemError;
}

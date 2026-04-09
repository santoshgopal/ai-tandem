/**
 * @module orchestrator
 * Public API for the ai-tandem orchestrator engine.
 * Import from this module, not from individual files.
 */

// Core runner
export { runLoop } from './loop.js';
export type { LoopOptions, LoopResult } from './loop.js';

// Types (re-exported from schemas for convenience)
export type {
  Ticket,
  TicketStatus,
  Contract,
  TandemConfig,
  TicketStatusRecord,
} from '../schemas/index.js';

// State machine (for external tooling)
export { TicketStateMachine } from './state-machine.js';

// Validation (for external tooling)
export {
  validateTicket,
  validateContract,
  validateConfig,
  validateStatus,
} from './schema-validator.js';

// Ticket loading (for external tooling e.g. tandem status CLI command)
export { loadTickets } from './ticket-loader.js';
export type { LoadedTicket, TicketQueue } from './ticket-loader.js';

// Error types (for error handling in CLI layer)
export {
  TandemError,
  ValidationError,
  TicketReadError,
  CircularDependencyError,
  InvalidTransitionError,
  StateWriteError,
  TemplateMissingKeyError,
  AgentRunError,
  AgentTimeoutError,
  ContractTimeoutError,
  ContractValidationError,
  MaxRetriesExceededError,
  isTandemError,
} from './errors.js';
export type { AnyTandemError } from './errors.js';

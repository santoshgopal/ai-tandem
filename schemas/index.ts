/**
 * @module schemas
 *
 * TypeScript interfaces for all tandem data structures.
 * These mirror the JSON Schemas in this directory exactly.
 * Source of truth for type checking across the orchestrator and CLI.
 */

// ─── Ticket ──────────────────────────────────────────────────────────────────

export type TicketStatus =
  | 'queued'
  | 'be-working'
  | 'contract-ready'
  | 'fe-working'
  | 'done'
  | 'error'
  | 'blocked';

export interface TicketMeta {
  created_at?: string;
  created_by?: string;
  labels?: string[];
  notes?: string;
}

export interface Ticket {
  id: string;
  title: string;
  status: TicketStatus;
  priority: number;
  depends_on?: string[];
  user_story: string;
  acceptance: string[];
  be_scope: string;
  be_constraints?: string[];
  be_hints?: string[];
  fe_scope: string;
  fe_constraints?: string[];
  fe_hints?: string[];
  meta?: TicketMeta;
}

// ─── Contract ─────────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type AuthType = 'bearer' | 'api-key' | 'session-cookie' | 'none';
export type PaginationStrategy = 'cursor' | 'offset' | 'none';

export interface TypeDef {
  type?: string;
  format?: string;
  enum?: unknown[];
  description?: string;
  properties?: Record<string, TypeDef>;
  required?: string[];
  items?: TypeDef;
  $ref?: string;
}

export interface EndpointError {
  status: number;
  code: string;
  description: string;
}

export interface Endpoint {
  method: HttpMethod;
  path: string;
  summary: string;
  auth_override?: AuthType;
  request?: {
    params?: Record<string, TypeDef>;
    query?: Record<string, TypeDef>;
    body?: TypeDef;
    headers?: Record<string, string>;
  };
  response: {
    success: {
      status: number;
      body: TypeDef;
    };
    errors?: EndpointError[];
  };
}

export interface ContractAuth {
  type: AuthType;
  header?: string;
  notes?: string;
}

export interface ContractFrontendGuidance {
  loading_states?: string[];
  optimistic_update?: boolean;
  pagination?: {
    strategy: PaginationStrategy;
    default_page_size?: number;
    max_page_size?: number;
  };
  polling_required?: boolean;
  gotchas?: string[];
}

export interface Contract {
  ticket_id: string;
  be_commit: string;
  generated_at: string;
  base_url_hint?: string;
  auth?: ContractAuth;
  endpoints: Endpoint[];
  types: Record<string, TypeDef>;
  frontend_guidance?: ContractFrontendGuidance;
  be_notes?: string[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface TandemConfig {
  ticket_prefix: string;
  be_repo: string;
  fe_repo: string;
  tickets_dir: string;
  loop?: boolean;
  loop_until?: string | null;
  max_retries?: number;
  pause_on_error?: boolean;
  branch_prefix?: string;
  open_prs?: boolean;
  pr_base_branch?: string;
  claude_model?: string;
  agent_timeout_minutes?: number;
  contract_timeout_minutes?: number;
  notify_webhook?: string | null;
  git_user_name?: string;
  git_user_email?: string;
}

// ─── Status ───────────────────────────────────────────────────────────────────

export interface StatusTransition {
  from: TicketStatus | null;
  to: TicketStatus;
  at: string;
  reason?: string;
}

export interface AgentRunMeta {
  started_at: string;
  completed_at: string | null;
  exit_code: number | null;
  retry_count: number;
  branch: string;
  commit: string | null;
}

export interface TicketStatusRecord {
  ticket_id: string;
  current: TicketStatus;
  transitions: StatusTransition[];
  be_run?: AgentRunMeta;
  fe_run?: AgentRunMeta;
  pr_urls?: {
    be_pr_url?: string;
    fe_pr_url?: string;
  };
}

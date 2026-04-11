# Upcoming Features & Roadmap

> **Call for Contributors**: This file outlines the future direction of ai-tandem. We welcome open-source contributors to pick any of these features and submit PRs. Please open an issue first to discuss your proposed implementation, then follow the [CONTRIBUTING.md](CONTRIBUTING.md) guidelines for all commits, testing, and schema changes.

---

## 🎯 Phase 3: UI & Observability

A stateless, authless web dashboard for ticket management and real-time pipeline monitoring.

### Interactive Ticket Dashboard

- [ ] **Web UI** — React/TypeScript SPA served from `GET /dashboard`
  - View ticket list with real-time status updates
  - Interactive ticket detail view (ticket.json, contract.json, audit logs)
  - Edit ticket.json directly in the UI with schema validation
  - Create/delete tickets via UI form
  - Search & filter tickets by status, priority, labels, depends_on
  - Dependency graph visualization (DAG render)

- [ ] **Stateless Architecture**
  - No authentication (file-system access only)
  - No session storage (reads/writes direct to disk)
  - Self-contained: works with local file system only
  - Optional: --ui-port flag on `tandem run` to expose dashboard while loop runs

- [ ] **Real-time Pipeline Monitoring**
  - Live status updates (WebSocket or polling)
  - Agent output stream (tail logs as agents run)
  - Contract validation feedback (inline validation errors)
  - Estimated time to completion per ticket

- [ ] **Audit Trail Viewer**
  - Timeline of all state transitions
  - Be_audit.md & fe_audit.md parsed & rendered as formatted reports
  - Agent output comparison (BE vs FE implementation differences)
  - Commit hash links (GitHub/GitLab integration)

---

## 🔄 Phase 3b: Enhanced Contract & Versioning

Improve contract handling and support multiple contract versions.

- [ ] **Contract Versioning**
  - Support `contract.v1.json`, `contract.v2.json`, etc.
  - Automatic migration helpers for breaking changes
  - Diff view between contract versions

- [ ] **Contract Annotations**
  - Backend agent can mark deprecated endpoints
  - Frontend guidance sections (warnings, gotchas, breaking changes)
  - Backward compatibility notes

- [ ] **Contract Templates**
  - Pre-defined contract patterns (REST CRUD, GraphQL, WebSocket, gRPC)
  - Quick-start contract scaffolding

---

## 📊 Phase 4: Metrics & Analytics

Track performance, success rates, and agent behavior.

### Observability & Reporting

- [ ] **Agent Performance Metrics**
  - Success rate (pass/fail count per agent)
  - Average time to completion (BE, FE, total)
  - Retry frequency (correlation with model/temperature)
  - Files created/modified distribution
  - Error rate by error type

- [ ] **Export Reports**
  - JSON export of all metrics (for external tools)
  - CSV export for spreadsheet analysis
  - PDF summary reports (1-month, 1-quarter, 1-year)

- [ ] **Cost Tracking**
  - Track API tokens used per ticket
  - Estimate cost per feature
  - Dashboard showing cost trends

- [ ] **Custom KPIs**
  - Define success metrics per ticket (acceptance criteria compliance score)
  - Automatic validation against KPI checklist
  - Pass/fail indicators for contract compliance

---

## 🔧 Phase 5: Advanced Git & Platform Integration

Deeper integration with GitHub/GitLab and multiple VCS.

### Multi-Platform Support

- [ ] **GitHub Integration**
  - Auto-create PR with contract validation status as check
  - Auto-link related GitHub issues to tickets
  - Sync ticket status ↔ issue labels (e.g., `tandem:be-working`)
  - Post audit results as PR comments

- [ ] **GitLab Integration**
  - Similar to GitHub (MR instead of PR)
  - CI/CD pipeline integration (trigger tandem from CI)

- [ ] **Bitbucket Support**
  - Branch management adapter for Bitbucket Cloud & Server

- [ ] **Webhook Support**
  - Listen for webhook events (push, PR created, issue opened)
  - Auto-create tickets from GitHub issues
  - Auto-sync ticket status to external tools

---

## 🤖 Phase 6: Multi-Model & Advanced Agent Control

Support multiple LLM models and fine-tune agent behavior.

### Model Management

- [ ] **Multi-Model Support**
  - Allow per-ticket model selection (claude-opus, claude-sonnet, claude-haiku)
  - Fallback model chain (try opus, fall back to sonnet if timeout)
  - Model-specific prompt variations

- [ ] **Agent Parameter Tuning**
  - Per-ticket temperature, top_p, max_tokens override
  - Sampling strategy selection (deterministic vs exploratory)
  - Custom system prompts per ticket

- [ ] **Agent Behavior Customization**
  - Define allowed tools per ticket (Edit, Bash, Read, Write subsets)
  - Tool usage tracking (which tools did the agent use?)
  - Custom tool plugins (extend beyond E/W/B/R)

- [ ] **Rollback & Recovery**
  - Undo ticket run (restore previous commit, preserve contract)
  - Cherry-pick specific files from failed run
  - Manual intervention mode (pause, edit, resume)

---

## 🔐 Phase 7: Enterprise & Security

Multi-project support, RBAC, and compliance features.

### Multi-Workspace Support

- [ ] **Workspace Manager**
  - Manage multiple `.tandem/` projects
  - Switch between workspaces (`tandem workspace switch <name>`)
  - Shared template library across workspaces

- [ ] **Role-Based Access Control** (optional)
  - Read-only mode for audit users
  - Ticket creation restrictions (admin-only)
  - Config edit restrictions

- [ ] **Audit Logging**
  - All state changes logged to immutable audit log
  - Compliance reports (SOC 2 type)
  - Export audit trail for compliance tools

- [ ] **Secrets Management**
  - Support for `.env` files in config
  - Masked logging (don't expose secrets in audit.md)

---

## 🚀 Phase 8: Performance & Scalability

Optimize for high-volume ticket processing.

### Batch & Queue Optimization

- [ ] **Batch Ticket Processing**
  - Process multiple tickets in parallel (with concurrency limits)
  - Batch status updates (reduce disk writes)
  - Prioritized queue (not just by priority, but by deadline)

- [ ] **Agent Pool Management**
  - Keep agents alive between tickets (reduce startup time)
  - Agent health checks & auto-restart on failure
  - Load balancing across multiple tandem instances

- [ ] **Caching**
  - Cache compiled prompts (reuse if ticket unchanged)
  - Cache contract schema validation (first-pass only)
  - Cache agent output for identical inputs (memoization)

- [ ] **Distributed Execution**
  - Support for distributed orchestration (multiple machines)
  - Ticket assignment strategies (round-robin, least-loaded)
  - Cluster status dashboard

---

## 🧪 Phase 9: Testing & Quality

Enhanced testing infrastructure and contract compliance.

### Testing Frameworks

- [ ] **Contract Compliance Testing**
  - Auto-test generated endpoints (basic smoke tests)
  - Frontend contract compliance validator (does UI match contract?)
  - Breaking change detector (before/after contract diff)

- [ ] **Agent Output Validation**
  - Linting tool for agent output (did it follow guidelines?)
  - Acceptance criteria checker (did it implement all acceptance criteria?)
  - Code style enforcer (automatic fixes for linting issues)

- [ ] **Regression Testing**
  - Store baseline outputs for comparison
  - Flag changes in agent behavior (regression detector)
  - Historical trend analysis (is the agent getting better/worse?)

- [ ] **Integration Test Generation**
  - Auto-generate integration tests from contract.json
  - Run tests before FE run (catch BE issues early)

---

## 📚 Phase 10: Documentation & Developer Experience

Better docs, examples, and onboarding.

### Documentation & Examples

- [ ] **Interactive Walkthrough**
  - In-CLI guided tutorial (like `npm init`)
  - Video walkthrough (YouTube/Loom)
  - Live demo instance (reproducible example)

- [ ] **Advanced Documentation**
  - Custom adapter development guide
  - Extending validators (custom rules)
  - Building custom agents (non-Claude)
  - Architecture deep-dive (internals, design decisions)

- [ ] **SDK & Library Exports**
  - Public API for embedding tandem in other tools
  - JavaScript/Python client libraries
  - REST API for orchestrator (optional standalone server)

- [ ] **Example Gallery**
  - 10+ example tickets across different domains
  - E-commerce, SaaS, mobile app, blockchain examples
  - Template library (clone & customize)

---

## 🔌 Phase 11: Notifications & Integrations

Feedback loops and external tool integrations.

### External Integrations

- [ ] **Notifications**
  - Slack integration (ticket status updates, alerts)
  - Discord integration (similar to Slack)
  - Email digest (daily/weekly summary)
  - SMS alerts (on error or completion)

- [ ] **Third-Party Tool Integration**
  - Jira sync (import tickets, sync status)
  - Linear sync
  - Asana integration
  - Notion database sync

- [ ] **Analytics Integrations**
  - Datadog metrics export
  - New Relic APM integration
  - Prometheus metrics exporter

- [ ] **CI/CD Pipeline Integration**
  - GitHub Actions workflow template
  - GitLab CI pipeline template
  - Jenkins integration
  - Trigger tandem from CI (auto-feature-branch)

---

## 🎨 Phase 12: UX & Polish

Quality-of-life improvements and UX refinements.

### User Experience

- [ ] **CLI Improvements**
  - Colored output with better formatting
  - Progress bar for long operations
  - Interactive mode (REPL for ticket queries)
  - Autocomplete for commands

- [ ] **Configuration Helpers**
  - `tandem config set <key> <value>` command
  - `tandem config validate` (validate without running)
  - `tandem config show` (pretty-print current config)

- [ ] **Template Customization**
  - `tandem template edit --role backend` (edit agent prompts)
  - `tandem template show` (display current templates)
  - Template versioning (rollback to default)

- [ ] **Error Messages**
  - Machine-readable error codes with documentation links
  - Quick-fix suggestions (e.g., "Did you forget to run `tandem init`?")
  - Error telemetry (report errors to help improve UX)

---

## 📦 Phase 13: Extensibility & Plugins

Plugin system for custom behavior.

### Plugin System

- [ ] **Custom Validators**
  - Plugin API for adding custom validation rules
  - Share validators via npm packages
  - Built-in validators library (common rules)

- [ ] **Custom Agent Adapters**
  - Support for non-Claude agents (Anthropic: future models, or other LLMs?)
  - Agent abstraction interface
  - Local LLM support (ollama, llama.cpp)

- [ ] **Custom Git Adapters**
  - Extend beyond GitHub/GitLab
  - Gitea, Forgejo support
  - Gitee (Chinese Git platform)

- [ ] **Hook System**
  - Pre/post hooks (on ticket load, after agent run, on state change)
  - Custom code execution points
  - Event emitters for extensibility

---

## 📋 Checklist for Contributors

When picking a feature to work on:

- [ ] Open an issue first describing your proposed feature
- [ ] Get maintainer feedback on approach & design
- [ ] Follow [CONTRIBUTING.md](CONTRIBUTING.md) for all code
- [ ] Write tests for new behavior (`npm run test:watch`)
- [ ] Update documentation if applicable
- [ ] Ensure `npm run typecheck` passes
- [ ] Run `npm run validate-schemas` for any schema changes
- [ ] Submit PR with clear description and link to issue

---

## 🗺️ Rough Timeline

- **Q2 2026** — Phase 3 (UI Dashboard)
- **Q3 2026** — Phase 4 (Metrics) + Phase 5 (Git Integration)
- **Q4 2026** — Phase 6 (Multi-Model) + Phase 7 (Enterprise)
- **2027** — Phase 8–13 (Scaling, Testing, Plugins, Polish)

_Timeline is flexible and depends on contributor availability._

---

## 💡 Ideas for Quick Wins (Starter Issues)

Great for first-time contributors:

- [ ] Add `--json` output format to `tandem status`
- [ ] Implement `tandem config show` command
- [ ] Add colored output to CLI logs
- [ ] Create `tandem template show` command
- [ ] Add `--quiet` flag to suppress agent logs
- [ ] Improve error messages with suggestion hints
- [ ] Add autocomplete script for bash/zsh
- [ ] Create 3 additional example tickets (different domains)
- [ ] Write a "Contributing Your First Feature" guide
- [ ] Add `tandem list-models` command (preview available Claude models)

---

## 📞 Questions or Ideas?

- Open a GitHub discussion for feature ideas
- Open an issue to claim a feature
- Drop by the Discord or community forum

**Let's build the future of AI-driven full-stack development together!** 🚀

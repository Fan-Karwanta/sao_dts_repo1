SAO Document Tracking System Development Plan
Build a secure, realtime, workflow-configurable procurement document tracker using Next.js, NestJS, PostgreSQL, and Socket.IO, deployed on a Hostinger VPS.

Summary
Develop the SAO Document Tracking System as a TypeScript monorepo with a Next.js web client, NestJS API and Socket.IO gateway, PostgreSQL database, and a versioned visual workflow engine. The initial published workflow will use the 37 columns in process2.md as its authoritative default sequence, while retaining configurable transitions needed for returns or exceptions described in process1.md.

The system tracks metadata and physical-document movement only; it will not upload or store document files.

Confirmed Decisions
Deployment: Hostinger VPS, because Hostinger Business/Cloud hosting does not accept incoming WebSocket connections and can stop idle Node processes.
Workflow source: process2.md is authoritative for the initial 37-step workflow. process1.md supplies supporting requirements such as monitoring, permissions, auditability, returns, payment handling, and administration.
Workflow configuration: Full visual builder with nodes, transitions, branches, conditions, department ownership, and draft/publish versioning.
Admin account support: Audited impersonation and secure password reset. Passwords are hashed and can never be viewed or recovered.
Initial scale: One application VPS instance; design Socket.IO so a Redis adapter can be introduced later if horizontal scaling is needed.
Recommended Architecture and Stack
Repository
Use a pnpm workspace (optionally with Turborepo only if build orchestration becomes useful):

apps/web — Next.js App Router, React, TypeScript
apps/api — NestJS REST API and Socket.IO gateway
packages/db — Prisma schema, migrations, seed data, and generated client
packages/contracts — shared Zod schemas, DTO/event contracts, enums, and permission identifiers
packages/ui — reusable UI primitives if component sharing warrants it
infra — Docker Compose, Nginx, deployment templates, and backup scripts/configuration
Core Technologies
Frontend: Next.js App Router, React, TypeScript, Tailwind CSS, an accessible component library already adopted during scaffolding
Data fetching/state: TanStack Query for server state; local UI state only where needed
Tracking grid: TanStack Table plus row/column virtualization for the horizontally scrollable spreadsheet-like view
Workflow canvas: @xyflow/react (React Flow) for drag/drop nodes and edges
Backend: NestJS with REST endpoints and a Socket.IO gateway
Database: PostgreSQL with Prisma ORM and explicit migrations
Authentication: Secure server-side sessions in HttpOnly, Secure, SameSite cookies; Argon2id password hashing; CSRF protection for state-changing requests
Validation: Zod at shared client boundaries and backend DTO validation
Testing: Vitest/Jest as appropriate, React Testing Library, Supertest, and Playwright
Operations: Docker Compose, Nginx reverse proxy with TLS, persistent PostgreSQL volume, automated encrypted backups, health checks, structured logs
Product Model
Roles and Permissions
Seed the initial roles:

Admin
SAO
Procurement Staff
Budget Staff
Supply Staff
Pre-Audit Staff
Accounting Staff
Cashier Staff
Use permission-based RBAC rather than hard-coded role checks. Permissions should cover at least:

view all documents and workflow data
create a tracked document/project
edit fields owned by a department
advance, return, or reroute a document
manage users and registration requests
manage roles and permissions
manage pages/features
design and publish workflows
view/export audit records
impersonate users
reset user passwords
manage system settings
Staff can view all departments but can edit only fields/nodes authorized for their department and role. SAO has system-wide read/monitor access by default. Admin privileges are explicit and auditable.

Default Workflow
Seed the 37 process2.md entries in order, preserving their labels and ownership:

Steps 1–8: Procurement
Steps 9–11: Budget (step 9 contains separate ORS No. and BURS No. fields)
Steps 12–13: Accounting
Steps 14–18: Procurement
Steps 19–25: Supply
Steps 26–27: Pre-Audit
Steps 28–33: Accounting
Steps 34–36: Cashier
Step 37: Pre-Audit remarks
Each default node must define a data type and validation rule rather than treating every value as free text. Expected types include text, date, money/decimal, integer/duration, identifier, supplier reference, payment-mode enum, calculated amount, and remarks. Confirm acronyms and final validation rules with SAO stakeholders before production seed approval.

Represent the unusual final Pre-Audit remarks field as a field on the record unless stakeholders confirm it is an actual post-Cashier routing stage. Model ORS and BURS as distinct optional fields under the same Budget step/group. Model deductions as structured values (tax, liquidated damages, recoupment, retention, and total), while retaining the displayed aggregate.

Workflow Engine
Store workflow definitions as immutable versions.
Admin edits a draft version; only validated drafts can be published.
New documents bind to the active version at creation time.
Existing documents stay on their original version unless an explicit, previewed migration is performed.
Nodes define label, key, department owner, field schema, position, required/edit permissions, and node type.
Edges define allowed forward, return, branch, and exception transitions plus optional conditions.
Validate drafts before publish: one start node, reachable required nodes, valid department/permission references, supported conditions, no duplicate keys, and no unintended dead ends.
Include configurable return transitions to support Pre-Audit concerns and other departmental corrections without erasing history.
Every transition creates an append-only movement event; corrections create new audit revisions rather than rewriting history invisibly.
Use optimistic concurrency/version numbers so simultaneous edits produce a clear conflict instead of silently overwriting data.
Primary Data Entities
User, Credential, Session, RegistrationRequest, PasswordResetToken
Department, Role, Permission, RolePermission, UserRole
PageFeature and role/user access overrides
Workflow, WorkflowVersion, WorkflowNode, WorkflowEdge, WorkflowCondition
DocumentRecord (the tracked procurement/project item)
DocumentFieldValue (typed values tied to workflow nodes)
DocumentMovement (forward/return/reroute history and current state)
CommentOrConcern (reason and resolution for returns/exceptions)
AuditEvent (actor, effective actor during impersonation, action, target, before/after summary, timestamp, request metadata)
ImpersonationSession
Notification and optional user notification preferences
SystemSetting
Store money as fixed-precision decimals and dates/timestamps with explicit timezone handling. Use stable public IDs separate from internal database IDs.

Pages and User Experience
Public and Authentication
Login — username or email plus password, generic failure messages, lockout/rate limiting.
Registration request — full name, username, email, requested role, office/designation, password confirmation, and versioned Terms acceptance. Registration remains pending until Admin approval.
Password reset/change — expiring, single-use reset flow; no password viewing.
Pending/rejected account status — clear state without exposing administrative details.
Staff and SAO
Overview/Home — assigned/current items, pending handoffs, returned concerns, delayed items, and recent activity.
Main Document Flow Grid — spreadsheet-style virtualized grid with sticky identifier columns, horizontal scrolling across workflow fields, department grouping, filters, sorting, saved views, and permission-aware cell editing.
Document Detail — all typed fields, current node/status, visual route, chronological movement timeline, concerns/returns, and audit-visible changes.
Create Document/Project — initialize a tracked record using the currently published workflow.
Notifications — live assignments, handoffs, returns, approvals, and relevant changes.
Profile/Security — profile details, password change, active sessions, sign out other sessions.
Admin
Dashboard — totals by state/department, stalled or delayed records, returns/concerns, throughput, recent activity, pending registrations, and service health summary.
User Management — approve/reject requests, block/unblock, assign departments/roles, revoke sessions, reset passwords, and start reason-required impersonation.
Role and Permission Management — permission matrix and protected-system-role safeguards.
Page/Feature Management — enable/disable navigable modules without bypassing backend authorization.
Visual Workflow Builder — node palette, canvas, inspector, typed field configuration, department ownership, edge/condition editor, validation results, draft preview, version history, publish, and rollback by republishing an older definition as a new version.
Audit Trail — filter by actor/effective actor, action, entity, department, and date; inspect before/after changes; export where authorized.
Settings — system defaults, security/session policy, profile, and password settings.
During impersonation, show a persistent banner, prohibit privilege escalation and sensitive admin actions as appropriate, set a short expiration, allow immediate exit, and record both the admin actor and effective user on every action.

Realtime Design
REST remains the authoritative mutation/query interface; clients do not mutate records directly through sockets.
After a committed database transaction, the API emits scoped events such as document.created, document.field.updated, document.moved, document.returned, workflow.published, notification.created, and relevant user-status events.
Authenticate the Socket.IO handshake using the same secure session and re-check authorization when joining rooms.
Use rooms by user, role/department where appropriate, and document ID. Never broadcast unrestricted record payloads globally.
Events carry IDs, versions, event type, and minimal changed data. TanStack Query invalidates/refetches authoritative data after receipt.
Implement reconnect recovery by refetching changed lists/details; do not assume socket delivery is durable.
Persist important notifications and all business/audit events in PostgreSQL before emitting them.
Begin with a single Socket.IO API instance. Add Redis Pub/Sub and the Socket.IO Redis adapter only when running multiple API replicas.
Provide polling/refetch fallback when socket connectivity is temporarily unavailable.
API Areas
/auth — login, logout, registration, reset/change password, sessions
/users, /registration-requests, /roles, /permissions, /departments
/workflows, /workflow-versions, /workflow-validation, /workflow-publish
/documents, /documents/:id/fields, /documents/:id/movements, /documents/:id/returns
/notifications
/features
/audit-events
/impersonation
/settings
/health/live and /health/ready
Generate OpenAPI documentation from backend contracts and keep shared event/DTO contracts versioned.

Security and Audit Requirements
Hash passwords with Argon2id; never log, expose, decrypt, or display passwords.
Use secure cookie sessions, CSRF protection, login and reset rate limits, token rotation, session revocation, and account blocking.
Enforce every permission and department ownership rule in the API; hidden/disabled UI is not authorization.
Record login/security events, user/role changes, workflow draft/publish activity, field edits, movements, returns, page toggles, password resets, and impersonation.
Redact secrets and password/token fields from logs and audit payloads.
Apply restrictive CORS, Content Security Policy, security headers, request size limits, schema validation, and parameterized database access.
Keep the database private to the Docker network; expose only Nginx HTTP/HTTPS.
Back up PostgreSQL automatically and test restoration before launch.
Define audit retention and privacy policy with the organization before production.
Implementation Steps
Phase 0 — Requirements Validation
Review all 37 labels, acronyms, required/optional status, data types, formulas, and ownership with SAO stakeholders.
Clarify whether MCC and COA are active departments/approval nodes in release 1, since they appear in process1.md but not as owners in process2.md.
Confirm allowed return routes, who can initiate/resolve concerns, and whether a returned record can edit only flagged fields or all department-owned fields.
Define document identity/search fields, status vocabulary, due dates/delay rules, payment-mode values (Letter, LDAP, eMDS, Check), timezone, and audit retention.
Produce acceptance criteria and a signed-off default workflow fixture before implementation.
Phase 1 — Foundation
Initialize Git and the TypeScript/pnpm monorepo.
Scaffold Next.js, NestJS, shared contracts, Prisma, linting, formatting, tests, environment validation, and CI.
Add AGENTS.md with confirmed setup, migration, seed, test, build, and deployment commands so future agents have persistent repository guidance.
Add Docker Compose for local PostgreSQL and application services; provide sanitized .env.example files only.
Establish database migrations, transactional helpers, health endpoints, structured logging, and error conventions.
Phase 2 — Identity, Registration, and Authorization
Build secure sessions, login/logout, registration approval, blocking, password reset/change, and session management.
Implement departments, roles, granular permissions, and backend guards.
Seed initial roles/departments and test cross-department read versus edit restrictions.
Add audited impersonation with reason, expiration, banner state, and actor/effective-actor tracking.
Phase 3 — Workflow Engine and Builder
Implement workflow/version/node/edge/condition persistence and validation.
Convert the 37 process2.md entries into typed, idempotent seed data and a default linear graph.
Build draft editing, validation, preview, publish, version history, and safe rollback/republication APIs.
Build the React Flow admin canvas, node inspector, edge/condition configuration, department ownership controls, and publish confirmation.
Add unit/property tests for graph validation and authorization.
Phase 4 — Document Tracking Core
Implement document creation bound to the current published workflow version.
Implement typed field values, department-authorized editing, optimistic concurrency, movement/return actions, concerns, and immutable history.
Build the virtualized spreadsheet grid and detailed document/timeline views.
Add filters, sorting, search, department grouping, status indicators, and delayed/stalled calculations.
Add export only if approved during requirements validation; do not add file upload.
Phase 5 — Realtime and Notifications
Add authenticated Socket.IO gateway and authorized room subscriptions.
Emit events only after successful commits and implement query invalidation/refetch on clients.
Add persistent in-app notifications for assignments, handoffs, returns, and workflow publication.
Test unauthorized subscriptions, reconnect behavior, event ordering/version conflicts, and polling fallback.
Phase 6 — Administration and Reporting
Build admin dashboard and operational metrics.
Complete user, role/permission, and feature/page management.
Build searchable audit trail with safe authorized export.
Complete settings, profile/security, and session controls.
Phase 7 — Hardening and Deployment
Run accessibility, responsive-layout, security, performance, and concurrency reviews.
Create production Docker images and Compose services for Nginx, web, API, and PostgreSQL.
Configure VPS firewall, TLS, domains, persistent volumes, secrets, process restarts, monitoring, and log rotation.
Configure automated database backups off the VPS and perform a restore drill.
Run staging user acceptance tests with representatives from every department before production launch.
Publish an operations runbook covering deployment, rollback, backup/restore, account recovery, and incident response.
Files to Create or Modify
The repository currently contains only process1.md and process2.md; implementation will introduce the following main areas:

AGENTS.md — persistent repository and verification guidance for developers/agents
pnpm-workspace.yaml, root package.json, TypeScript/lint/test configuration
apps/web/** — Next.js routes, grid, document detail, dashboards, admin modules, and realtime client
apps/api/** — NestJS modules, guards, services, REST controllers, Socket.IO gateway, and health checks
packages/db/prisma/schema.prisma and migrations — relational schema
packages/db/prisma/seed.* — departments, roles, permissions, and the signed-off 37-step default workflow
packages/contracts/** — shared validation, DTOs, permissions, and realtime event contracts
packages/ui/** — shared UI elements if justified by actual reuse
infra/** — local/production Compose, Nginx, deployment, backup, and observability configuration
.github/workflows/** — CI checks after a Git repository is initialized
No IDE skill is required just to implement the product. Create a project-specific skill under .devin/skills/ only if repeated, specialized workflow-builder or deployment procedures emerge; do not duplicate information that belongs in AGENTS.md.

Verification
 Unit tests for workflow graph validation, conditions, calculated fields, movement rules, permissions, and audit serialization
 API integration tests for auth, registration approval, role/department boundaries, field edits, returns, workflow publishing, impersonation, and audit creation
 Realtime integration tests for authenticated connection, room authorization, post-commit emission, reconnect/refetch, and forbidden data leakage
 Frontend component tests for editable/read-only grid cells, workflow builder validation, impersonation banner, and admin controls
 Playwright end-to-end flows for each seeded role plus Admin and SAO
 Concurrency tests proving stale field updates are rejected clearly
 Accessibility checks for keyboard grid navigation, forms, dialogs, status indicators, and workflow builder alternatives
 Performance test with an agreed realistic record count and concurrent socket connections
 Security checks for dependency vulnerabilities, authorization bypass, CSRF, rate limiting, session revocation, and sensitive-data redaction
 pnpm lint
 pnpm typecheck
 pnpm test
 pnpm test:e2e
 pnpm build
 Prisma migration deploy and idempotent seed verification against a clean staging database
 Production-like Docker Compose smoke test through Nginx and TLS
 Backup restoration drill and staging user acceptance sign-off
Risks and Considerations
Specification gaps: MCC and COA routing, returns, payment modes, formulas, and the final remarks placement differ or are incomplete across the source documents. Resolve these in Phase 0 instead of encoding assumptions.
Builder complexity: A full conditional graph builder is substantially more complex than ordering fixed columns. Versioning, publish validation, immutable historical bindings, and migration safeguards are mandatory.
Grid performance: Thirty-seven columns are manageable, but growing record counts require virtualization, server-side filtering/pagination, and appropriate indexes.
Realtime consistency: Socket events are notifications, not the source of truth. Database transactions, record versions, and post-reconnect refetches prevent missed events and silent overwrites.
VPS operations: The VPS requires patching, firewall/TLS management, monitoring, backups, and restore testing; these responsibilities do not exist to the same degree on managed hosting.
Single-instance availability: Initial deployment has a single API/socket instance. Horizontal scaling later requires shared session strategy and Redis-backed Socket.IO fan-out.
Audit integrity: Broad admin powers and impersonation increase risk. Require reasons, short-lived sessions, dual actor identity, append-only records, and restrictive action boundaries.
Page disabling: Turning off a page is a feature-availability control, not an authorization mechanism; backend permissions remain enforced.
No file storage: Scope must remain metadata and physical-document movement tracking unless a separately reviewed document-management feature is approved later.
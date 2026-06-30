# PayCore Admin Dashboard Design

Date: 2026-06-29
Status: Draft approved for user review

## Goal

Build a PayCore admin dashboard that makes it easy to integrate new AppVibe projects without repeated code changes in PayCore or heavy manual setup in each consumer project.

The MVP focuses on project onboarding first. Monitoring order/payment/fulfillment remains part of the broader dashboard direction, but it is not the first implementation focus.

## Chosen Approach

Use an Admin API Orchestrator architecture:

- A separate admin frontend lives under this repo in `admin/` and deploys to Cloudflare Pages.
- Cloudflare Access protects the Pages dashboard.
- The dashboard calls PayCore Admin API endpoints only.
- PayCore Worker owns all sensitive actions: app creation, provider template selection, secret generation, Cloudflare Workers Secrets API calls, audit logging, integration tests, and generated integration artifacts.
- The browser never receives or stores the Cloudflare API token.

This gives the dashboard a clean control-plane shape while keeping privileged operations inside PayCore.

## Architecture

### Components

1. `admin/` Cloudflare Pages app
   - Single-page admin dashboard.
   - Protected by Cloudflare Access.
   - Uses Access identity headers/JWT when calling PayCore Admin API.
   - Provides power-user forms, generated output, and integration test controls.

2. PayCore Worker Admin API
   - Existing `/admin/*` routes remain for order operations.
   - New app onboarding routes handle app records, provider templates, credentials, activation, testing, and integration kits.
   - Validates admin identity via Cloudflare Access or local dev token.
   - Stores the scoped Cloudflare API token as a Worker secret.

3. D1
   - Existing `apps`, `merchant_profiles`, and `audit_logs` tables remain core.
   - Add credential/onboarding metadata so new apps do not require TypeScript edits for each secret mapping.
   - Store secret references, not secret values.

4. Cloudflare API
   - PayCore Worker uses a scoped Cloudflare API token to create/update PayCore Worker secrets.
   - Secret values are pushed via Cloudflare Workers Secrets API.
   - The token should be scoped to the least privileges needed for the PayCore Worker.

5. Payment providers
   - MVP supports Duitku and Mayar.
   - The model stays provider-registry based so Midtrans can be added later without changing the onboarding UX.

## Admin UI

The MVP dashboard uses one dense single-page form, not a wizard.

### Layout

- Left sidebar: project catalog, status, draft/active project list, quick search.
- Main panel: full project onboarding/edit form.
- Right panel: generated output, integration tests, audit/status.

### Primary Actions

- `Save draft`
- `Create staging`
- `Activate production`
- `Rotate secrets`
- `Run webhook ping`
- `Create sandbox order`
- `Copy env`
- `Download integration kit`
- `Copy Codex prompt`
- `Copy fix prompt`

### Project Form Sections

- Project identity:
  - display name
  - `app_id`
  - order prefix
  - generated or custom key id
  - environment
  - status

- URLs:
  - webhook URL
  - one or more allowed return URLs

- Provider template:
  - select existing provider template
  - create provider template if needed
  - provider options initially include Duitku and Mayar
  - data model stays ready for Midtrans

- Secrets:
  - generate app secret
  - generate webhook secret
  - set/rotate Worker secrets through PayCore Admin API
  - show secret value only once after generation/rotation

- Integration output:
  - env vars
  - stack-specific snippets/templates
  - downloadable file bundle
  - Codex prompt for the consumer project repo

- Integration tests:
  - webhook ping
  - sandbox order
  - latest status and failure details

- Audit/status:
  - last action
  - actor
  - timestamp
  - environment
  - request id

## Backend API

Add these PayCore Admin API resources:

```text
GET    /admin/apps
POST   /admin/apps
GET    /admin/apps/:app_id
PATCH  /admin/apps/:app_id
POST   /admin/apps/:app_id/activate
POST   /admin/apps/:app_id/rotate-secrets

GET    /admin/merchant-profiles
POST   /admin/merchant-profiles

POST   /admin/apps/:app_id/tests/webhook-ping
POST   /admin/apps/:app_id/tests/sandbox-order

GET    /admin/apps/:app_id/integration-kit
```

Exact route shapes can be adjusted during implementation if they better match existing Hono route conventions, but the resource boundaries should stay the same.

### API Behavior

`POST /admin/apps`

- Validates app slug, display name, order prefix, key id, URLs, environment, and provider template.
- Rejects duplicate app slug, order prefix, and key id.
- Creates D1 app metadata.
- Generates or records secret refs.
- Optionally pushes generated Worker secrets.
- Writes audit log.

`POST /admin/apps/:app_id/activate`

- Requires a confirmation phrase for production activation.
- Ensures required URLs, provider template, key id, app secret ref, and webhook secret ref are configured.
- Pushes required secrets when requested.
- Updates status to active.
- Writes audit log.

`POST /admin/apps/:app_id/rotate-secrets`

- Requires confirmation.
- Generates new app and/or webhook secrets.
- Pushes updates through Cloudflare Workers Secrets API.
- Shows new secret values once in the response.
- Writes audit log.

`POST /admin/apps/:app_id/tests/webhook-ping`

- Sends a signed synthetic PayCore event to the configured webhook URL.
- Records HTTP status, response body excerpt, latency, request id, and result.
- Does not require a provider checkout.

`POST /admin/apps/:app_id/tests/sandbox-order`

- Creates a staging sandbox order through normal PayCore order creation flow.
- Lets the admin complete provider-side sandbox payment when needed.
- Records status and next action.

`GET /admin/apps/:app_id/integration-kit`

- Returns generated env vars, stack templates, downloadable file definitions, checklist markdown, and a ready-to-copy Codex prompt for the consumer project.

## Data Model

### `apps`

Keep the existing table as the source of project identity. Add fields or companion records for:

- app key id
- app secret ref
- environment/status metadata if needed
- activation/test status if it belongs directly on app summary

### `merchant_profiles`

Use merchant profiles as reusable provider templates for MVP.

Each profile/template represents a reusable provider setup such as:

- Mayar AppVibe Main
- Mayar Production
- Duitku Sandbox
- Duitku AppVibe Main

When a new project selects a provider template, the dashboard reuses the provider, profile key, credential ref, currency, and status metadata.

If template needs grow beyond what `merchant_profiles` can cleanly express, add a separate `provider_templates` table later. Do not add that table in MVP unless implementation proves it is necessary.

### `app_credentials`

Add a credentials mapping so PayCore can resolve app secrets generically without editing `src/config/env.ts` for every new project.

Suggested fields:

- id
- app id / app uuid
- environment
- key id
- app secret ref
- webhook secret ref
- active flag
- created at
- rotated at

### `onboarding_runs`

Track multi-step onboarding operations and repair states.

Suggested fields:

- id
- app id / app uuid
- environment
- action
- status
- actor id
- request id
- input summary
- result summary
- error code
- error detail
- created at
- updated at

This is useful when a Cloudflare secret update succeeds but a later D1 write fails, or when a provider/test operation needs follow-up.

### `integration_tests`

Track test attempts separately from app activation.

Suggested fields:

- id
- app id / app uuid
- environment
- test type
- status
- request id
- target URL
- response status
- response body excerpt
- latency ms
- generated fix prompt
- created at

## Secret Handling

Secret values must not be stored in D1.

D1 stores secret refs such as:

```text
APP_SIKLUSIO_STAGING_SECRET
WEBHOOK_SIKLUSIO_STAGING_SECRET
```

The Worker environment stores secret values. PayCore Admin API creates or updates them using the Cloudflare Workers Secrets API.

Secret names should be deterministic, environment-aware, and stable:

```text
APP_<APP_ID>_<ENVIRONMENT>_SECRET
WEBHOOK_<APP_ID>_<ENVIRONMENT>_SECRET
```

Production secret creation and rotation require explicit confirmation. Secret values are shown once immediately after generation or rotation and must be omitted from audit logs, stored test logs, generated prompts, and error details.

## Generic Secret Resolution

Replace hard-coded `resolveAppSecret` and `resolveWebhookSecret` behavior with D1-backed mapping plus env lookup.

Current issue:

- Adding a new app requires editing TypeScript env schema/resolver code.

Target:

- App auth uses `X-PayCore-Key-Id`.
- PayCore looks up the active credential mapping in D1.
- The mapping returns an app secret ref.
- PayCore reads the corresponding secret value from Worker env.
- Webhook delivery reads `webhook_secret_ref` in the same generic way.

Implementation needs a small helper that safely resolves env values by secret ref while rejecting unknown refs and keeping type boundaries explicit.

## Provider Templates

Provider templates make provider setup reusable across projects.

MVP uses `merchant_profiles` as the backing store and presents them in the UI as templates. Creating a template once lets future projects reuse it without retyping provider details.

Provider templates include:

- display label
- provider
- profile key
- merchant code or provider account id
- credential ref
- currency
- status

Credential values for providers remain configured outside this dashboard. The dashboard can create or select the `credential_ref`, but it does not store provider API keys in D1.

## Integration Kit

After creating a project, the dashboard should generate practical artifacts that reduce consumer-project coding:

- copyable env vars
- stack-specific code snippets
- downloadable bundle files
- integration checklist markdown
- copyable Codex prompt for the consumer repo

Initial stack templates:

- Generic Node/TypeScript
- Next.js
- Hono/Cloudflare Workers
- Laravel/PHP

Each template should cover:

- signing requests to PayCore
- creating orders
- storing PayCore `order_id`
- receiving `payment.succeeded`
- verifying `X-PayCore-Event-Signature`
- idempotent fulfillment by `event_id` and `order_id`
- local/staging test checklist

## Test Integration

### Webhook Ping

Webhook ping is the fast test.

It sends a signed synthetic PayCore event to the project webhook URL and records:

- status
- HTTP status code
- response body excerpt
- latency
- request id
- failure reason
- copyable fix prompt

### Sandbox Order

Sandbox order is the realistic test.

It creates a staging order through PayCore's existing order flow. The dashboard records the checkout URL and status. Once payment/provider sandbox steps are completed, normal webhook delivery validates the end-to-end path.

Webhook ping and sandbox order are separate so a project can validate webhook signature handling before payment-provider setup is fully ready.

## Error Handling

Every important error should include:

- human-readable summary
- technical code
- request id
- app id
- environment
- failed operation
- next recommended action
- copyable fix prompt for an agent

The dashboard should provide `Copy fix prompt` for:

- webhook ping failure
- sandbox order failure
- signature mismatch
- missing env in consumer project
- duplicate app id / order prefix / key id
- provider template or credential ref error
- Cloudflare secret push failure
- production activation failure

Fix prompts must never include secret values. They may include secret refs and status.

Example:

```text
Saya sedang mengintegrasikan project Siklusio dengan PayCore.
Environment: staging
App ID: siklusio
Error: webhook_ping_failed
PayCore request_id: req_xxx
Webhook URL: https://api-staging.siklusio.web.id/internal/payment-events
Response status: 401
Tolong cek implementasi route webhook PayCore di repo ini, terutama verifikasi X-PayCore-Event-Signature dan raw body handling.
```

For partial failures, use `onboarding_runs` status values such as:

- `succeeded`
- `failed`
- `needs_repair`
- `rolled_back`

If a Cloudflare secret push succeeds but a D1 write fails, the backend should either perform a safe compensating action or mark the run `needs_repair` with enough context for an admin to resolve it.

## Security

- Cloudflare Access protects the Pages dashboard.
- PayCore Admin API validates Cloudflare Access identity or local dev token.
- Cloudflare API token is stored only as a PayCore Worker secret.
- Use one scoped Cloudflare API token for MVP, limited to managing PayCore Worker secrets/deployment resources.
- Production activation and secret rotation require confirmation phrase.
- Audit logs record actor, action, entity, environment, request id, and safe metadata.
- Audit logs never record secret values.
- UI should show secret values once only.
- Generated prompts and error payloads must redact secret values.

## Testing Strategy

Backend tests:

- app repository create/list/detail/update
- credential mapping and generic secret resolution
- provider template create/list/select
- duplicate app id/order prefix/key id validation
- production confirmation requirement
- rotate secrets with mocked Cloudflare API client
- webhook ping signature generation
- integration kit generation
- audit log creation for sensitive actions

UI tests:

- required field validation
- generated output rendering
- provider template selection
- copy env / copy Codex prompt / copy fix prompt
- activation confirmation flow

Manual staging tests:

- create a staging project
- verify Worker secrets are configured
- run webhook ping against a test consumer endpoint
- create sandbox order
- verify signed `payment.succeeded` delivery
- test duplicate webhook event handling in the consumer app

## Out Of Scope For MVP

- Full role system. MVP uses one admin level with audit logging, while leaving room for viewer/operator/owner roles later.
- Full monitoring dashboard. Existing order admin APIs can remain available, but the first build focuses on onboarding.
- Automatic provider credential creation for Duitku/Mayar/Midtrans.
- Midtrans provider adapter implementation.
- Moving dashboard to a separate repo.

## Implementation Constraints

- Add `.superpowers/` to `.gitignore` or avoid staging brainstorming companion artifacts.
- Confirm exact Cloudflare Workers Secrets API request shape during implementation using the current Cloudflare docs/OpenAPI spec.
- Keep route and table names aligned with existing Hono/D1 patterns in the repo.

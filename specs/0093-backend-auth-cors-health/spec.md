# Spec: Backend auth, CORS and health endpoint

- **Issue:** #93
- **Status:** Done
- **Milestone / label:** backend / hardening
- **Owner:** spec-author

> Stage 1 of the [SDD pipeline](../README.md).

## Problem

The FastAPI Community API (`backend/`) is unauthenticated: every write endpoint (create/delete of
steps, actions and templates) is open to anyone who can reach the service. It also ships no CORS
policy and no health/liveness endpoint, so it cannot be safely exposed or monitored behind a
reverse proxy or container orchestrator.

## Value

Closing writes behind a shared token stops anonymous mutation of the community catalogue; an
explicit CORS policy lets the origin set be locked down per deployment; a `/health` probe makes the
service deployable behind orchestrators and load balancers. The plugin only ever performs GETs
against the backend, so guarding writes does not affect it.

## Functional requirements

- **FR-1** — `create_application()` installs `CORSMiddleware`. Allowed origins are read from the
  `ZETTELFLOW_ALLOWED_ORIGINS` env var (comma-separated), defaulting to `*`. Usual methods and
  headers are allowed.
- **FR-2** — A public `GET /health` endpoint returns a typed `{ "status": "ok" }` body and does not
  require auth or touch the database.
- **FR-3** — A `require_token` FastAPI dependency reads the `X-ZettelFlow-Token` header and compares
  it, in constant time (`secrets.compare_digest`), to the `ZETTELFLOW_TOKEN` env var.
- **FR-4** — If `ZETTELFLOW_TOKEN` is unset the server is misconfigured and writes fail closed with
  **HTTP 503**. If the header is missing or does not match, the request is rejected with **HTTP 401**.
- **FR-5** — `require_token` guards **only** the write endpoints: `POST /steps/create`,
  `DELETE /steps/{id}`, `POST /actions/create`, and `DELETE /templates/delete/{id}`. All `GET`
  endpoints stay public.

## Acceptance criteria

- **AC-1** — Given `ZETTELFLOW_TOKEN` is set, when a write request omits or sends a wrong
  `X-ZettelFlow-Token`, then the response is 401; when it sends the correct token, the write
  proceeds as before.
- **AC-2** — Given `ZETTELFLOW_TOKEN` is unset, when any write endpoint is called, then the response
  is 503.
- **AC-3** — Every `GET` endpoint (`/health`, `/steps/{id}`, `/actions/{id}`, `/templates/filter`,
  `/templates/item/{id}`) responds without any token.
- **AC-4** — `GET /health` returns `{"status":"ok"}` validated against a `HealthResponse` model.
- **AC-5** — The comparison uses `secrets.compare_digest` (constant-time), not `==`.

## Capability disclosure (constitution §VII)

- [x] Network — backend-side only. This is the optional Community backend service, not the plugin;
  the plugin's network use is already disclosed. No new plugin capability.

## Out of scope

- Per-user accounts, OAuth, rate limiting, or rotating tokens (single shared secret only).
- Changing the plugin (`src/`) — it performs no writes, so no client change is needed.
- HTTPS/TLS termination (handled by the deployment's reverse proxy).

## Open questions

None.

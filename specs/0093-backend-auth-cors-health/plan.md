# Plan: Backend auth, CORS and health endpoint

- **Spec:** [spec.md](spec.md)
- **Status:** Approved
- **Owner:** implementation-planner

## Approach

Keep the existing app-factory shape (`create_application()` wiring repositories → services →
routers). Add a small `interfaces/api/security.py` exposing a `require_token` FastAPI dependency,
and attach it to the write routes via each route's `dependencies=[Depends(require_token)]` (routers
mix public GETs and guarded writes, so the guard is per-route, not router-wide). Add
`CORSMiddleware` and a `/health` route directly in the factory. Env vars are read at call time
(not import time) so the process can be configured after import.

## Files touched

| File | Layer | Change |
|---|---|---|
| `backend/app/interfaces/api/security.py` | interfaces | New. `require_token` dependency: reads `X-ZettelFlow-Token`, compares to `ZETTELFLOW_TOKEN` with `secrets.compare_digest`; 503 if unset, 401 if missing/mismatch. |
| `backend/app/main.py` | app factory | Add `CORSMiddleware` (origins from `ZETTELFLOW_ALLOWED_ORIGINS`, default `*`); add public `GET /health` → `HealthResponse`. |
| `backend/app/interfaces/api/controllers/step_controller.py` | interfaces | `Depends(require_token)` on `POST /create` and `DELETE /{id}`. |
| `backend/app/interfaces/api/controllers/action_controller.py` | interfaces | `Depends(require_token)` on `POST /create`. |
| `backend/app/interfaces/api/controllers/template_controller.py` | interfaces | `Depends(require_token)` on `DELETE /delete/{id}`. |
| `backend/app/interfaces/api/schemas.py` | interfaces | `HealthResponse` (added alongside the #94 schemas). |

## Obsidian score impact (constitution §I)

n/a — backend-only change; the `eslint-plugin-obsidianmd` rules apply to the plugin `src/`, which is
untouched. `npm run lint:obsidian` delta: 0.

## Test strategy (constitution §II)

The repo's jest/TDD harness targets the plugin, not the FastAPI backend, and FastAPI/Pydantic are
not installed in this environment (packages must not be installed here), so an automated
`TestClient` run is not possible. Verification is:

- `python -m compileall backend/app` (syntax) — green.
- Manual review of the auth matrix (503 when unset, 401 on missing/mismatch, pass on match) and that
  only the four write routes carry `Depends(require_token)`.
- CORS decisions: credentials disabled (token is a custom header, not a cookie), which also keeps a
  wildcard origin spec-compliant.

## i18n impact (constitution §IV)

None — no plugin UI text. Backend error details are English-only (developer-facing).

## Docs impact (constitution §VIII)

Backend README/compose docs should note the new env vars (`ZETTELFLOW_TOKEN`,
`ZETTELFLOW_ALLOWED_ORIGINS`) when the backend docs are next touched. No `mkdocs.yml` nav change.

## Rollout & rollback

Ships with the backend image. Set `ZETTELFLOW_TOKEN` in the deployment env before enabling writes
(otherwise writes 503 by design). Rollback = revert the commit; GETs are unaffected either way.

## Risks

Low. Fail-closed 503 means a deployment that forgets `ZETTELFLOW_TOKEN` cannot write — intended.
The plugin performs no writes, so there is no client-compatibility risk.

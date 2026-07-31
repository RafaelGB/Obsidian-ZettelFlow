# Tasks: Backend auth, CORS and health endpoint

- **Plan:** [plan.md](plan.md)

## Tasks

- [x] **T1 — `HealthResponse` model** (covers FR-2)
  - Green: add `HealthResponse(status: str)` to `interfaces/api/schemas.py`.
  - Guardrail: `python -m compileall backend/app` green.

- [x] **T2 — `require_token` dependency** (FR-3/FR-4)
  - Green: new `interfaces/api/security.py`; reads `X-ZettelFlow-Token`, compares to
    `ZETTELFLOW_TOKEN` with `secrets.compare_digest`; 503 if env unset, 401 if missing/mismatch.
  - Guardrail: compileall green; manual review of the 503/401/pass matrix.

- [x] **T3 — CORS + `/health` in the app factory** (FR-1/FR-2)
  - Green: `CORSMiddleware` with origins from `ZETTELFLOW_ALLOWED_ORIGINS` (default `*`);
    public `GET /health` → `HealthResponse`.
  - Guardrail: compileall green.

- [x] **T4 — Guard the write endpoints** (FR-5)
  - Green: `Depends(require_token)` on `POST /steps/create`, `DELETE /steps/{id}`,
    `POST /actions/create`, `DELETE /templates/delete/{id}`; GETs untouched.
  - Guardrail: compileall green; grep confirms exactly the four write routes carry the dependency.

## Definition of done

- [x] All tasks done; AC-1..AC-5 satisfied by review (FastAPI not installed here, so no TestClient
  run); `python -m compileall backend/app` green; plugin `src/` untouched.

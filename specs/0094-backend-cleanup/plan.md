# Plan: Backend cleanup — dependencies, typing and dead code

- **Spec:** [spec.md](spec.md)
- **Status:** Approved
- **Owner:** implementation-planner

## Approach

Four independent, low-risk edits. (1) Rewrite `requirements.txt` to the runtime-only set at current
pins. (2) `docs/requirements.txt` already pins the MkDocs toolchain, so leave it as-is (docs CI is
unaffected). (3) Drop `--reload` from the Dockerfile `CMD`. (4) Introduce a small `schemas.py` of
Pydantic response models and swap each `response_model=Dict` for a concrete model, reusing the
existing domain models for GET-by-id. Delete the empty `routers/` package. Response models are kept
permissive (`extra="allow"`) where the stored document is dynamic, so the wire shape is byte-identical.

## Files touched

| File | Layer | Change |
|---|---|---|
| `backend/requirements.txt` | build | Rewrite to 7 runtime deps; drop mkdocs + fastapi-cli/rich/typer chain. |
| `backend/Dockerfile` | build | Remove `--reload` from `CMD`; update the (Spanish) comment. |
| `backend/app/interfaces/api/schemas.py` | interfaces | New. `DeleteResponse`, `PageInfo`, `TemplatesPage`, `CreateResponse`, `TemplateItemResponse` (+ `HealthResponse` from #93). |
| `backend/app/interfaces/api/controllers/step_controller.py` | interfaces | `CreateResponse` (create), `CommunityStepSettings` (get), `DeleteResponse` (delete). |
| `backend/app/interfaces/api/controllers/action_controller.py` | interfaces | `CreateResponse` (create), `CommunityAction` (get). |
| `backend/app/interfaces/api/controllers/template_controller.py` | interfaces | `TemplatesPage` + `response_model_exclude_none=True` (filter), `TemplateItemResponse` (item), `DeleteResponse` (delete). |
| `backend/app/interfaces/api/routers/` | interfaces | Delete package (four 0-byte files). |

## Obsidian score impact (constitution §I)

n/a — backend-only; plugin `src/` untouched. `npm run lint:obsidian` delta: 0.

## Test strategy (constitution §II)

No backend Python test harness exists and FastAPI/Pydantic are not installed here (no installs
allowed), so verification is static:

- `python -m compileall backend/app` — green.
- Wire-shape check by reading the repositories: `create_*` return the serialized document with `id`
  → `CreateResponse(id, extra=allow)` passes it through unchanged; `read_templates` returns
  `{items, page_info:{skip,limit,has_next}}` → `TemplatesPage` with `response_model_exclude_none`
  keeps it byte-identical; GET-by-id returns the stored doc → domain models (`extra='allow'`) pass
  it through.
- Grep guardrails for AC-1/AC-4/AC-6.

## i18n impact (constitution §IV)

None.

## Docs impact (constitution §VIII)

`docs/requirements.txt` deliberately keeps the MkDocs toolchain so `.github/workflows/documentation.yml`
still builds. No content or nav change.

## Rollout & rollback

Ships in the backend image build. Rollback = revert the commit; models are additive and permissive,
so no data or contract migration.

## Risks

Low. The one subtlety: response models reused for GET-by-id (`CommunityStepSettings`/`CommunityAction`)
validate stored documents; because both carry `extra='allow'` and every field a create requires is
present at read time, well-formed documents serialize unchanged. A malformed legacy document could
now surface a 500 where `Dict` previously passed it through — acceptable and more correct.

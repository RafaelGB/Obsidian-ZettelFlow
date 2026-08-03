# Tasks: Backend cleanup — dependencies, typing and dead code

- **Plan:** [plan.md](plan.md)

## Tasks

- [x] **T1 — Trim `requirements.txt`** (covers FR-1)
  - Green: rewrite to the 7 runtime deps at current pins; remove mkdocs + fastapi-cli/rich/typer.
  - Guardrail: grep for `mkdocs`/`typer`/`rich`/`fastapi-cli`/`Markdown` returns nothing.

- [x] **T2 — Keep docs deps working** (FR-2)
  - Green: confirm `docs/requirements.txt` already pins `mkdocs` + `mkdocs-material`; leave as-is.
  - Guardrail: `docs/requirements.txt` still lists both.

- [x] **T3 — Production Dockerfile `CMD`** (FR-3)
  - Green: drop `--reload`; keep host/port and `main:app`.
  - Guardrail: `CMD` has no `--reload`.

- [x] **T4 — Typed response models** (FR-4/FR-5)
  - Green: add `schemas.py`; replace every `response_model=Dict` with a concrete model; reuse
    `CommunityStepSettings`/`CommunityAction` for GET-by-id; `response_model_exclude_none=True` on
    `/templates/filter`.
  - Guardrail: grep for `response_model=Dict` returns no route matches; `compileall` green.

- [x] **T5 — Delete the vestigial `routers/` package** (FR-6)
  - Green: remove the four 0-byte files / the directory.
  - Guardrail: directory gone; grep confirms nothing imports `interfaces.api.routers`.

## Definition of done

- [x] All tasks done; AC-1..AC-7 satisfied by review + `python -m compileall backend/app` green;
  wire shape preserved; plugin `src/` untouched.

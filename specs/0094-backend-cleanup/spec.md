# Spec: Backend cleanup — dependencies, typing and dead code

- **Issue:** #94
- **Status:** Done
- **Milestone / label:** backend / hardening
- **Owner:** spec-author

> Stage 1 of the [SDD pipeline](../README.md).

## Problem

`backend/requirements.txt` mixes the FastAPI runtime with the entire MkDocs/docs toolchain and a
dev-CLI chain (fastapi-cli/rich/typer), bloating the production image and coupling backend builds to
docs tooling. The `Dockerfile` runs uvicorn with `--reload` (a dev flag) in the shipped image. Every
route is annotated `response_model=Dict`, so the OpenAPI schema is untyped and responses are
unvalidated. A vestigial `interfaces/api/routers/` package holds four empty (0-byte) files that
nothing imports.

## Value

A minimal runtime requirements file yields a smaller, faster, more secure image and decouples the
backend from docs tooling. Dropping `--reload` gives a correct production posture. Typed response
models make the OpenAPI contract accurate and validate outgoing payloads. Deleting the dead package
removes confusion about where routes live (they live in `controllers/`).

## Functional requirements

- **FR-1** — `backend/requirements.txt` contains only the runtime set at the current pins:
  `fastapi==0.115.6`, `uvicorn[standard]==0.34.0`, `pydantic==2.10.5`, `pymongo==4.10.1`,
  `dnspython==2.7.0`, `python-dotenv==1.0.1`, `python-multipart==0.0.20`. No mkdocs/docs deps and no
  fastapi-cli/rich/typer dev chain.
- **FR-2** — The MkDocs toolchain remains available to the docs workflow (which installs from
  `docs/requirements.txt`, not backend).
- **FR-3** — The `Dockerfile` `CMD` no longer passes `--reload`; host/port and module path are
  unchanged.
- **FR-4** — No route uses `response_model=Dict`. A `schemas.py` module provides typed models:
  `HealthResponse`, `DeleteResponse`, `PageInfo`, `TemplatesPage`, `CreateResponse`,
  `TemplateItemResponse`. GET-by-id endpoints reuse the domain models `CommunityStepSettings` /
  `CommunityAction`.
- **FR-5** — The JSON wire shape returned to the plugin is unchanged.
- **FR-6** — The vestigial `interfaces/api/routers/` package (four empty files) is deleted.

## Acceptance criteria

- **AC-1** — `backend/requirements.txt` has exactly the 7 runtime lines in FR-1; a search for
  `mkdocs`, `typer`, `rich`, `fastapi-cli`, `Markdown` returns nothing.
- **AC-2** — `docs/requirements.txt` still pins `mkdocs` and `mkdocs-material` (docs CI keeps
  working).
- **AC-3** — The `Dockerfile` `CMD` runs `uvicorn main:app --host 0.0.0.0 --port 8000` with no
  `--reload`.
- **AC-4** — A search for `response_model=Dict` across `backend/app` returns no route matches; every
  route names a concrete model.
- **AC-5** — `/templates/filter` still serializes as `{ items, page_info: { skip, limit, has_next } }`
  (the shape the plugin reads); optional `total`/`has_previous` are excluded when null.
- **AC-6** — `backend/app/interfaces/api/routers/` no longer exists; nothing imports it.
- **AC-7** — `python -m compileall backend/app` is green.

## Capability disclosure (constitution §VII)

- [x] None of the above — backend housekeeping; no new plugin capability, no plugin code touched.

## Out of scope

- Changing endpoint behaviour, pagination logic, or adding `total`/`has_previous` to the payload.
- Adding a Python test harness for the backend (tracked separately).
- Replacing `print(...)` logging or reworking the Mongo connection.

## Open questions

None. Note: the plugin's TS response type lists `total` and `has_previous`, but the backend never
emitted them and the plugin only reads `has_next`/`items` at runtime — so the models keep them
optional and excluded, preserving the exact current wire bytes.

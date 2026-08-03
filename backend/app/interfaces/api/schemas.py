"""Pydantic response models for the ZettelFlow Community API.

These replace the previous ``response_model=Dict`` annotations so the OpenAPI
schema is accurate and responses are validated. Where the stored document shape
is dynamic (steps/actions carry arbitrary settings), the model allows extra
fields so the JSON wire shape stays identical to what the plugin receives.
"""

from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    """Payload for the ``GET /health`` liveness probe."""

    status: str


class DeleteResponse(BaseModel):
    """Result of a delete operation (steps/templates)."""

    deleted_count: int


class PageInfo(BaseModel):
    """Pagination metadata for a page of templates."""

    skip: int
    limit: int
    has_next: bool
    # The backend does not currently emit ``has_previous``; the plugin's response
    # type lists it but only reads ``has_next`` at runtime. Kept optional (and
    # excluded when null via ``response_model_exclude_none``) so the wire shape is
    # unchanged while the field can be populated later without a breaking change.
    has_previous: bool | None = None

    model_config = ConfigDict(extra="allow")


class TemplatesPage(BaseModel):
    """Paginated list of community templates (``GET /templates/filter``)."""

    items: list[dict]
    page_info: PageInfo
    # Not currently emitted by the backend (see ``PageInfo.has_previous``).
    total: int | None = None

    model_config = ConfigDict(extra="allow")


class CreateResponse(BaseModel):
    """Document returned after creating a step or action.

    The stored document is dynamic (settings vary by template type), so extra
    fields are allowed and passed through unchanged. ``id`` is always present
    because the repository serializes the inserted ``_id`` into ``id``.
    """

    id: str

    model_config = ConfigDict(extra="allow")


class TemplateItemResponse(BaseModel):
    """A single template document (step or action) fetched by id.

    The shape is heterogeneous depending on ``template_type``, so extra fields
    pass through unchanged.
    """

    id: str

    model_config = ConfigDict(extra="allow")

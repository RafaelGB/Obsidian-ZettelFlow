from fastapi import APIRouter, Query
from typing import Dict, Optional

from app.application.services.template_service import TemplateService

def get_template_router(template_service: TemplateService) -> APIRouter:
    """
    Returns a router for handling template-related routes.
    """
    router = APIRouter()

    @router.get("/filter", response_model=Dict)
    def filter_templates(
        search: Optional[str] = Query(None),
        template_type: Optional[str] = Query(None),
        skip: int = Query(0, ge=0),
        limit: int = Query(10, ge=1)
    ):
        """
        Returns a paginated list of template items.
        """
        return template_service.filter_templates(search, template_type, skip, limit)

    @router.get("/item/{item_id}", response_model=Dict)
    def get_item(item_id: str, item_type: str):
        """
        Retrieves an item by ID and type (step or action).
        """
        return template_service.get_template(item_id, item_type)

    @router.delete("/delete/{template_id}", response_model=Dict)
    def delete_template(template_id: str):
        """
        Deletes a template by ID.
        """
        deleted_count = template_service.delete_template(template_id)
        return {"deleted_count": deleted_count}

    return router

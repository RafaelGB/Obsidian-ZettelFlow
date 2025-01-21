from fastapi import HTTPException
from typing import Optional, Dict

from app.infrastructure.repositories.template_repository import TemplateRepository

class TemplateService:
    """
    Handles business logic for generic template operations 
    (filtering, updating, etc.).
    """
    def __init__(self, repository: TemplateRepository):
        self.repository = repository

    def filter_templates(self, query: Optional[str],template_type:Optional[str], skip: int, limit: int):
        """
        Returns a paginated list of templates, with optional text query.
        """
        return self.repository.read_templates(query, template_type, skip, limit)

    def get_template(self, template_id: str, template_type: str):
        """
        Reads a template item by ID and type ('step' or 'action').
        """
        if template_type == "step":
            return self.repository.get_step_by_id(template_id)
        elif template_type == "action":
            return self.repository.get_action_by_id(template_id)
        else:
            raise HTTPException(status_code=400, detail="Invalid item type")

    def update_template(self, template_id: str, update_data: Dict):
        """
        Updates a template item by its ID.
        """
        updated = self.repository.update_template(template_id, update_data)
        if updated == 0:
            raise HTTPException(status_code=404, detail="Template not found")
        return updated

    def delete_template(self, template_id: str):
        """
        Deletes a template item by its ID.
        """
        deleted = self.repository.delete_template(template_id)
        if deleted == 0:
            raise HTTPException(status_code=404, detail="Template not found")
        return deleted

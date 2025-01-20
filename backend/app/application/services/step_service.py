from fastapi import HTTPException

from app.domain.models.community_step_settings import CommunityStepSettings
from app.infrastructure.repositories.step_repository import StepRepository

class StepService:
    """
    Handles business logic related to CommunityStepSettings.
    """
    def __init__(self, repository: StepRepository):
        self.repository = repository

    def create_step(self, data: CommunityStepSettings):
        """
        Creates a new step in the database, ensuring 'title' is unique.
        """
        if self.repository.exists_by_title(data.title):
            raise HTTPException(status_code=400, detail="Step title already exists")

        created = self.repository.create_step(data)
        return created

    def read_step(self, step_id: str):
        """
        Reads a specific step by its ID.
        """
        step_data = self.repository.get_step_by_id(step_id)
        if not step_data:
            raise HTTPException(status_code=404, detail="Step not found")
        return step_data

    def delete_step(self, step_id: str):
        """
        Deletes a step by its ID; raises 404 if not found.
        """
        deleted_count = self.repository.delete_step(step_id)
        if deleted_count == 0:
            raise HTTPException(status_code=404, detail="Step not found")
        return deleted_count

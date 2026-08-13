from fastapi import APIRouter, Depends

from domain.models.community_step_settings import CommunityStepSettings
from application.services.step_service import StepService
from interfaces.api.schemas import CreateResponse, DeleteResponse
from interfaces.api.security import require_token

def get_step_router(step_service: StepService) -> APIRouter:
    """
    Returns a router for handling step-related routes.
    """
    router = APIRouter()

    @router.post(
        "/create",
        response_model=CreateResponse,
        dependencies=[Depends(require_token)],
    )
    def create_step(step_data: CommunityStepSettings):
        """
        Creates a new step in the database.
        """
        return step_service.create_step(step_data)

    @router.get("/{step_id}", response_model=CommunityStepSettings)
    def get_step(step_id: str):
        """
        Retrieves step details by ID.
        """
        return step_service.read_step(step_id)

    @router.delete(
        "/{step_id}",
        response_model=DeleteResponse,
        dependencies=[Depends(require_token)],
    )
    def delete_step(step_id: str):
        """
        Deletes a step by ID.
        """
        deleted_count = step_service.delete_step(step_id)
        return {"deleted_count": deleted_count}

    return router

from fastapi import APIRouter, Depends

from domain.models.community_action import CommunityAction
from application.services.action_service import ActionService
from interfaces.api.schemas import CreateResponse
from interfaces.api.security import require_token

def get_action_router(action_service: ActionService) -> APIRouter:
    """
    Returns a router for handling action-related routes.
    """
    router = APIRouter()

    @router.post(
        "/create",
        response_model=CreateResponse,
        dependencies=[Depends(require_token)],
    )
    def create_action(action_data: CommunityAction):
        """
        Creates a new action in the database.
        """
        return action_service.create_action(action_data)

    @router.get("/{action_id}", response_model=CommunityAction)
    def get_action(action_id: str):
        """
        Retrieves action details by ID.
        """
        return action_service.read_action(action_id)

    return router

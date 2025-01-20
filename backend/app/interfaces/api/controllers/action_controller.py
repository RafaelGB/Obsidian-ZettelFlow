from fastapi import APIRouter
from typing import Dict

from app.domain.models.community_action import CommunityAction
from app.application.services.action_service import ActionService

def get_action_router(action_service: ActionService) -> APIRouter:
    """
    Returns a router for handling action-related routes.
    """
    router = APIRouter()

    @router.post("/create", response_model=Dict)
    def create_action(action_data: CommunityAction):
        """
        Creates a new action in the database.
        """
        return action_service.create_action(action_data)

    @router.get("/{action_id}", response_model=Dict)
    def get_action(action_id: str):
        """
        Retrieves action details by ID.
        """
        return action_service.read_action(action_id)

    return router

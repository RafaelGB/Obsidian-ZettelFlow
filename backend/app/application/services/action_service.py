from fastapi import HTTPException

from domain.models.community_action import CommunityAction
from infrastructure.repositories.action_repository import ActionRepository

class ActionService:
    """
    Handles business logic related to CommunityAction.
    """
    def __init__(self, repository: ActionRepository):
        self.repository = repository

    def create_action(self, data: CommunityAction):
        """
        Creates a new action in the database, ensuring 'title' is unique.
        """
        if self.repository.exists_by_title(data.title):
            raise HTTPException(status_code=400, detail="Action title already exists")

        created = self.repository.create_action(data)
        return created

    def read_action(self, action_id: str):
        """
        Reads a specific action by its ID.
        """
        action_data = self.repository.get_action_by_id(action_id)
        if not action_data:
            raise HTTPException(status_code=404, detail="Action not found")
        return action_data

from typing import Optional
from fastapi import HTTPException
from app.infrastructure.db.mongodb import MongoDBClient
from app.domain.models.community_action import CommunityAction

class ActionRepository:
    """
    Repository responsible for CRUD operations on Action documents.
    """
    def __init__(self, db_client: MongoDBClient):
        self.collection = db_client.db["community_templates"]
        self.db_client = db_client

    def create_action(self, data: CommunityAction):
        """
        Inserts a new action into the collection.
        """
        action_dict = data.model_dump()
        action_dict["template_type"] = "action"
        action_dict["downloads"] = 0

        inserted = self.collection.insert_one(action_dict)
        action_dict["_id"] = inserted.inserted_id
        return self.db_client.serialize_document(action_dict)

    def get_action_by_id(self, action_id: str) -> Optional[dict]:
        """
        Retrieves an action by ID.
        """
        doc = self.collection.find_one({"_id": self._object_id(action_id), "template_type": "action"})
        return self.db_client.serialize_document(doc) if doc else None

    def exists_by_title(self, title: str) -> bool:
        """
        Checks if an action with the given title already exists.
        """
        return self.collection.find_one({"title": title, "template_type": "action"}) is not None

    def _object_id(self, id_str: str):
        """
        Converts a string to an ObjectId or raises an error if invalid.
        """
        from bson import ObjectId
        try:
            return ObjectId(id_str)
        except:
            raise HTTPException(status_code=400, detail="Invalid ObjectId format")

from typing import Optional
from fastapi import HTTPException
from app.infrastructure.db.mongodb import MongoDBClient
from app.domain.models.community_step_settings import CommunityStepSettings

class StepRepository:
    """
    Repository responsible for CRUD operations on Step documents.
    """
    def __init__(self, db_client: MongoDBClient):
        self.collection = db_client.db["community_templates"]
        self.db_client = db_client

    def create_step(self, data: CommunityStepSettings):
        """
        Inserts a new step into the collection.
        """
        step_dict = data.model_dump()
        step_dict["template_type"] = "step"
        step_dict["downloads"] = 0

        inserted = self.collection.insert_one(step_dict)
        step_dict["_id"] = inserted.inserted_id
        return self.db_client.serialize_document(step_dict)

    def get_step_by_id(self, step_id: str) -> Optional[dict]:
        """
        Retrieves a step by ID.
        """
        doc = self.collection.find_one({"_id": self._object_id(step_id), "template_type": "step"})
        return self.db_client.serialize_document(doc) if doc else None

    def delete_step(self, step_id: str) -> int:
        """
        Deletes a step by ID.
        """
        result = self.collection.delete_one({"_id": self._object_id(step_id), "template_type": "step"})
        return result.deleted_count

    def exists_by_title(self, title: str) -> bool:
        """
        Checks if a step with the given title already exists.
        """
        return self.collection.find_one({"title": title, "template_type": "step"}) is not None

    def _object_id(self, id_str: str):
        """
        Converts a string to an ObjectId or raises an error if invalid.
        """
        from bson import ObjectId
        try:
            return ObjectId(id_str)
        except:
            raise HTTPException(status_code=400, detail="Invalid ObjectId format")

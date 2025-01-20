from typing import Optional, Union
from fastapi import HTTPException
from bson import ObjectId

from app.infrastructure.db.mongodb import MongoDBClient

class TemplateRepository:
    """
    Repository responsible for generic template operations.
    """
    def __init__(self, db_client: MongoDBClient):
        self.collection = db_client.db["community_templates"]
        self.db_client = db_client

    def read_templates(self, query: Optional[str], skip: int, limit: int) -> dict:
        """
        Fetch documents based on an optional text query, with skip and limit 
        for pagination. 
        """
        mongo_query = {}
        if query:
            # Example simple text search
            mongo_query["title"] = {"$regex": query, "$options": "i"}

        cursor = self.collection.find(mongo_query).skip(skip).limit(limit + 1)
        documents = list(cursor)

        has_next = len(documents) > limit
        if has_next:
            documents = documents[:limit]

        items = [self.db_client.serialize_document(doc) for doc in documents]
        return {
            "items": items,
            "page_info": {
                "skip": skip,
                "limit": limit,
                "has_next": has_next
            }
        }

    def get_step_by_id(self, step_id: str) -> Union[dict, None]:
        """
        Finds a step by ID in the collection.
        """
        doc = self.collection.find_one({"_id": self._object_id(step_id), "template_type": "step"})
        return self.db_client.serialize_document(doc) if doc else None

    def get_action_by_id(self, action_id: str) -> Union[dict, None]:
        """
        Finds an action by ID in the collection.
        """
        doc = self.collection.find_one({"_id": self._object_id(action_id), "template_type": "action"})
        return self.db_client.serialize_document(doc) if doc else None

    def update_template(self, template_id: str, update_data: dict) -> int:
        """
        Updates a template document by its ID.
        """
        result = self.collection.update_one(
            {"_id": self._object_id(template_id)},
            {"$set": update_data}
        )
        return result.modified_count

    def delete_template(self, template_id: str) -> int:
        """
        Deletes a template document by its ID.
        """
        result = self.collection.delete_one({"_id": self._object_id(template_id)})
        return result.deleted_count

    def _object_id(self, id_str: str) -> ObjectId:
        """
        Converts a string to an ObjectId or raises an error if invalid.
        """
        try:
            return ObjectId(id_str)
        except:
            raise HTTPException(status_code=400, detail="Invalid ObjectId format")

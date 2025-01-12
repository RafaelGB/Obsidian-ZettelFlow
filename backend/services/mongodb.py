from pymongo import MongoClient
from fastapi import HTTPException
import uuid

class MongoCRUDService:
    def __init__(self):
        self.client = MongoClient("mongodb://admin:admin_password@localhost:27017/")
        self.db = self.client["test_db"]
        self.collection = self.db["community_templates"]

    def create_step(self, data):
        '''Create a new step in the database'''
        data["type"] = "step"
        data["downloads"] = 0
        # data.title should be unique, so check if it already exists
        if self.collection.find_one({"title": data["title"], "type": "step"}):
            raise HTTPException(status_code=400, detail="Step title already exists")
        self.collection.insert_one(data)
        print(f"Step created: {data}")
        return data

    def create_action(self, data):
        '''Create a new action in the database'''
        data["id"] = str(uuid.uuid4())  # Use UUID as the unique ID
        data["type"] = "action"
        data["downloads"] = 0
        # data.title should be unique, so check if it already exists
        if self.collection.find_one({"title": data["title"], "type": "action"}):
            raise HTTPException(status_code=400, detail="Action title already exists")
        self.collection.insert_one(data)
        data = self._serialize_document(data)
        print(f"Action created: {data}")
        return data

    def read_templates(self, query={}, skip=0, limit=10):
        '''Fetch documents from the database based on query, skip, and limit parameters'''
        # Increment limit by 1 to determine if there are more documents
        cursor = self.collection.find(query).skip(skip).limit(limit + 1)
        documents = list(cursor)
        
        # Check if there are more documents
        has_next = len(documents) > limit
        
        # Remove the extra document if there are more documents
        if has_next:
            documents = documents[:limit]
        
        # Serialize the documents
        items = [self._serialize_document(doc) for doc in documents]
        
        return {
            "items": items,
            "page_info": {
                "skip": skip,
                "limit": limit,
                "has_next": has_next
            }
        }


    def update_template(self, template_id, update_data):
        '''Update a document in the database based on the template_id and update_data'''
        result = self.collection.update_one({"_id": template_id}, {"$set": update_data})
        if result.matched_count == 0:
            raise ValueError(f"No template found with ID: {template_id}")
        print(f"Documents updated: {result.modified_count}")
        return result.modified_count

    def delete_template(self, template_id):
        '''Delete a document from the database based on the template_id'''
        result = self.collection.delete_one({"_id": template_id})
        if result.deleted_count == 0:
            raise ValueError(f"No template found with ID: {template_id}")
        print(f"Documents deleted: {result.deleted_count}")
        return result.deleted_count

    def _serialize_document(self, document):
        '''Remove _id field and serialize the document'''
        document["_id"] = str(document["_id"])  # Convert ObjectId to string
        return document

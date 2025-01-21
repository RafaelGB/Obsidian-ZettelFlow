from pymongo import MongoClient
from bson import ObjectId

class MongoDBClient:
    """
    Provides a MongoDB client and database connection.
    """
    def __init__(self, uri: str = "mongodb://admin:admin_password@localhost:27017/", db_name: str = "local_db"):
        self.client = MongoClient(uri)
        self.db = self.client[db_name]

    @staticmethod
    def serialize_document(doc: dict) -> dict:
        """
        Converts _id from ObjectId to string and returns the document.
        """
        if "_id" in doc and isinstance(doc["_id"], ObjectId):
            doc["id"] = str(doc["_id"])
            del doc["_id"]
        return doc
    
    @staticmethod
    def filterFields(doc: dict, fields: list) -> dict:
        """
        Filters the document to only include the specified fields.
        """
        doc = MongoDBClient.serialize_document(doc)
        return {field: doc[field] for field in fields if field in doc}

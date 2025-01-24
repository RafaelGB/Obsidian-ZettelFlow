from pymongo import MongoClient
from bson import ObjectId
import os

class MongoDBClient:
    # Retrieve MongoDB credentials from environment variables
    __MONGODB_USERNAME = os.getenv("MONGODB_USERNAME")
    __MONGODB_PASSWORD = os.getenv("MONGODB_PASSWORD")
    __MONGODB_HOST = os.getenv("MONGODB_HOST", "localhost")
    __MONGODB_PORT = os.getenv("MONGODB_PORT", "27017")
    __MONGODB_DB = os.getenv("MONGODB_DB", "local_db")
    """
    Provides a MongoDB client and database connection.
    """
    def __init__(self):
        uri = f"mongodb://{self.__MONGODB_USERNAME}:{self.__MONGODB_PASSWORD}@{self.__MONGODB_HOST}:{self.__MONGODB_PORT}/"
        print(f"Connecting to MongoDB at {uri}")
        self.client = MongoClient(uri)
        self.db = self.client[self.__MONGODB_DB]

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

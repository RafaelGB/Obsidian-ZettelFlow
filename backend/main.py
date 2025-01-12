from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from typing import List, Union

from services.mongodb import MongoCRUDService

app = FastAPI()
mongoCRUDService = MongoCRUDService()


# Define models for StepSettings and Action
class CommunityAction(BaseModel):
    title: str
    description: str
    type: str
    hasUI: Union[bool, None] = None
    model_config = ConfigDict(
        extra='allow',
    )

class Action(BaseModel):
    description: str
    type: str
    hasUI: Union[bool, None] = None

class CommunityStepSettings(BaseModel):
    title: str
    description: str
    root: bool
    actions: List[Action]
    label: str
    targetFolder: Union[str, None] = None
    childrenHeader: Union[str, None] = None
    optional: Union[bool, None] = None
    model_config = ConfigDict(
        extra='allow',
    )

@app.get("/filter")
def filter(query: str = Query(None),
           skip: int = Query(0, ge=0), limit: int = Query(10, ge=1)):
    """Return a list of items from the database, with optional skip and limit parameters."""
    print(f"Query: {query}; Skip: {skip}; Limit: {limit}")
    return mongoCRUDService.read_templates(query=query, skip=skip, limit=limit)

@app.get("/item/{item_id}")
def get_item(item_id: str):
    """Return specific item data based on ID."""

@app.post("/create/step")
def create_step(item: CommunityStepSettings):
    """Given a StepSettings object, create a new item in the database. Return the created item."""
    return mongoCRUDService.create_step(item.model_dump())

@app.post("/create/action")
def create_action(item: CommunityAction):
    """Given an Action object, create a new item in the database. Return the created item."""
    return mongoCRUDService.create_action(item.model_dump())

@app.delete("/delete/step/{item_id}")
def delete_item(item_id: str):
    """Delete the item with the given ID from the database."""
    deletedItems = mongoCRUDService.delete_template(item_id)
    # If no items were deleted, raise an HTTPException with status code 404
    if deletedItems.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    
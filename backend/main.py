from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import List, Union
import random

app = FastAPI()

# Mock data
data = [
    {
        "id": str(i),
        "title": f"Plantilla {['Action', 'Step'][i % 2]} {i}",
        "description": f"Desc {['Action', 'Step'][i % 2]} {i}",
        "author": random.choice(["Alice", "Bob", "Charlie", "Diana", "Edward", "Fabian"]),
        "type": ["action", "step"][i % 2],
        "downloads": random.randint(20, 500),
    }
    for i in range(1, 101)
]

# Define models for StepSettings and Action
class Action(BaseModel):
    type: str
    id: str
    description: Union[str, None] = None
    hasUI: Union[bool, None] = None
    additional_props: dict = {}

class StepSettings(BaseModel):
    root: bool
    actions: List[Action]
    label: str
    targetFolder: Union[str, None] = None
    childrenHeader: Union[str, None] = None
    optional: Union[bool, None] = None

@app.get("/list")
def get_list(skip: int = Query(0, ge=0), limit: int = Query(10, ge=1)):
    """Return a paginated list of data."""
    start = skip
    end = skip + limit
    return {
        "total": len(data),
        "items": data[start:end],
        "page_info": {
            "skip": skip,
            "limit": limit,
            "has_next": end < len(data),
            "has_previous": start > 0,
        },
    }

@app.get("/item/{item_id}")
def get_item(item_id: str):
    """Return specific item data based on ID."""
    item = next((item for item in data if item["id"] == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if item["type"] == "step":
        # Mocked StepSettings for a step item
        response = {
            "root": bool(random.getrandbits(1)),
            "actions": [
                {
                    "type": random.choice(["navigate", "click"]),
                    "id": f"action-{random.randint(1, 100)}",
                    "description": "Mock action description",
                    "hasUI": bool(random.getrandbits(1)),
                }
                for _ in range(random.randint(1, 5))
            ],
            "label": f"Label for step {item_id}",
            "targetFolder": f"/folder/{item_id}" if bool(random.getrandbits(1)) else None,
            "childrenHeader": f"Header-{item_id}" if bool(random.getrandbits(1)) else None,
            "optional": bool(random.getrandbits(1)),
        }
    elif item["type"] == "action":
        # Mocked Action data for an action item
        response = {
            "type": "action-type",
            "id": item_id,
            "description": f"Detailed description for action {item_id}",
            "hasUI": bool(random.getrandbits(1)),
            "additional_props": {f"key-{i}": f"value-{i}" for i in range(1, random.randint(2, 5))},
        }
    else:
        raise HTTPException(status_code=400, detail="Invalid item type")

    return response

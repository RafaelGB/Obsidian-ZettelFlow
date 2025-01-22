from pydantic import BaseModel
from typing import Union

class Action(BaseModel):
    """
    Inner domain model representing an action within a step.
    """
    type: str
    description: str
    hasUI: Union[bool, None] = None
    
    class Config:
        extra = 'allow'

class CommunityAction(Action):
    """
    Represents the domain model for community actions.
    """
    title: str
    author: str
    downloads: int = 0

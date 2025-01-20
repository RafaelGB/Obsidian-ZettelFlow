from pydantic import BaseModel
from typing import Union

class CommunityAction(BaseModel):
    """
    Represents the domain model for community actions.
    """
    title: str
    type: str
    description: str
    hasUI: Union[bool, None] = None

    class Config:
        extra = 'allow'

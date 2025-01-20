from pydantic import BaseModel
from typing import List, Union

class Action(BaseModel):
    """
    Inner domain model representing an action within a step.
    """
    type: str
    description: str
    hasUI: Union[bool, None] = None

class CommunityStepSettings(BaseModel):
    """
    Represents the domain model for community step settings.
    """
    title: str
    description: str
    root: bool
    actions: List[Action]
    label: str
    targetFolder: Union[str, None] = None
    childrenHeader: Union[str, None] = None
    optional: Union[bool, None] = None

    class Config:
        extra = 'allow'

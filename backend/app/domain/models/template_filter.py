from pydantic import BaseModel
from typing import List, Optional

class PageInfo(BaseModel):
    """
    Pagination info for paginated responses.
    """
    skip: int
    limit: int
    has_next: bool

class TemplateItem(BaseModel):
    """
    Represents an item in the template list.
    """
    id: str
    title: str
    description: str
    downloads: int
    author: str
    type: str
    # Onboarding difficulty for "system" templates (easy | medium | hard), shown as a gallery badge (#285).
    difficulty: Optional[str] = None

    class Config:
        underscore_attrs_are_private = False

class TemplateFilterResponse(BaseModel):
    """
    Represents a response containing paginated templates.
    """
    items: List[TemplateItem]
    page_info: PageInfo

    class Config:
        extra = 'allow'

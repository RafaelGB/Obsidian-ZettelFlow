from fastapi import FastAPI

# Infrastructure
from app.infrastructure.db.mongodb import MongoDBClient
from app.infrastructure.repositories.step_repository import StepRepository
from app.infrastructure.repositories.action_repository import ActionRepository
from app.infrastructure.repositories.template_repository import TemplateRepository

# Application Services
from app.application.services.step_service import StepService
from app.application.services.action_service import ActionService
from app.application.services.template_service import TemplateService

# Controllers
from app.interfaces.api.controllers.step_controller import get_step_router
from app.interfaces.api.controllers.action_controller import get_action_router
from app.interfaces.api.controllers.template_controller import get_template_router

def create_application() -> FastAPI:
    """
    Create and configure the FastAPI application.
    """
    app = FastAPI(title="ZettelFlow Community API")

    # Initialize DB client
    db_client = MongoDBClient()

    # Repositories
    step_repo = StepRepository(db_client)
    action_repo = ActionRepository(db_client)
    template_repo = TemplateRepository(db_client)

    # Services
    step_service = StepService(step_repo)
    action_service = ActionService(action_repo)
    template_service = TemplateService(template_repo)

    # Routers
    app.include_router(
        get_step_router(step_service),
        prefix="/steps",
        tags=["Steps"]
    )
    app.include_router(
        get_action_router(action_service),
        prefix="/actions",
        tags=["Actions"]
    )
    app.include_router(
        get_template_router(template_service),
        prefix="/templates",
        tags=["Templates"]
    )

    return app

app = create_application()

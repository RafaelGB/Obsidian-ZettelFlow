from fastapi import FastAPI

# Infrastructure
from infrastructure.db.mongodb import MongoDBClient
from infrastructure.repositories.step_repository import StepRepository
from infrastructure.repositories.action_repository import ActionRepository
from infrastructure.repositories.template_repository import TemplateRepository

# Application Services
from application.services.step_service import StepService
from application.services.action_service import ActionService
from application.services.template_service import TemplateService

# Controllers
from interfaces.api.controllers.step_controller import get_step_router
from interfaces.api.controllers.action_controller import get_action_router
from interfaces.api.controllers.template_controller import get_template_router

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
    print("Application created successfully.")
    return app

app = create_application()

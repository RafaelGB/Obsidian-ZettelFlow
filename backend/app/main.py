import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
from interfaces.api.schemas import HealthResponse

def create_application() -> FastAPI:
    """
    Create and configure the FastAPI application.
    """
    app = FastAPI(title="ZettelFlow Community API")

    # CORS: allowed origins come from ZETTELFLOW_ALLOWED_ORIGINS (comma-separated),
    # defaulting to "*". Credentials are disabled because auth uses the custom
    # X-ZettelFlow-Token header (not cookies), which also keeps a wildcard origin
    # spec-compliant.
    allowed_origins = os.getenv("ZETTELFLOW_ALLOWED_ORIGINS", "*")
    origins = [o.strip() for o in allowed_origins.split(",") if o.strip()] or ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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

    @app.get("/health", response_model=HealthResponse, tags=["Health"])
    def health() -> HealthResponse:
        """
        Liveness probe. Public (no auth) and does not touch the database.
        """
        return HealthResponse(status="ok")

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

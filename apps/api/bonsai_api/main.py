from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .db.session import get_engine
from .routers import (
    admin, admin_dashboard, admin_jobs, admin_payments, admin_system, admin_users, auth, catalog, garden, jobs, labels, me,
    payments, push, share, trees, uploads,
)
from .settings import get_settings

API_PREFIX = "/api/v1"


def _init_sentry(dsn: str | None, env: str) -> None:
    if not dsn or not dsn.startswith("http"):
        return  # chưa cấu hình (hoặc cấu hình sai) thì bỏ qua, không làm sập api
    import sentry_sdk

    # Không gửi PII (email, ảnh, token) lên Sentry.
    sentry_sdk.init(dsn=dsn, environment=env, traces_sample_rate=0.05, send_default_pii=False)


def create_app() -> FastAPI:
    s = get_settings()
    _init_sentry(s.sentry_dsn, s.app_env)
    app = FastAPI(title="Bonsai AI API", version="0.1.0", docs_url="/api/docs" if s.is_dev else None,
                  openapi_url="/api/openapi.json" if s.is_dev else None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["Authorization", "Content-Type"],
    )
    for r in (auth.router, me.router, uploads.router, trees.router, jobs.router, share.router, payments.router, garden.router, push.router, admin.router,
              admin_dashboard.router, admin_jobs.router, admin_users.router, admin_payments.router, admin_system.router,
              labels.router, catalog.router):
        app.include_router(r, prefix=API_PREFIX)

    app.include_router(share.page_router)

    @app.get("/healthz", include_in_schema=False)
    def healthz():
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"ok": True}

    return app


app = create_app()

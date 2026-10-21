"""Fixture pytest dùng chung cho test api và worker (cần Postgres; xem TEST_DATABASE_URL)."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

TEST_DB = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://bonsai:bonsai@localhost:55432/bonsai_test")
os.environ.update(
    DATABASE_URL=TEST_DB,
    APP_ENV="dev",
    JWT_SECRET="test-secret-at-least-32-bytes-long-xx",
    R2_ENDPOINT="https://example.r2.cloudflarestorage.com",
    R2_ACCESS_KEY_ID="test",
    R2_SECRET_ACCESS_KEY="test",
    GOOGLE_CLIENT_ID="test-client.apps.googleusercontent.com",
    ZALO_APP_ID="123",
    ZALO_APP_SECRET="secret",
)

API_DIR = Path(__file__).resolve().parents[1]  # apps/api (chứa alembic.ini)


@pytest.fixture(scope="session", autouse=True)
def _database():
    admin_url, _, name = TEST_DB.rpartition("/")
    admin = create_engine(f"{admin_url}/postgres", isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        c.execute(text(f'CREATE DATABASE "{name}"'))
    admin.dispose()
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=API_DIR, check=True,
                   capture_output=True)
    from bonsai_api.db.session import get_sessionmaker
    from bonsai_api.scripts.seed import default_prompts_dir, seed_dictionaries, seed_prompts

    with get_sessionmaker()() as db:
        seed_dictionaries(db)
        seed_prompts(db, default_prompts_dir())
        db.commit()
    yield


@pytest.fixture(autouse=True)
def _clean():
    yield
    from bonsai_api.db.session import get_engine

    with get_engine().begin() as c:
        c.execute(text("TRUNCATE users, trees, tree_photos, design_jobs, credit_ledger, payments CASCADE"))


@pytest.fixture
def db():
    from bonsai_api.db.session import get_sessionmaker

    with get_sessionmaker()() as s:
        yield s


@pytest.fixture(autouse=True)
def enqueued(monkeypatch):
    calls = []
    monkeypatch.setattr("bonsai_api.queue.enqueue", lambda name, *args, **kw: calls.append((name, args)) or True)
    return calls


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from bonsai_api.main import create_app

    return TestClient(create_app())


@pytest.fixture
def login(client):
    def _login(email="nhavuon@example.com"):
        r = client.post("/api/v1/auth/dev", json={"email": email, "name": "Nhà vườn"})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()

    return _login

from bonsai_api.settings import Settings


def test_cors_origins_from_comma_separated_env(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:8080, https://bonsai.vn")
    assert Settings().cors_origins == ["http://localhost:8080", "https://bonsai.vn"]


def test_bad_sentry_dsn_does_not_crash_app():
    from bonsai_api.main import _init_sentry

    _init_sentry("# api + worker", "dev")  # không ném lỗi

from bonsai_api.settings import Settings


def test_cors_origins_from_comma_separated_env(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:8080, https://bonsai.vn")
    assert Settings().cors_origins == ["http://localhost:8080", "https://bonsai.vn"]

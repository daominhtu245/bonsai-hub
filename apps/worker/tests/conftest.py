pytest_plugins = ["bonsai_api.testing"]

import pytest


def pytest_configure(config):
    config.addinivalue_line("markers", "fidelity: chạy kiểm tra trung thực thật (fidelity_checks) thay vì bỏ qua")


@pytest.fixture(autouse=True)
def _skip_fidelity_on_fake_images(request, monkeypatch):
    """Ảnh từ model giả không có tầng lá thật → kiểm tra trung thực vô nghĩa; test điều phối bỏ qua nó.
    Test nào cần kiểm tra thật thì gắn @pytest.mark.fidelity."""
    if request.node.get_closest_marker("fidelity") is None:
        monkeypatch.setattr("bonsai_worker.tasks.phase_b.fidelity_checks", lambda *a, **k: {"fails": []})

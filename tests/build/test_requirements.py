import os
import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))


class TestRequirementsAndBuildSanity:
    """
    Sanity checks for build configuration, dependencies, and environment files.
    """

    def test_core_modules_importable(self):
        """Verify core modules and dependencies import cleanly without syntax or version errors."""
        import importlib.metadata
        import flask
        import requests
        import werkzeug
        import jinja2
        import waitress
        import app
        import db

        assert importlib.metadata.version("flask") is not None
        assert importlib.metadata.version("requests") is not None
        assert importlib.metadata.version("waitress") is not None

    def test_dockerfile_exists_and_configured(self):
        dockerfile_path = os.path.join(PROJECT_ROOT, 'Dockerfile')
        if not os.path.exists(dockerfile_path):
            pytest.skip("Dockerfile excluded by .dockerignore in container build environment")
        with open(dockerfile_path, 'r', encoding='utf-8') as f:
            content = f.read()

        assert "EXPOSE 5000" in content
        assert "ENTRYPOINT" in content
        assert "requirements.txt" in content
        assert "USER appuser" in content, "Dockerfile should enforce non-root user execution"
        assert "HEALTHCHECK" in content, "Dockerfile should configure container healthcheck"

    def test_requirements_txt_configured(self):
        req_path = os.path.join(PROJECT_ROOT, 'requirements.txt')
        assert os.path.exists(req_path), "requirements.txt must exist"
        with open(req_path, 'r', encoding='utf-8') as f:
            content = f.read()

        assert "Flask" in content
        assert "waitress" in content
        assert "Werkzeug" in content

    def test_docker_compose_exists_and_valid(self):
        compose_path = os.path.join(PROJECT_ROOT, 'docker-compose.yaml')
        if not os.path.exists(compose_path):
            pytest.skip("docker-compose.yaml excluded by .dockerignore in container build environment")
        with open(compose_path, 'r', encoding='utf-8') as f:
            content = f.read()

        assert "5000:5000" in content
        assert "/app/data" in content

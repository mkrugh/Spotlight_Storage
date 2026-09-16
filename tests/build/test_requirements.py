import os
import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))


class TestRequirementsAndBuildSanity:
    """
    Sanity checks for build configuration, dependencies, and environment files.
    """

    def test_core_modules_importable(self):
        """Verify core modules and dependencies import cleanly without syntax or version errors."""
        import flask
        import requests
        import werkzeug
        import jinja2
        import app
        import db

        assert flask.__version__ is not None
        assert requests.__version__ is not None

    def test_dockerfile_exists_and_configured(self):
        dockerfile_path = os.path.join(PROJECT_ROOT, 'Dockerfile')
        assert os.path.exists(dockerfile_path), "Dockerfile must exist in project root"
        with open(dockerfile_path, 'r', encoding='utf-8') as f:
            content = f.read()

        assert "EXPOSE 5000" in content
        assert "ENTRYPOINT" in content
        assert "requirements.txt" in content

    def test_docker_compose_exists_and_valid(self):
        compose_path = os.path.join(PROJECT_ROOT, 'docker-compose.yaml')
        assert os.path.exists(compose_path), "docker-compose.yaml must exist"
        with open(compose_path, 'r', encoding='utf-8') as f:
            content = f.read()

        assert "5000:5000" in content
        assert "/app/data" in content

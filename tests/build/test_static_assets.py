import os
import re
import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
TEMPLATES_DIR = os.path.join(PROJECT_ROOT, 'templates')
STATIC_DIR = os.path.join(PROJECT_ROOT, 'static')


class TestStaticAssets:
    """
    Build and asset smoke tests ensuring that all static files referenced
    in HTML templates exist on disk, are non-empty, and readable.
    """

    def test_index_html_exists(self):
        index_path = os.path.join(TEMPLATES_DIR, 'index.html')
        assert os.path.isfile(index_path), "templates/index.html must exist"

    def test_all_referenced_static_assets_exist(self):
        """Extract all static asset paths from index.html and verify their existence."""
        index_path = os.path.join(TEMPLATES_DIR, 'index.html')
        with open(index_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Regex matching ../static/filename.ext or /static/filename.ext
        asset_pattern = re.compile(r'(?:src|href)=["\'](?:\.\./|/)?static/([^"\'?#]+)["\']')
        matches = asset_pattern.findall(content)

        assert len(matches) > 0, "Should find static assets referenced in index.html"

        for asset_rel_path in matches:
            asset_full_path = os.path.join(STATIC_DIR, asset_rel_path)
            assert os.path.exists(asset_full_path), (
                f"Referenced static asset does not exist: {asset_rel_path} (looked in {asset_full_path})"
            )
            assert os.path.getsize(asset_full_path) > 0, (
                f"Referenced static asset is empty (0 bytes): {asset_rel_path}"
            )

    def test_all_static_javascript_files_non_empty(self):
        """Verify all core JavaScript files in static/ exist and have valid content."""
        expected_scripts = [
            'images.js', 'script.js', 'esp.js', 'tags.js',
            'settings.js', 'gen_grid.js', 'color-modes.js',
            'builds.js', 'map.js', 'translation.js'
        ]
        for script_name in expected_scripts:
            script_path = os.path.join(STATIC_DIR, script_name)
            assert os.path.exists(script_path), f"Expected script missing: {script_name}"
            assert os.path.getsize(script_path) > 10, f"Script unexpectedly small/empty: {script_name}"

    def test_favicon_asset_exists(self):
        """Verify favicon image asset exists in static directory."""
        favicon_path = os.path.join(STATIC_DIR, 'favicon.png')
        assert os.path.exists(favicon_path)
        assert os.path.getsize(favicon_path) > 0

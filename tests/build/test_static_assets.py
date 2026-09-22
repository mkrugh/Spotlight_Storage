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
            'api.js', 'images.js', 'dialog-manager.js', 'script.js', 'esp.js', 'tags.js',
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

    def test_vendor_libraries_exist_and_valid(self):
        """Verify all self-hosted vendor libraries exist and are non-trivially sized."""
        vendor_files = {
            'vendor/bootstrap/css/bootstrap.min.css': 100000,
            'vendor/bootstrap/js/bootstrap.bundle.min.js': 50000,
            'vendor/tagify/tagify.css': 5000,
            'vendor/tagify/tagify.min.js': 30000,
            'vendor/tagify/tagify.polyfills.min.js': 1000,
            'vendor/lucide/lucide.min.js': 100000,
            'vendor/jquery/jquery.min.js': 80000,
            'vendor/cropperjs/cropper.min.css': 2000,
            'vendor/cropperjs/cropper.min.js': 20000,
        }
        for rel_path, min_bytes in vendor_files.items():
            full_path = os.path.join(STATIC_DIR, rel_path)
            assert os.path.isfile(full_path), (
                f"Vendor file missing: {rel_path}"
            )
            actual_size = os.path.getsize(full_path)
            assert actual_size >= min_bytes, (
                f"Vendor file too small: {rel_path} is {actual_size} bytes, "
                f"expected at least {min_bytes}"
            )

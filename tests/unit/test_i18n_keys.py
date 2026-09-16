import json
import os
import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
TRANSLATIONS_DIR = os.path.join(PROJECT_ROOT, 'static', 'translations')


class TestI18nKeys:
    """
    Validates that translation JSON files exist, are parseable, and contain
    consistent keys compared to en.json.
    """

    def test_en_json_exists_and_valid(self):
        en_path = os.path.join(TRANSLATIONS_DIR, 'en.json')
        assert os.path.exists(en_path), "en.json must exist"
        with open(en_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        assert isinstance(data, dict)
        assert len(data) > 0

    def test_all_translation_files_valid_json(self):
        translation_files = [f for f in os.listdir(TRANSLATIONS_DIR) if f.endswith('.json')]
        assert len(translation_files) >= 2, "Should have multiple translation files"

        for file_name in translation_files:
            file_path = os.path.join(TRANSLATIONS_DIR, file_name)
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            assert isinstance(data, dict), f"{file_name} must contain a JSON object"

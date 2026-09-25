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

    def test_all_translation_keys_match_en(self):
        """Verify that every language file contains all keys defined in en.json."""
        en_path = os.path.join(TRANSLATIONS_DIR, 'en.json')
        with open(en_path, 'r', encoding='utf-8') as f:
            en_keys = set(json.load(f).keys())

        translation_files = [f for f in os.listdir(TRANSLATIONS_DIR) if f.endswith('.json') and f != 'en.json']
        for file_name in translation_files:
            file_path = os.path.join(TRANSLATIONS_DIR, file_name)
            with open(file_path, 'r', encoding='utf-8') as f:
                lang_keys = set(json.load(f).keys())

            missing = en_keys - lang_keys
            extra = lang_keys - en_keys
            assert not missing, f"{file_name} is missing keys: {missing}"
            assert not extra, f"{file_name} has extra unexpected keys: {extra}"

    def test_translation_token_consistency(self):
        """Verify that variable interpolation tokens (e.g. {{total}}) match between en.json and all translations."""
        import re
        token_pattern = re.compile(r'\{\{([a-zA-Z0-9_]+)\}\}')
        en_path = os.path.join(TRANSLATIONS_DIR, 'en.json')
        with open(en_path, 'r', encoding='utf-8') as f:
            en_data = json.load(f)

        translation_files = [f for f in os.listdir(TRANSLATIONS_DIR) if f.endswith('.json') and f != 'en.json']
        for file_name in translation_files:
            file_path = os.path.join(TRANSLATIONS_DIR, file_name)
            with open(file_path, 'r', encoding='utf-8') as f:
                lang_data = json.load(f)

            for key, en_val in en_data.items():
                if isinstance(en_val, str):
                    en_tokens = set(token_pattern.findall(en_val))
                    if en_tokens:
                        target_val = lang_data.get(key, '')
                        target_tokens = set(token_pattern.findall(target_val))
                        assert en_tokens == target_tokens, (
                            f"{file_name} key '{key}' token mismatch: expected {en_tokens}, got {target_tokens}"
                        )


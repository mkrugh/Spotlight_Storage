import pytest
import db


class TestDbSettings:
    """
    Unit tests for application settings in db.py.
    """

    def test_read_default_settings(self, isolated_db):
        settings = db.read_settings()
        assert settings is not None
        assert 'brightness' in settings
        assert 'timeout' in settings
        assert 'colors' in settings
        assert isinstance(settings['colors'], list)

    def test_update_and_read_settings(self, isolated_db):
        custom_settings = {
            'brightness': 75,
            'timeout': 10,
            'lightMode': 'dark',
            'colors': ['#ff0000', '#0000ff'],
            'language': 'de'
        }
        db.update_settings(custom_settings)

        saved = db.read_settings()
        assert saved['brightness'] == 75
        assert saved['timeout'] == 10
        assert saved['lightMode'] == 'dark'
        assert saved['colors'] == ['#ff0000', '#0000ff']
        assert saved['language'] == 'de'

import os
import sqlite3
import pytest

import db
from app import get_current_settings, set_global_settings, app as flask_app


class TestDatabaseRefactor:
    """
    Tests validating the Phase 3 database layer refactor:
    - init_db() creates schema and indexes cleanly
    - get_db_connection() returns properly configured connection with WAL and Row factory
    - Connection context management avoids leaks
    - Thread-safe settings retrieval
    """

    def test_init_db_creates_tables_and_indexes(self, tmp_path):
        test_db_file = str(tmp_path / "test_init.db")
        db.init_db(test_db_file)

        with sqlite3.connect(test_db_file) as conn:
            cursor = conn.cursor()

            # Verify tables exist
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = {row[0] for row in cursor.fetchall()}
            expected_tables = {'items', 'esp', 'settings', 'builds', 'build_items'}
            assert expected_tables.issubset(tables)

            # Verify indexes exist (M3)
            cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
            indexes = {row[0] for row in cursor.fetchall()}
            expected_indexes = {
                'idx_esp_ip', 'idx_esp_name', 'idx_items_name',
                'idx_build_items_build_id', 'idx_build_items_item_id'
            }
            assert expected_indexes.issubset(indexes)

    def test_get_db_connection_properties(self, tmp_path, monkeypatch):
        test_db_file = str(tmp_path / "test_props.db")
        db.init_db(test_db_file)
        monkeypatch.setattr(db, 'COMBINED_DATABASE', test_db_file)

        conn = db.get_db_connection()
        try:
            assert conn.row_factory == sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("PRAGMA foreign_keys")
            fk_enabled = cursor.fetchone()[0]
            assert fk_enabled == 1
        finally:
            conn.close()

    def test_create_combined_db_backward_compatibility(self, tmp_path, monkeypatch):
        test_db_file = str(tmp_path / "test_compat.db")
        monkeypatch.setattr(db, 'COMBINED_DATABASE', test_db_file)

        conn = db.create_combined_db()
        try:
            assert conn is not None
            cursor = conn.cursor()
            cursor.execute("SELECT count(*) FROM items")
            assert cursor.fetchone()[0] == 0
        finally:
            conn.close()

    def test_thread_safe_get_current_settings(self, isolated_db):
        """Verify get_current_settings retrieves settings safely and updates global cache."""
        settings = get_current_settings()
        assert 'brightness' in settings
        assert 'timeout' in settings
        assert 'standbyColor' in settings
        assert 'locateColor' in settings

        with flask_app.state_lock:
            assert flask_app.brightness == settings['brightness']
            assert flask_app.timeout == settings['timeout']

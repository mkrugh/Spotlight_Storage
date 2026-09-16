import pytest
import db


class TestDbEsp:
    """
    Unit tests for ESP hardware configuration operations in db.py.
    """

    def test_write_and_read_esp(self, isolated_db):
        esp_data = {
            'name': 'Main Workbench',
            'esp_ip': '192.168.1.150',
            'rows': 5,
            'cols': 6,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        }
        esp_id = db.write_esp_settings(esp_data)
        assert esp_id is not None

        esps = db.read_esp()
        assert len(esps) == 1
        record = esps[0]
        assert record['id'] == esp_id
        assert record['name'] == 'Main Workbench'
        assert record['esp_ip'] == '192.168.1.150'
        assert record['rows'] == 5
        assert record['cols'] == 6

    def test_write_esp_missing_fields(self, isolated_db):
        # Missing required fields returns None
        incomplete_data = {'name': 'Incomplete'}
        result = db.write_esp_settings(incomplete_data)
        assert result is None

    def test_get_esp_by_ip_and_id(self, isolated_db, sample_esp):
        esp_by_ip = db.get_esp_settings_by_ip('192.168.1.200')
        assert esp_by_ip is not None
        assert esp_by_ip['name'] == 'Test ESP Matrix'

        esp_by_id = db.get_esp_settings_by_id(sample_esp['id'])
        assert esp_by_id is not None
        assert esp_by_id['esp_ip'] == '192.168.1.200'

        # Non-existent IP returns None
        assert db.get_esp_settings_by_ip('10.99.99.99') is None

    def test_get_ip_by_name(self, isolated_db, sample_esp):
        ip = db.get_ip_by_name('Test ESP Matrix')
        assert ip == '192.168.1.200'
        assert db.get_ip_by_name('NonExistent') is None

    def test_update_esp_settings(self, isolated_db, sample_esp):
        updated_data = {
            'name': 'Updated ESP Name',
            'esp_ip': '192.168.1.201',
            'rows': 8,
            'cols': 8,
            'startTop': 'bottom',
            'startLeft': 'right',
            'serpentineDirection': 'vertical'
        }
        db.update_esp_settings(sample_esp['id'], updated_data)

        record = db.get_esp_settings_by_id(sample_esp['id'])
        assert record['name'] == 'Updated ESP Name'
        assert record['esp_ip'] == '192.168.1.201'
        assert record['rows'] == 8
        assert record['start_top'] == 'bottom'
        assert record['start_left'] == 'right'

    def test_delete_esp_settings(self, isolated_db, sample_esp):
        db.delete_esp_settings(sample_esp['id'])
        assert db.get_esp_settings_by_id(sample_esp['id']) is None
        assert len(db.read_esp()) == 0

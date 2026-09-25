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

    def test_esp_metrics_zero_division_guard(self, isolated_db):
        esp_id = db.write_esp_settings({
            'name': 'Zero Capacity',
            'esp_ip': '192.168.1.99',
            'rows': 0,
            'cols': 0,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        })
        esp = db.get_esp_settings_by_id(esp_id)
        assert esp['total_bins'] == 0
        assert esp['occupied_bins'] == 0
        assert esp['fill_percentage'] == 0.0

    def test_esp_metrics_multi_section_and_overlapping_bins(self, isolated_db):
        esp_id = db.write_esp_settings({
            'name': 'Tiered Cabinet',
            'esp_ip': '192.168.1.110',
            'rows': 4,
            'cols': 5,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal',
            'sections': [
                {'rows': 2, 'cols': 5},
                {'rows': 2, 'cols': 5}
            ]
        })

        # Add items:
        # Part A at LED 0 and 1 (multi-bin)
        db.write_item({
            'name': 'Resistor Pack',
            'link': '',
            'image': '',
            'position': '[0, 1]',
            'quantity': 10,
            'min_quantity': 2,
            'ip': '192.168.1.110',
            'tags': ''
        })
        # Part B also at LED 1 (overlapping/co-located)
        db.write_item({
            'name': 'Capacitor Pack',
            'link': '',
            'image': '',
            'position': '[1]',
            'quantity': 5,
            'min_quantity': 1,
            'ip': 'Tiered Cabinet',  # matched by name
            'tags': ''
        })
        # Part C at LED 3
        db.write_item({
            'name': 'LED Red',
            'link': '',
            'image': '',
            'position': '[3]',
            'quantity': 0,  # 0 quantity still counts as occupied
            'min_quantity': 5,
            'ip': '192.168.1.110',
            'tags': ''
        })

        esps = db.read_esp()
        cabinet = next(e for e in esps if e['id'] == esp_id)
        # Total bins: 2*5 + 2*5 = 20
        assert cabinet['total_bins'] == 20
        # Unique occupied LEDs: {0, 1, 3} -> 3 bins
        assert cabinet['occupied_bins'] == 3
        assert cabinet['fill_percentage'] == 15.0

    def test_esp_metrics_corrupt_json_position_resilience(self, isolated_db):
        esp_id = db.write_esp_settings({
            'name': 'Corrupt JSON Cabinet',
            'esp_ip': '192.168.1.120',
            'rows': 5,
            'cols': 5,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        })
        # Directly insert an item with malformed JSON position
        with db.contextlib.closing(db.get_db_connection()) as conn:
            conn.execute(
                "INSERT INTO items (name, link, image, position, quantity, min_quantity, ip, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                ['Malformed Item', '', '', '{bad_json: True', 1, 1, '192.168.1.120', '']
            )
            conn.commit()

        esp = db.get_esp_settings_by_id(esp_id)
        assert esp['total_bins'] == 25
        assert esp['occupied_bins'] == 0
        assert esp['fill_percentage'] == 0.0

    def test_esp_metrics_lookup_by_id(self, isolated_db):
        esp_id = db.write_esp_settings({
            'name': 'Numeric ID Controller',
            'esp_ip': '192.168.1.130',
            'rows': 2,
            'cols': 5,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        })
        # Assign item using the controller's integer ID as string
        db.write_item({
            'name': 'Item By ID',
            'link': '',
            'image': '',
            'position': [4],
            'quantity': 1,
            'min_quantity': 1,
            'ip': str(esp_id),
            'tags': ''
        })

        esp = db.get_esp_settings_by_id(esp_id)
        assert esp['total_bins'] == 10
        assert esp['occupied_bins'] == 1
        assert esp['fill_percentage'] == 10.0

    def test_esp_metrics_overcapacity(self, isolated_db):
        # 2x2 = 4 total bins
        esp_id = db.write_esp_settings({
            'name': 'Small Box',
            'esp_ip': '192.168.1.140',
            'rows': 2,
            'cols': 2,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        })
        # Assign 6 distinct bins
        for i in range(6):
            db.write_item({
                'name': f'Part {i}',
                'link': '',
                'image': '',
                'position': [i],
                'quantity': 1,
                'min_quantity': 1,
                'ip': '192.168.1.140',
                'tags': ''
            })

        esp = db.get_esp_settings_by_id(esp_id)
        assert esp['total_bins'] == 4
        assert esp['occupied_bins'] == 6
        assert esp['fill_percentage'] == 150.0

    def test_esp_metrics_include_metrics_false(self, isolated_db):
        esp_id = db.write_esp_settings({
            'name': 'Quick Fetch Box',
            'esp_ip': '192.168.1.150',
            'rows': 3,
            'cols': 3,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        })
        # Single lookup without metrics
        esp = db.get_esp_settings_by_id(esp_id, include_metrics=False)
        assert 'total_bins' not in esp
        assert 'occupied_bins' not in esp
        assert 'fill_percentage' not in esp

        # List lookup without metrics
        esps = db.read_esp(include_metrics=False)
        target = next(e for e in esps if e['id'] == esp_id)
        assert 'total_bins' not in target
        assert 'occupied_bins' not in target
        assert 'fill_percentage' not in target

    def test_write_esp_duplicate_ip_raises_value_error(self, isolated_db):
        db.write_esp_settings({
            'name': 'Primary Cabinet',
            'esp_ip': '192.168.1.160',
            'rows': 4,
            'cols': 4,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        })

        with pytest.raises(ValueError, match="already exists"):
            db.write_esp_settings({
                'name': 'Duplicate IP Cabinet',
                'esp_ip': '  192.168.1.160  ',
                'rows': 4,
                'cols': 4,
                'startTop': 'top',
                'startLeft': 'left',
                'serpentineDirection': 'horizontal'
            })

    def test_update_esp_duplicate_ip_raises_value_error(self, isolated_db):
        id_1 = db.write_esp_settings({
            'name': 'Cabinet 1',
            'esp_ip': '192.168.1.161',
            'rows': 4,
            'cols': 4,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        })
        id_2 = db.write_esp_settings({
            'name': 'Cabinet 2',
            'esp_ip': '192.168.1.162',
            'rows': 4,
            'cols': 4,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        })

        with pytest.raises(ValueError, match="already exists"):
            db.update_esp_settings(id_2, {
                'name': 'Cabinet 2 Renamed',
                'esp_ip': '192.168.1.161',
                'rows': 4,
                'cols': 4,
                'startTop': 'top',
                'startLeft': 'left',
                'serpentineDirection': 'horizontal'
            })

    def test_update_esp_same_ip_succeeds(self, isolated_db):
        id_1 = db.write_esp_settings({
            'name': 'Cabinet Self Update',
            'esp_ip': '192.168.1.163',
            'rows': 4,
            'cols': 4,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        })

        # Updating without changing the IP must succeed
        db.update_esp_settings(id_1, {
            'name': 'Cabinet Self Update Renamed',
            'esp_ip': '192.168.1.163',
            'rows': 6,
            'cols': 6,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        })
        updated = db.get_esp_settings_by_id(id_1)
        assert updated['name'] == 'Cabinet Self Update Renamed'
        assert updated['rows'] == 6



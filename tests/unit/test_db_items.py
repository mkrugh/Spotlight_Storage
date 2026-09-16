import json
import pytest
import db


class TestDbItems:
    """
    Unit tests for item database operations in db.py.
    """

    def test_write_and_read_item(self, isolated_db):
        item_data = {
            'name': '10k Resistor',
            'link': 'https://example.com/resistor',
            'image': 'resistor.png',
            'position': '[1, 2]',
            'quantity': 100,
            'ip': '192.168.1.100',
            'tags': '["resistor", "through-hole"]'
        }
        item_id = db.write_item(item_data)
        assert item_id is not None
        assert item_id > 0

        items = db.read_items()
        assert len(items) == 1
        fetched = items[0]
        assert fetched['id'] == item_id
        assert fetched['name'] == '10k Resistor'
        assert fetched['quantity'] == 100
        assert fetched['ip'] == '192.168.1.100'

    def test_get_item_by_id(self, isolated_db):
        item_id = db.write_item({'name': 'Capacitor', 'quantity': 50})
        fetched = db.get_item(item_id)
        assert fetched is not None
        assert fetched['name'] == 'Capacitor'
        assert fetched['quantity'] == 50

        # Non-existent ID returns None
        assert db.get_item(9999) is None

    def test_update_item(self, isolated_db):
        item_id = db.write_item({'name': 'Old Name', 'quantity': 10})
        db.update_item(item_id, {
            'name': 'New Name',
            'link': 'https://newlink.com',
            'image': 'new.jpg',
            'position': '[5]',
            'quantity': 25,
            'ip': '192.168.1.105',
            'tags': '["updated"]'
        })
        updated = db.get_item(item_id)
        assert updated['name'] == 'New Name'
        assert updated['quantity'] == 25
        assert updated['position'] == '[5]'

    def test_update_item_quantity(self, isolated_db):
        item_id = db.write_item({'name': 'LED Red', 'quantity': 10})
        db.update_item_quantity(item_id, {'quantity': 42})
        updated = db.get_item(item_id)
        assert updated['quantity'] == 42

    def test_update_item_image(self, isolated_db):
        item_id = db.write_item({'name': 'IC 555', 'image': 'old.png'})
        db.update_item_image(item_id, {'image': 'new.png'})
        updated = db.get_item(item_id)
        assert updated['image'] == 'new.png'

    def test_delete_item(self, isolated_db):
        item_id = db.write_item({'name': 'To Delete', 'quantity': 1})
        assert db.get_item(item_id) is not None

        db.delete_item(item_id)
        assert db.get_item(item_id) is None
        assert len(db.read_items()) == 0

    def test_get_all_tags_aggregation(self, isolated_db):
        # Insert items with tags
        db.write_item({'name': 'Item A', 'tags': json.dumps(['smd', 'passive'])})
        db.write_item({'name': 'Item B', 'tags': json.dumps(['smd', 'active'])})
        db.write_item({'name': 'Item C', 'tags': json.dumps(['smd'])})
        db.write_item({'name': 'Item D', 'tags': ''})  # No tags

        tag_counts = db.get_all_tags()
        # Should return distinct tags with count, sorted descending by count
        # 'smd' count = 3, 'passive' count = 1, 'active' count = 1
        assert len(tag_counts) == 3
        assert tag_counts[0]['tag'] == 'smd'
        assert tag_counts[0]['count'] == 3

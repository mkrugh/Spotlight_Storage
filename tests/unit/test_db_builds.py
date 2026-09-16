import pytest
import db


class TestDbBuilds:
    """
    Unit tests for Builds (recipes/BOM) functionality in db.py.
    """

    def test_create_and_read_build(self, isolated_db):
        build_id = db.write_build('Macro Keyboard V1')
        assert build_id is not None

        builds = db.read_builds()
        assert len(builds) == 1
        assert builds[0]['name'] == 'Macro Keyboard V1'

    def test_update_build_name(self, isolated_db):
        build_id = db.write_build('Old Build Name')
        db.update_build_name(build_id, 'New Build Name')

        builds = db.read_builds()
        assert builds[0]['name'] == 'New Build Name'

    def test_delete_build_and_cascade_items(self, isolated_db):
        # Create an item and a build
        item_id = db.write_item({'name': 'Switch', 'quantity': 50})
        build_id = db.write_build('Test Board')

        # Add part requirement
        db.set_build_items(build_id, [{'item_id': item_id, 'quantity_needed': 10}])
        assert len(db.get_build_items(build_id)) == 1

        # Delete the build
        db.delete_build(build_id)
        assert len(db.read_builds()) == 0
        assert len(db.get_build_items(build_id)) == 0

    def test_set_and_get_build_items(self, isolated_db):
        item1_id = db.write_item({'name': 'Pro Micro', 'quantity': 5})
        item2_id = db.write_item({'name': 'Diodes', 'quantity': 100})
        build_id = db.write_build('Numpad')

        db.set_build_items(build_id, [
            {'item_id': item1_id, 'quantity_needed': 1},
            {'item_id': item2_id, 'quantity_needed': 17}
        ])

        items = db.get_build_items(build_id)
        assert len(items) == 2
        quantities = {i['item_id']: i['quantity_needed'] for i in items}
        assert quantities[item1_id] == 1
        assert quantities[item2_id] == 17

    def test_execute_build_sufficient_stock(self, isolated_db):
        item_id = db.write_item({'name': 'OLED Display', 'quantity': 10})
        build_id = db.write_build('Weather Station')
        db.set_build_items(build_id, [{'item_id': item_id, 'quantity_needed': 2}])

        warnings = db.execute_build(build_id)
        assert warnings == []

        updated_item = db.get_item(item_id)
        assert updated_item['quantity'] == 8

    def test_execute_build_insufficient_stock_warning(self, isolated_db):
        item_id = db.write_item({'name': 'Rare Sensor', 'quantity': 2})
        build_id = db.write_build('Sensor Pod')
        db.set_build_items(build_id, [{'item_id': item_id, 'quantity_needed': 5}])

        warnings = db.execute_build(build_id)
        assert len(warnings) == 1
        assert warnings[0]['name'] == 'Rare Sensor'
        assert warnings[0]['have'] == 2
        assert warnings[0]['need'] == 5

        # Quantity should be clamped to 0
        updated_item = db.get_item(item_id)
        assert updated_item['quantity'] == 0

    def test_delete_item_cascades_build_items(self, isolated_db):
        """Verify deleting an item automatically removes its reference from build_items."""
        item1_id = db.write_item({'name': 'Resistor', 'quantity': 100})
        item2_id = db.write_item({'name': 'Capacitor', 'quantity': 50})
        build_id = db.write_build('Filter Circuit')

        db.set_build_items(build_id, [
            {'item_id': item1_id, 'quantity_needed': 2},
            {'item_id': item2_id, 'quantity_needed': 1},
        ])
        assert len(db.get_build_items(build_id)) == 2

        # Delete resistor item
        db.delete_item(item1_id)

        # Build items should now only contain capacitor
        remaining = db.get_build_items(build_id)
        assert len(remaining) == 1
        assert remaining[0]['item_id'] == item2_id

    def test_rapid_consecutive_build_executions(self, isolated_db):
        """Verify executing a build multiple times continuously decrements stock accurately."""
        item_id = db.write_item({'name': 'LED', 'quantity': 15})
        build_id = db.write_build('Blinky')
        db.set_build_items(build_id, [{'item_id': item_id, 'quantity_needed': 5}])

        # First run: 15 -> 10
        w1 = db.execute_build(build_id)
        assert w1 == []
        assert db.get_item(item_id)['quantity'] == 10

        # Second run: 10 -> 5
        w2 = db.execute_build(build_id)
        assert w2 == []
        assert db.get_item(item_id)['quantity'] == 5

        # Third run: 5 -> 0
        w3 = db.execute_build(build_id)
        assert w3 == []
        assert db.get_item(item_id)['quantity'] == 0

        # Fourth run: 0 -> 0 with warning
        w4 = db.execute_build(build_id)
        assert len(w4) == 1
        assert w4[0]['have'] == 0
        assert w4[0]['need'] == 5
        assert db.get_item(item_id)['quantity'] == 0

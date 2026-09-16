import json
import pytest


class TestApiItems:
    """
    Integration tests for /api/items endpoints.
    """

    def test_get_items_empty(self, client):
        response = client.get('/api/items')
        assert response.status_code == 200
        assert response.get_json() == []

    def test_create_item_success(self, client):
        payload = {
            'name': 'Arduino Nano',
            'link': 'https://arduino.cc',
            'image': '',
            'position': '[1]',
            'quantity': 5,
            'ip': '192.168.1.100',
            'tags': '["mcu"]'
        }
        response = client.post('/api/items', json=payload)
        assert response.status_code == 200
        data = response.get_json()
        assert 'id' in data
        assert data['name'] == 'Arduino Nano'

    def test_create_item_missing_name(self, client):
        response = client.post('/api/items', json={'quantity': 5})
        assert response.status_code == 400
        assert 'error' in response.get_json()

    def test_get_single_item(self, client):
        # Create item
        post_res = client.post('/api/items', json={'name': 'Relay 5V', 'quantity': 2})
        item_id = post_res.get_json()['id']

        response = client.get(f'/api/items/{item_id}')
        assert response.status_code == 200
        assert response.get_json()['name'] == 'Relay 5V'

    def test_get_nonexistent_item_404(self, client):
        response = client.get('/api/items/99999')
        assert response.status_code == 404

    def test_update_item(self, client):
        post_res = client.post('/api/items', json={'name': 'Original Name', 'quantity': 1})
        item_id = post_res.get_json()['id']

        update_payload = {
            'name': 'Modified Name',
            'link': '',
            'image': '',
            'position': '[2]',
            'quantity': 10,
            'ip': '',
            'tags': ''
        }
        response = client.put(f'/api/items/{item_id}', json=update_payload)
        assert response.status_code == 200
        assert response.get_json()['name'] == 'Modified Name'

    def test_update_item_quantity_header(self, client):
        post_res = client.post('/api/items', json={'name': 'Servo', 'quantity': 3})
        item_id = post_res.get_json()['id']

        response = client.put(
            f'/api/items/{item_id}',
            json={'quantity': 7},
            headers={'Update-Quantity': 'true'}
        )
        assert response.status_code == 200
        assert response.get_json()['quantity'] == 7

    def test_update_item_image_header(self, client):
        post_res = client.post('/api/items', json={'name': 'Stepper', 'image': 'old.jpg'})
        item_id = post_res.get_json()['id']

        response = client.put(
            f'/api/items/{item_id}',
            json={'image': 'new.jpg'},
            headers={'Update-Image': 'true'}
        )
        assert response.status_code == 200
        assert response.get_json()['image'] == 'new.jpg'

    def test_delete_item(self, client):
        post_res = client.post('/api/items', json={'name': 'To Be Deleted'})
        item_id = post_res.get_json()['id']

        delete_res = client.delete(f'/api/items/{item_id}')
        assert delete_res.status_code == 200
        assert delete_res.get_json() == {'success': True}

        # Verify deletion
        get_res = client.get(f'/api/items/{item_id}')
        assert get_res.status_code == 404

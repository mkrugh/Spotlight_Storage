import pytest


class TestApiBuilds:
    """
    Integration tests for /api/builds endpoints.
    """

    def test_get_builds_empty(self, client):
        response = client.get('/api/builds')
        assert response.status_code == 200
        assert response.get_json() == []

    def test_create_build(self, client):
        response = client.post('/api/builds', json={'name': 'Drone Build'})
        assert response.status_code == 201
        data = response.get_json()
        assert 'id' in data
        assert data['name'] == 'Drone Build'

    def test_create_build_missing_name(self, client):
        response = client.post('/api/builds', json={})
        assert response.status_code == 400

    def test_get_build_details_with_items(self, client):
        # Create item first
        item_res = client.post('/api/items', json={'name': 'Motor', 'quantity': 4})
        item_id = item_res.get_json()['id']

        # Create build with items
        build_res = client.post('/api/builds', json={
            'name': 'Quadcopter',
            'items': [{'item_id': item_id, 'quantity_needed': 4}]
        })
        build_id = build_res.get_json()['id']

        response = client.get(f'/api/builds/{build_id}')
        assert response.status_code == 200
        data = response.get_json()
        assert data['id'] == build_id
        assert len(data['items']) == 1
        assert data['items'][0]['item_id'] == item_id

    def test_update_build(self, client):
        build_res = client.post('/api/builds', json={'name': 'Robot Arm'})
        build_id = build_res.get_json()['id']

        update_res = client.put(f'/api/builds/{build_id}', json={'name': 'Robot Arm V2', 'items': []})
        assert update_res.status_code == 200
        assert update_res.get_json() == {'success': True}

    def test_delete_build(self, client):
        build_res = client.post('/api/builds', json={'name': 'Temporary Project'})
        build_id = build_res.get_json()['id']

        del_res = client.delete(f'/api/builds/{build_id}')
        assert del_res.status_code == 200
        assert del_res.get_json() == {'success': True}

    def test_execute_build_endpoint(self, client):
        item_res = client.post('/api/items', json={'name': 'ESP32 Module', 'quantity': 10})
        item_id = item_res.get_json()['id']

        build_res = client.post('/api/builds', json={
            'name': 'IoT Device',
            'items': [{'item_id': item_id, 'quantity_needed': 3}]
        })
        build_id = build_res.get_json()['id']

        exec_res = client.post(f'/api/builds/{build_id}/execute')
        assert exec_res.status_code == 200
        exec_data = exec_res.get_json()
        assert exec_data['success'] is True
        assert exec_data['warnings'] == []

        # Check reduced quantity
        get_item = client.get(f'/api/items/{item_id}')
        assert get_item.get_json()['quantity'] == 7

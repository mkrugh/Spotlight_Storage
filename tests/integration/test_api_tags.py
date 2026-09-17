import json
import pytest


class TestApiTags:
    """
    Integration tests for /api/tags endpoint.
    """

    def test_get_tags_empty(self, client):
        response = client.get('/api/tags')
        assert response.status_code == 200
        assert response.get_json() == []

    def test_get_tags_with_data(self, client):
        client.post('/api/items', json={'name': 'Item 1', 'tags': json.dumps(['resistor', '0805'])})
        client.post('/api/items', json={'name': 'Item 2', 'tags': json.dumps(['resistor', '1206'])})

        response = client.get('/api/tags')
        assert response.status_code == 200
        data = response.get_json()
        assert len(data) >= 2
        tag_map = {item['tag']: item['count'] for item in data}
        assert tag_map['resistor'] == 2
        assert tag_map['0805'] == 1

    def test_get_tags_deduplicates_per_item(self, client):
        client.post('/api/items', json={'name': 'Item 1', 'tags': json.dumps(['resistor', 'resistor', '0805'])})
        client.post('/api/items', json={'name': 'Item 2', 'tags': 'resistor, resistor, 1206'})

        response = client.get('/api/tags')
        assert response.status_code == 200
        data = response.get_json()
        tag_map = {item['tag']: item['count'] for item in data}
        assert tag_map['resistor'] == 2
        assert tag_map['0805'] == 1
        assert tag_map['1206'] == 1


import pytest


class TestApiEsp:
    """
    Integration tests for /api/esp/ endpoints.
    """

    def test_get_esp_list_empty(self, client):
        response = client.get('/api/esp/')
        assert response.status_code == 200
        assert response.get_json() == []

    def test_create_esp_success(self, client):
        payload = {
            'name': 'Cabinet A',
            'esp_ip': '192.168.1.180',
            'rows': 6,
            'cols': 4,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        }
        response = client.post('/api/esp/', json=payload)
        assert response.status_code == 201
        data = response.get_json()
        assert 'id' in data
        assert data['name'] == 'Cabinet A'

    def test_create_esp_missing_data(self, client):
        response = client.post('/api/esp/', json={})
        assert response.status_code == 400

    def test_get_esp_by_ip(self, client, sample_esp):
        response = client.get(f'/api/esp/{sample_esp["esp_ip"]}')
        assert response.status_code == 200
        assert response.get_json()['name'] == 'Test ESP Matrix'

    def test_get_esp_nonexistent(self, client):
        response = client.get('/api/esp/10.0.0.99')
        assert response.status_code == 404

    def test_update_esp(self, client, sample_esp):
        update_data = {
            'name': 'Renamed Cabinet',
            'esp_ip': sample_esp['esp_ip'],
            'rows': 10,
            'cols': 10,
            'startTop': 'bottom',
            'startLeft': 'right',
            'serpentineDirection': 'vertical'
        }
        response = client.put(f'/api/esp/{sample_esp["id"]}', json=update_data)
        assert response.status_code == 200
        assert response.get_json() == {'success': True}

    def test_delete_esp(self, client, sample_esp):
        response = client.delete(f'/api/esp/{sample_esp["id"]}')
        assert response.status_code == 200
        assert response.get_json() == {'success': True}

    def test_create_and_get_multi_section_esp(self, client):
        sections = [
            {'name': 'Top', 'rows': 4, 'cols': 6, 'start_top': 'top', 'start_left': 'left', 'serpentine_direction': 'horizontal'},
            {'name': 'Bottom', 'rows': 2, 'cols': 3, 'start_top': 'top', 'start_left': 'left', 'serpentine_direction': 'horizontal'}
        ]
        payload = {
            'name': 'Multi-Section Rack',
            'esp_ip': '192.168.1.185',
            'sections': sections
        }
        response = client.post('/api/esp/', json=payload)
        assert response.status_code == 201
        created = response.get_json()
        assert 'id' in created
        assert created['name'] == 'Multi-Section Rack'
        assert created['rows'] == 6
        assert created['cols'] == 6

        # Retrieve and verify sections parsed back
        get_res = client.get('/api/esp/')
        assert get_res.status_code == 200
        all_esps = get_res.get_json()
        matching = next(e for e in all_esps if e['id'] == created['id'])
        assert matching['sections'] is not None
        assert len(matching['sections']) == 2
        assert matching['sections'][0]['cols'] == 6
        assert matching['sections'][1]['cols'] == 3
        assert 'total_bins' in matching
        assert matching['total_bins'] == 30  # 4*6 + 2*3 = 24 + 6 = 30
        assert 'occupied_bins' in matching
        assert matching['occupied_bins'] == 0
        assert matching['fill_percentage'] == 0.0

    def test_get_esp_metrics_with_assigned_items(self, client):
        # Create controller (5x5 = 25 bins)
        esp_res = client.post('/api/esp/', json={
            'name': 'Metrics Controller',
            'esp_ip': '192.168.1.199',
            'rows': 5,
            'cols': 5,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        })
        assert esp_res.status_code == 201

        # Add 5 items occupying 5 distinct bins
        for i in range(5):
            client.post('/api/items', json={
                'name': f'Part {i}',
                'quantity': 1,
                'min_quantity': 0,
                'position': [i],
                'ip': '192.168.1.199',
                'tags': ''
            })

        res = client.get('/api/esp/')
        assert res.status_code == 200
        data = res.get_json()
        target = next(e for e in data if e['name'] == 'Metrics Controller')
        assert target['total_bins'] == 25
        assert target['occupied_bins'] == 5
        assert target['fill_percentage'] == 20.0

    def test_get_esp_without_metrics(self, client):
        client.post('/api/esp/', json={
            'name': 'No Metrics Controller',
            'esp_ip': '192.168.1.198',
            'rows': 4,
            'cols': 4,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        })
        res = client.get('/api/esp/?include_metrics=false')
        assert res.status_code == 200
        data = res.get_json()
        target = next(e for e in data if e['name'] == 'No Metrics Controller')
        assert 'total_bins' not in target
        assert 'occupied_bins' not in target
        assert 'fill_percentage' not in target

    def test_post_esp_duplicate_ip_returns_400(self, client):
        payload1 = {
            'name': 'Original Box',
            'esp_ip': '192.168.1.170',
            'rows': 4,
            'cols': 4,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        }
        res1 = client.post('/api/esp/', json=payload1)
        assert res1.status_code == 201

        # Attempt to add with duplicate IP
        payload2 = {
            'name': 'Duplicate Box',
            'esp_ip': '192.168.1.170',
            'rows': 5,
            'cols': 5,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        }
        res2 = client.post('/api/esp/', json=payload2)
        assert res2.status_code == 400
        data = res2.get_json()
        assert 'error' in data
        assert "already exists" in data['error']
        assert "Original Box" in data['error']

    def test_put_esp_duplicate_ip_returns_400(self, client):
        p1 = {
            'name': 'Box One',
            'esp_ip': '192.168.1.171',
            'rows': 4,
            'cols': 4,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        }
        p2 = {
            'name': 'Box Two',
            'esp_ip': '192.168.1.172',
            'rows': 4,
            'cols': 4,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        }
        r1 = client.post('/api/esp/', json=p1)
        r2 = client.post('/api/esp/', json=p2)
        id2 = r2.get_json()['id']

        # Attempt to update Box Two's IP to Box One's IP
        update_payload = {
            'name': 'Box Two Updated',
            'esp_ip': '192.168.1.171',
            'rows': 4,
            'cols': 4,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        }
        res_put = client.put(f'/api/esp/{id2}', json=update_payload)
        assert res_put.status_code == 400
        assert "already exists" in res_put.get_json()['error']




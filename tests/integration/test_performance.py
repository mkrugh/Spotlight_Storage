import json
import time
import pytest

import db


class TestPerformanceAndScale:
    """
    Performance benchmark and scaling smoke tests ensuring responsiveness
    under larger inventory datasets.
    """

    def test_bulk_inventory_query_performance(self, client, isolated_db):
        """Verify reading 300 inventory items responds in under 500 milliseconds."""
        num_items = 300

        # Bulk populate SQLite database
        conn = db.create_combined_db()
        items_data = [
            (
                f'Item #{i:04d}',
                f'http://supplier.com/item/{i}',
                f'image_{i}.png',
                f'[{i % 10}]',
                i * 2,
                f'192.168.1.{(i % 20) + 10}',
                json.dumps([f'tag_{i % 15}', 'bulk_test', 'hardware'])
            )
            for i in range(num_items)
        ]
        conn.executemany(
            'INSERT INTO items (name, link, image, position, quantity, ip, tags) VALUES (?, ?, ?, ?, ?, ?, ?)',
            items_data
        )
        conn.commit()
        conn.close()

        # Benchmark GET /api/items
        start_time = time.perf_counter()
        response = client.get('/api/items')
        duration = time.perf_counter() - start_time

        assert response.status_code == 200
        items = response.get_json()
        assert len(items) == num_items
        assert duration < 0.50, f"GET /api/items took {duration:.3f}s, expected < 0.50s"

    def test_tag_aggregation_performance_under_scale(self, client, isolated_db):
        """Verify tag extraction and counting across 300 items completes in under 500ms."""
        num_items = 300

        conn = db.create_combined_db()
        items_data = [
            (
                f'Part #{i}',
                json.dumps([f'category_{i % 5}', f'subcategory_{i % 10}', 'common_tag'])
            )
            for i in range(num_items)
        ]
        conn.executemany('INSERT INTO items (name, tags) VALUES (?, ?)', items_data)
        conn.commit()
        conn.close()

        start_time = time.perf_counter()
        response = client.get('/api/tags')
        duration = time.perf_counter() - start_time

        assert response.status_code == 200
        tags = response.get_json()
        assert len(tags) > 0

        # Verify common_tag was counted 300 times
        common = next((t for t in tags if t['tag'] == 'common_tag'), None)
        assert common is not None
        assert common['count'] == num_items
        assert duration < 0.50, f"GET /api/tags took {duration:.3f}s, expected < 0.50s"

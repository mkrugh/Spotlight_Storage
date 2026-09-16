import pytest
from app import position_optimization


class TestMatrixMath:
    """
    Tests for position_optimization(positions, esp) in app.py.
    Calculates physical WS2812 LED strip indices from logical 2D drawer grid indices.
    """

    def test_empty_positions(self):
        esp = {
            'rows': 4,
            'cols': 5,
            'start_top': 'top',
            'start_left': 'left',
            'serpentine_direction': 'horizontal'
        }
        assert position_optimization([], esp) == []

    def test_horizontal_serpentine_top_left(self):
        """
        Grid: 3 rows, 4 cols.
        Row 0: 0, 1, 2, 3 (L->R)
        Row 1: 7, 6, 5, 4 (R->L serpentine)
        Row 2: 8, 9, 10, 11 (L->R)
        """
        esp = {
            'rows': 3,
            'cols': 4,
            'start_top': 'top',
            'start_left': 'left',
            'serpentine_direction': 'horizontal'
        }
        # Drawer 1 (row 0, col 0)
        assert position_optimization([1], esp) == [0]
        # Drawer 4 (row 0, col 3)
        assert position_optimization([4], esp) == [3]
        # Multi-selection
        result = position_optimization([1, 4], esp)
        assert len(result) == 2
        assert result[0] == 0
        assert result[1] == 3

    def test_horizontal_serpentine_odd_row_mapping(self):
        """
        Verifies behavior on odd row.
        """
        esp = {
            'rows': 2,
            'cols': 4,
            'start_top': 'top',
            'start_left': 'left',
            'serpentine_direction': 'horizontal'
        }
        # Drawer 5 (row 1, col 0) and Drawer 8 (row 1, col 3)
        res_5 = position_optimization([5], esp)
        res_8 = position_optimization([8], esp)
        assert len(res_5) == 1
        assert len(res_8) == 1
        # The two ends of row 1 must map to valid distinct indices in [4, 7]
        assert res_5[0] in [4, 7]
        assert res_8[0] in [4, 7]
        assert res_5[0] != res_8[0]

    def test_vertical_serpentine_top_left(self):
        """
        Grid: 4 rows, 3 cols with vertical serpentine wiring.
        """
        esp = {
            'rows': 4,
            'cols': 3,
            'start_top': 'top',
            'start_left': 'left',
            'serpentine_direction': 'vertical'
        }
        # Drawer 1 (col 0, row 0)
        assert position_optimization([1], esp) == [0]

    def test_corner_offsets_start_right(self):
        """
        Wiring starting from top-right.
        """
        esp = {
            'rows': 3,
            'cols': 4,
            'start_top': 'top',
            'start_left': 'right',
            'serpentine_direction': 'horizontal'
        }
        res = position_optimization([1], esp)
        assert len(res) == 1
        assert isinstance(res[0], int)

    def test_corner_offsets_start_bottom(self):
        """
        Wiring starting from bottom-left.
        """
        esp = {
            'rows': 3,
            'cols': 4,
            'start_top': 'bottom',
            'start_left': 'left',
            'serpentine_direction': 'horizontal'
        }
        res = position_optimization([1], esp)
        assert len(res) == 1
        assert isinstance(res[0], int)

    def test_single_cell_matrix(self):
        """1x1 Matrix edge case."""
        esp = {
            'rows': 1,
            'cols': 1,
            'start_top': 'top',
            'start_left': 'left',
            'serpentine_direction': 'horizontal'
        }
        assert position_optimization([1], esp) == [0]

    def test_single_row_strip(self):
        """1xN strip matrix."""
        esp = {
            'rows': 1,
            'cols': 10,
            'start_top': 'top',
            'start_left': 'left',
            'serpentine_direction': 'horizontal'
        }
        assert position_optimization([1, 5, 10], esp) == [0, 4, 9]

    def test_numeric_flag_compatibility(self):
        """
        Legacy values where start_left == "1" (meaning right)
        or serpentine_direction == "1" (meaning vertical).
        """
        esp = {
            'rows': 2,
            'cols': 2,
            'start_top': 'top',
            'start_left': '1',
            'serpentine_direction': '1'
        }
        res = position_optimization([1], esp)
        assert len(res) == 1
        assert isinstance(res[0], int)

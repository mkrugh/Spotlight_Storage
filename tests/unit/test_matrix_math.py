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

    def test_multi_section_two_tier_cabinet(self):
        """
        Two-tier cabinet:
        Section 0: 4 rows x 6 cols (24 bins: 1..24, LEDs 0..23)
        Section 1: 2 rows x 3 cols (6 bins: 25..30, LEDs 24..29)
        """
        esp = {
            'name': 'Mixed Cabinet',
            'rows': 6,
            'cols': 6,
            'sections': [
                {
                    'name': 'Top Drawers',
                    'rows': 4,
                    'cols': 6,
                    'start_top': 'top',
                    'start_left': 'left',
                    'serpentine_direction': 'horizontal'
                },
                {
                    'name': 'Bottom Drawers',
                    'rows': 2,
                    'cols': 3,
                    'start_top': 'top',
                    'start_left': 'left',
                    'serpentine_direction': 'horizontal'
                }
            ]
        }
        # First drawer in Section 0 (row 0, col 0) -> LED 0
        assert position_optimization([1], esp) == [0]
        # Fourth drawer in Section 0 (row 0, col 3) -> LED 3
        assert position_optimization([4], esp) == [3]
        # First drawer in Section 1 (row 0, col 0 in Section 1) -> LED 24
        assert position_optimization([25], esp) == [24]
        # Third drawer in Section 1 (row 0, col 2 in Section 1) -> LED 26
        assert position_optimization([27], esp) == [26]
        # Fourth drawer in Section 1 (1st on row 1 in serpentine sequence) -> LED 27
        assert position_optimization([28], esp) == [27]
        # Last drawer in Section 1 (3rd on row 1 in serpentine sequence) -> LED 29
        assert position_optimization([30], esp) == [29]
        # Multi-selection across both sections
        multi = position_optimization([1, 25, 28], esp)
        assert multi == [0, 24, 27]

    def test_multi_section_three_tier_cabinet(self):
        """
        Three-tier cabinet with arbitrary N sections:
        Section 0: 2 rows x 8 cols (16 bins: 1..16, LEDs 0..15)
        Section 1: 3 rows x 4 cols (12 bins: 17..28, LEDs 16..27)
        Section 2: 2 rows x 2 cols (4 bins: 29..32, LEDs 28..31)
        """
        esp = {
            'sections': [
                {'rows': 2, 'cols': 8, 'start_top': 'top', 'start_left': 'left', 'serpentine_direction': 'horizontal'},
                {'rows': 3, 'cols': 4, 'start_top': 'top', 'start_left': 'left', 'serpentine_direction': 'horizontal'},
                {'rows': 2, 'cols': 2, 'start_top': 'top', 'start_left': 'left', 'serpentine_direction': 'horizontal'}
            ]
        }
        # Section 0 start
        assert position_optimization([1], esp) == [0]
        # Section 1 start (bin 17 -> LED 16)
        assert position_optimization([17], esp) == [16]
        # Section 2 start (bin 29 -> LED 28)
        assert position_optimization([29], esp) == [28]
        # Section 2 end (bin 32 -> 4th bin in Section 2 -> LED 31)
        assert position_optimization([32], esp) == [31]

    def test_multi_section_custom_start_direction(self):
        """
        Section with start_left = 'right'.
        """
        esp = {
            'sections': [
                {'rows': 2, 'cols': 4, 'start_top': 'top', 'start_left': 'left', 'serpentine_direction': 'horizontal'},
                {'rows': 2, 'cols': 4, 'start_top': 'top', 'start_left': 'right', 'serpentine_direction': 'horizontal'}
            ]
        }
        # Bin 9 is row 0, col 0 of Section 1. Since start_left is right, col 0 is at the far right -> LED 8 + 3 = 11
        assert position_optimization([9], esp) == [11]

    def test_multi_section_out_of_bounds_handling(self):
        """
        Positions outside the configured section bin counts should be safely ignored.
        """
        esp = {
            'sections': [
                {'rows': 2, 'cols': 2, 'start_top': 'top', 'start_left': 'left', 'serpentine_direction': 'horizontal'}
            ]
        }
        # Bins 1..4 valid, 0 and 99 invalid
        assert position_optimization([0, 2, 99], esp) == [1]

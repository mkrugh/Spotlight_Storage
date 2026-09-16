import pytest
from app import hex_to_rgb


class TestColorConversion:
    """
    Tests for hex_to_rgb(hex_color) in app.py.
    """

    def test_valid_hex_with_hash(self):
        assert hex_to_rgb("#FF0000") == [255, 0, 0]
        assert hex_to_rgb("#00FF00") == [0, 255, 0]
        assert hex_to_rgb("#0000FF") == [0, 0, 255]
        assert hex_to_rgb("#FFFFFF") == [255, 255, 255]
        assert hex_to_rgb("#000000") == [0, 0, 0]

    def test_valid_hex_without_hash(self):
        assert hex_to_rgb("FF0000") == [255, 0, 0]
        assert hex_to_rgb("123456") == [18, 52, 86]

    def test_lowercase_hex(self):
        assert hex_to_rgb("#ff8800") == [255, 136, 0]

    def test_invalid_length(self):
        # 3-char shorthand is not supported by hex_to_rgb -> falls back to [0, 255, 0]
        assert hex_to_rgb("#FFF") == [0, 255, 0]
        # 8-char RGBA hex -> falls back to [0, 255, 0]
        assert hex_to_rgb("#FF00FF00") == [0, 255, 0]

    def test_invalid_characters(self):
        assert hex_to_rgb("#GGZZ11") == [0, 255, 0]
        assert hex_to_rgb("not-a-color") == [0, 255, 0]

    def test_none_and_empty(self):
        assert hex_to_rgb(None) == [0, 255, 0]
        assert hex_to_rgb("") == [0, 255, 0]

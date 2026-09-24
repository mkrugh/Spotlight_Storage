# Multilingual Support

Spotlight Storage is designed for a global user base and ships with 6 languages out of the box:
- English (en)
- German (de)
- French (fr)
- Dutch (nl)
- Finnish (fi)
- Polish (pl)

The language is selected per-user in the Settings panel and is persisted in the browser's `localStorage`.

## How the System Works

Translation files live in the `static/translations/` directory as `<lang_code>.json` files.
Each file is a flat JSON object where the keys are string identifiers used in the HTML templates and JavaScript, and the values are the localized display strings.

At load time, `static/translation.js` fetches the active language JSON from the `/api/translations?lang=<code>` endpoint. It then scans the DOM and replaces the text of every element carrying a `data-i18n` attribute with its corresponding translated value. JavaScript UI strings (like alerts or dynamic labels) are updated using the same loaded dictionary.

## Adding a New Language

1. Copy `static/translations/en.json` to `static/translations/<new_lang_code>.json` (use standard ISO 639-1 codes, e.g., `es` for Spanish, `it` for Italian).
2. Translate the value strings on the right side of the colon. **Do not change the keys** — these are the internal identifiers.
3. Restart the app (or just reload your browser). The new language will appear automatically in the Language dropdown in Settings.

## Editing an Existing Translation

1. Open the relevant `static/translations/<lang_code>.json` file in any text editor.
2. Edit the value strings. Save the file.
3. Hard-refresh the browser (Ctrl+Shift+R / Cmd+Shift+R) to clear any cached translations.

## Adding a New Translatable String to the UI

If you are developing new features and need to add translations:

1. Add the new key + English value to `en.json`.
2. Add the same key with translated values to each other language file.
3. In `templates/index.html`, add the `data-i18n="your_new_key"` attribute to the HTML element that should display the string.
4. For JS-only strings (e.g., alert messages), use the `window.i18n['your_new_key']` pattern already used throughout `static/script.js`.

## Translation Key Reference

Here is the full list of all 74 translation keys currently used in Spotlight Storage (based on `en.json`):

| Key | English Value |
|-----|---------------|
| `add_item` | Add Item |
| `search` | Search... |
| `sortingBytags_text` | Filter by tags |
| `sortingMethods_text` | Sort by |
| `add_esp_button` | Add WLED Controller |
| `esp_devices_text` | WLED Controllers |
| `offcanvasSettingsLabel` | Settings |
| `leds_text` | LEDs |
| `on_btn_label` | On |
| `off_btn_label` | Off |
| `party_btn_label` | Party |
| `settings_brightness` | Brightness |
| `settings_timeout` | Timeout (Seconds) |
| `or_text` | or |
| `language_label` | Language |
| `item_url_label` | URL |
| `item_quantity_label` | Quantity |
| `item_min_quantity_label` | Low stock alert (≤) |
| `item_imageUrl_label` | Image URL |
| `item_imageUplad_label` | Upload Image |
| `item_tag_label` | Tags |
| `item_select_esp_label` | Select WLED Controller |
| `test_led_btn_label` | Test |
| `clear_grid_btn_label` | Clear Grid |
| `item_select_leds_label` | Select LED |
| `webinterface_label` | Open WLED UI |
| `light_mode_label` | Light Mode |
| `dark_mode_label` | Dark Mode |
| `auto_mode_label` | Auto (System) |
| `inventur_btn_label` | Stocktaking |
| `cancel_btn_label` | Cancel |
| `add_btn_label` | Add |
| `save_btn_label` | Save |
| `edit_inventur_btn_label` | Edit |
| `continue_btn_label` | Continue |
| `locate_led_color` | Locate Color |
| `standby_led_color` | Standby Color |
| `left_label` | Left |
| `right_label` | Right |
| `start_left_label` | Start X |
| `top_label` | Top |
| `bottom_label` | Bottom |
| `start_top_label` | Start Y |
| `horizontal_label` | Horizontal |
| `vertical_label` | Vertical |
| `serpentine_dir_label` | Serpentine Direction |
| `esp_error_alert_text` | Error: Could not connect to ESP |
| `esp_name_text` | Name |
| `esp_ip_text` | IP Address |
| `add_esp_label` | Edit WLED Controller |
| `esp_rows_text` | Rows |
| `esp_columns_text` | Columns |
| `cropAndSaveBtn` | Crop and Save |
| `cropImageModalLabel` | Crop Image |
| `espDeleteModalLabel` | Delete Controller? |
| `sortBybox` | Cabinet |
| `sortByid` | ID |
| `sortByname` | Name |
| `sortByquantity` | Quantity |
| `sortBylocation` | Bin # |
| `sortAsc` | Ascending |
| `sortDesc` | Descending |
| `minus_btn_label` | -1 |
| `plus_btn_label` | +1 |
| `locate_btn_label` | Locate |
| `edit_btn_label` | Edit |
| `copy_item` | Duplicate |
| `delete_item` | Delete |
| `crop_image` | Crop Image |
| `link_btn_label` | Open Link |
| `tag_match_mode` | Tag Match Mode |
| `tag_match_any` | Match Any (OR) |
| `tag_match_all` | Match All (AND) |

---
[Return to Main README](../README.md)

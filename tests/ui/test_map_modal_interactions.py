import pytest
import db


def test_map_modal_dropdown_fill_metrics(ui_page):
    """
    Verify that opening the Map modal renders cabinet utilization metrics
    in the #map-esp-select dropdown options.
    """
    page = ui_page

    # Add an ESP controller with 2x5 = 10 bins
    esp_id = db.write_esp_settings({
        'name': 'Component Rack A',
        'esp_ip': '192.168.1.100',
        'rows': 2,
        'cols': 5,
        'startTop': 'top',
        'startLeft': 'left',
        'serpentineDirection': 'horizontal'
    })
    assert esp_id is not None

    # Open the map modal
    page.click('#open-map-btn')
    page.wait_for_selector('#map-modal', state='visible')

    # Wait for the select element options to populate
    page.wait_for_selector('#map-esp-select option', state='attached')

    options = page.locator('#map-esp-select option')
    assert options.count() >= 1

    option_text = options.first.text_content()
    # In conftest, items with ip 192.168.1.100 have positions [1] and [2] -> 2 occupied bins
    assert 'Component Rack A' in option_text
    assert '2/10 bins' in option_text
    assert '20% full' in option_text


def test_map_modal_unconfigured_controller(ui_page):
    """
    Verify that an ESP controller with 0 bins renders as (Unconfigured)
    in the dropdown option label.
    """
    page = ui_page

    esp_id = db.write_esp_settings({
        'name': 'Empty Controller',
        'esp_ip': '192.168.1.250',
        'rows': 0,
        'cols': 0,
        'startTop': 'top',
        'startLeft': 'left',
        'serpentineDirection': 'horizontal'
    })
    assert esp_id is not None

    page.click('#open-map-btn')
    page.wait_for_selector('#map-modal', state='visible')
    page.wait_for_selector('#map-esp-select option', state='attached')

    # Find the option matching Empty Controller
    option = page.locator('#map-esp-select option', has_text='Empty Controller')
    assert option.count() == 1
    assert 'Unconfigured' in option.text_content()


def test_map_modal_full_and_overcapacity_labels(ui_page):
    """
    Verify that 100% full and overcapacity cabinets display 'Full' and 'Overcapacity'
    in the dropdown option labels.
    """
    page = ui_page

    # Cabinet 1: Exactly 100% full (1x2 = 2 bins, LEDs [0] and [1])
    db.write_esp_settings({
        'name': 'Full Cabinet',
        'esp_ip': '192.168.1.251',
        'rows': 1,
        'cols': 2,
        'startTop': 'top',
        'startLeft': 'left',
        'serpentineDirection': 'horizontal'
    })
    db.write_item({'name': 'Item F1', 'link': '', 'image': '', 'position': [0], 'quantity': 1, 'min_quantity': 1, 'ip': '192.168.1.251', 'tags': ''})
    db.write_item({'name': 'Item F2', 'link': '', 'image': '', 'position': [1], 'quantity': 1, 'min_quantity': 1, 'ip': '192.168.1.251', 'tags': ''})

    # Cabinet 2: Overcapacity (1x2 = 2 bins, LEDs [0], [1], [2])
    db.write_esp_settings({
        'name': 'Overcap Cabinet',
        'esp_ip': '192.168.1.252',
        'rows': 1,
        'cols': 2,
        'startTop': 'top',
        'startLeft': 'left',
        'serpentineDirection': 'horizontal'
    })
    db.write_item({'name': 'Item O1', 'link': '', 'image': '', 'position': [0], 'quantity': 1, 'min_quantity': 1, 'ip': '192.168.1.252', 'tags': ''})
    db.write_item({'name': 'Item O2', 'link': '', 'image': '', 'position': [1], 'quantity': 1, 'min_quantity': 1, 'ip': '192.168.1.252', 'tags': ''})
    db.write_item({'name': 'Item O3', 'link': '', 'image': '', 'position': [2], 'quantity': 1, 'min_quantity': 1, 'ip': '192.168.1.252', 'tags': ''})

    page.click('#open-map-btn')
    page.wait_for_selector('#map-modal', state='visible')
    page.wait_for_selector('#map-esp-select option', state='attached')

    full_option = page.locator('#map-esp-select option', has_text='Full Cabinet')
    assert full_option.count() == 1
    assert 'Full' in full_option.text_content()
    assert '2/2 bins' in full_option.text_content()

    overcap_option = page.locator('#map-esp-select option', has_text='Overcap Cabinet')
    assert overcap_option.count() == 1
    assert 'Overcapacity' in overcap_option.text_content()
    assert '3/2 bins' in overcap_option.text_content()


def test_map_modal_assign_part_to_empty_bin(ui_page):
    """
    Verify that clicking an empty bin displays the 'Assign Part to this Bin' button,
    and clicking it closes the Map modal and opens the Add Item modal with
    the cabinet locked and the bin pre-filled.
    """
    page = ui_page

    esp_id = db.write_esp_settings({
        'name': 'Assignment Rack',
        'esp_ip': '192.168.1.253',
        'rows': 1,
        'cols': 3,
        'startTop': 'top',
        'startLeft': 'left',
        'serpentineDirection': 'horizontal'
    })
    assert esp_id is not None

    # Open Map modal
    page.click('#open-map-btn')
    page.wait_for_selector('#map-modal', state='visible')

    # Select the Assignment Rack
    page.select_option('#map-esp-select', value=str(esp_id))

    # Bin #2 is empty (no items in it)
    card_bin2 = page.locator('#map-drawer-grid-view .map-drawer-card[data-led="2"]')
    page.wait_for_selector('#map-drawer-grid-view .map-drawer-card[data-led="2"]', state='attached')
    card_bin2.click()

    # Verify inspector displays the assign button
    assign_btn = page.locator('#map-side-panel button[data-action="assign-empty-bin"]')
    assert assign_btn.is_visible()
    assert 'Assign Part to this Bin' in assign_btn.text_content()

    # Click the assign button
    assign_btn.click()

    # Verify map modal closes and item modal opens
    page.wait_for_selector('#map-modal', state='hidden')
    page.wait_for_selector('#item-modal', state='visible')

    # Verify badge is shown and select is disabled
    badge = page.locator('#assigned-from-map-badge')
    assert badge.is_visible()
    assert 'Assigned from Map' in badge.text_content()
    assert 'Bin #2' in badge.text_content()

    esp_select = page.locator('#item_esp_select')
    assert esp_select.is_disabled()

    # Verify canvas rendered with full modal container width (not shrunken)
    canvas = page.locator('#item-responsive-canvas')
    box = canvas.bounding_box()
    assert box is not None
    assert box['width'] > 250

    # Fill required fields and save
    page.locator('#item_name').fill('Map Assigned Screws')
    page.locator('#item_url').fill('https://example.com/screws')
    page.locator('#item_quantity').fill('50')
    page.click('#save-item-button')

    # Verify item modal closes and part is in database
    page.wait_for_selector('#item-modal', state='hidden')

    items = db.read_items()
    created = next(it for it in items if it['name'] == 'Map Assigned Screws')
    assert created['ip'] == '192.168.1.253'
    assert '2' in str(created['position'])


def test_map_modal_assign_part_cancel_resets_form_state(ui_page):
    """
    Verify that if the user enters the Add Item modal from the Map flow
    and cancels, subsequent manual opening of the Add Item modal clears
    the 'Assigned from Map' badge, re-enables the cabinet select, and resets fields.
    """
    page = ui_page

    esp_id = db.write_esp_settings({
        'name': 'Reset Rack',
        'esp_ip': '192.168.1.254',
        'rows': 1,
        'cols': 2,
        'startTop': 'top',
        'startLeft': 'left',
        'serpentineDirection': 'horizontal'
    })
    assert esp_id is not None

    # Open Map modal and select cabinet
    page.click('#open-map-btn')
    page.wait_for_selector('#map-modal', state='visible')
    page.select_option('#map-esp-select', value=str(esp_id))

    # Click empty bin #1
    card_bin1 = page.locator('#map-drawer-grid-view .map-drawer-card[data-led="1"]')
    page.wait_for_selector('#map-drawer-grid-view .map-drawer-card[data-led="1"]', state='attached')
    card_bin1.click()

    # Click Assign Part button
    assign_btn = page.locator('#map-side-panel button[data-action="assign-empty-bin"]')
    page.wait_for_selector('#map-side-panel button[data-action="assign-empty-bin"]', state='visible')
    assign_btn.click()

    # Wait for item modal to open with locked cabinet & badge
    page.wait_for_selector('#map-modal', state='hidden')
    page.wait_for_selector('#item-modal', state='visible')
    assert page.locator('#assigned-from-map-badge').is_visible()
    assert page.locator('#item_esp_select').is_disabled()

    # Cancel out using the dialog close button
    page.click('#item-modal .btn-close')
    page.wait_for_selector('#item-modal', state='hidden')

    # Now open Add Item modal from navbar button
    navbar_add_btn = page.locator('nav button:has-text("Add Item"), header button:has-text("Add Item")').first
    navbar_add_btn.click()
    page.wait_for_selector('#item-modal', state='visible')

    # Verify badge is gone and select is NOT disabled
    assert page.locator('#assigned-from-map-badge').count() == 0
    assert not page.locator('#item_esp_select').is_disabled()
    assert page.locator('#assigned-map-esp-ip').count() == 0


def test_map_modal_move_part_to_empty_bin(ui_page):
    """
    Verify clicking 'Move Part' in the drawer inspector displays the move banner,
    and selecting an empty bin moves the part to the new location.
    """
    page = ui_page

    esp_id = db.write_esp_settings({
        'name': 'Move Test Rack',
        'esp_ip': '192.168.1.255',
        'rows': 1,
        'cols': 2,
        'startTop': 'top',
        'startLeft': 'left',
        'serpentineDirection': 'horizontal'
    })
    assert esp_id is not None

    item_id = db.write_item({
        'name': 'Mover Widget',
        'link': '',
        'image': '',
        'position': [1],
        'quantity': 10,
        'min_quantity': 2,
        'ip': '192.168.1.255',
        'tags': ''
    })
    assert item_id is not None

    # Open Map modal and select cabinet
    page.click('#open-map-btn')
    page.wait_for_selector('#map-modal', state='visible')
    page.select_option('#map-esp-select', value=str(esp_id))

    # Click Drawer #1 (occupied)
    page.wait_for_selector('#map-drawer-grid-view .map-drawer-card[data-led="1"]', state='attached')
    page.locator('#map-drawer-grid-view .map-drawer-card[data-led="1"]').click()

    # Move button should be visible in side panel
    move_btn = page.locator('#map-side-panel button[data-action="start-move"]')
    page.wait_for_selector('#map-side-panel button[data-action="start-move"]', state='visible')

    # Click Move Part
    move_btn.click()

    # Move banner should now be visible
    page.wait_for_selector('#map-move-banner', state='visible')
    assert 'Mover Widget' in page.locator('#map-move-banner-text').text_content()

    # Accept the browser confirmation dialog
    page.on('dialog', lambda dialog: dialog.accept())

    # Click Drawer #2 (destination empty bin)
    page.locator('#map-drawer-grid-view .map-drawer-card[data-led="2"]').click()

    # Wait for banner to hide
    page.wait_for_selector('#map-move-banner', state='hidden')

    # Verify in DB that Mover Widget has been moved to bin 2
    item = db.get_item(item_id)
    assert '2' in str(item['position'])
    assert '1' not in str(item['position'])





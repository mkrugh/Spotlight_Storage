import time
import pytest
import db


def test_build_part_picker_click_selection(ui_page):
    """
    Verify that typing into the part picker search input opens the dropdown
    and clicking an item selects it, populating the input and updating the stock badge.
    """
    page = ui_page

    # Open Builds dialog
    page.click('#open-builds-btn')
    page.wait_for_selector('#new-build-btn', state='visible')

    # Open New Build modal
    page.click('#new-build-btn')
    page.wait_for_selector('#build-edit-modal', state='visible')

    # Add a part row
    page.click('#add-build-part-btn')
    page.wait_for_selector('.build-part-row', state='visible')

    search_input = page.locator('.build-part-search-input')
    assert search_input.get_attribute('role') == 'combobox'
    assert search_input.get_attribute('aria-expanded') == 'false'

    # Type search term
    search_input.fill('Resistor')
    page.wait_for_selector('.build-part-search-item', state='visible')
    assert search_input.get_attribute('aria-expanded') == 'true'

    # Click on the search item (verifying pointerdown/mousedown selection)
    page.click('.build-part-search-item')

    # Verify input is updated and dropdown closes
    assert 'Resistor 10k' in search_input.input_value()
    assert search_input.get_attribute('aria-expanded') == 'false'

    # Verify stock badge updated to in-stock
    badge = page.locator('.part-stock-badge')
    assert 'In Stock: 10' in badge.text_content()


def test_build_part_picker_zero_stock_selection(ui_page):
    """
    Verify that selecting a part with 0 stock does not crash the app,
    does not prematurely close the dialog, and updates the stock badge to indicate shortage.
    """
    page = ui_page

    page.click('#open-builds-btn')
    page.wait_for_selector('#new-build-btn', state='visible')
    page.click('#new-build-btn')
    page.wait_for_selector('#build-edit-modal', state='visible')

    # Add a part row
    page.click('#add-build-part-btn')
    page.wait_for_selector('.build-part-row', state='visible')

    search_input = page.locator('.build-part-search-input')
    search_input.fill('Capacitor')
    page.wait_for_selector('.build-part-search-item', state='visible')

    # Click the 0-stock capacitor
    page.click('.build-part-search-item')

    # Modal must remain open
    assert page.locator('#build-edit-modal').is_visible()

    # Stock badge must reflect shortage
    badge = page.locator('.part-stock-badge')
    assert 'In Stock: 0' in badge.text_content()
    assert 'Shortage' in badge.text_content()


def test_build_blank_part_row_pruning_on_save(ui_page):
    """
    Verify that completely blank part rows are pruned on save,
    allowing the build to save successfully without spurious validation errors.
    """
    page = ui_page

    page.click('#open-builds-btn')
    page.wait_for_selector('#new-build-btn', state='visible')
    page.click('#new-build-btn')
    page.wait_for_selector('#build-edit-modal', state='visible')

    # Row 1: Valid item
    page.click('#add-build-part-btn')
    page.wait_for_selector('.build-part-row', state='visible')
    row1_search = page.locator('.build-part-row').nth(0).locator('.build-part-search-input')
    row1_search.fill('ESP32')
    page.wait_for_selector('.build-part-search-item', state='visible')
    page.click('.build-part-search-item')

    # Row 2: Blank row (not touched)
    page.click('#add-build-part-btn')
    page.wait_for_function('document.querySelectorAll("#build-parts-list .build-part-row").length === 2')

    # Fill build name and save
    page.locator('#build-name-input').fill('Autonomous Sensor Node')
    page.click('#save-build-btn')

    # Verify build was saved in database
    time.sleep(0.5)
    builds = db.read_builds()
    assert len(builds) == 1
    assert builds[0]['name'] == 'Autonomous Sensor Node'

    # Verify only the valid item was saved, blank row was pruned
    items = db.get_build_items(builds[0]['id'])
    assert len(items) == 1
    assert items[0]['name'] == 'ESP32 DevKit'


def test_build_save_validation_rules(ui_page):
    """
    Verify validation rules:
    - Saving without a build name triggers a warning toast.
    - Saving with an unselected part row triggers a warning toast.
    """
    page = ui_page

    page.click('#open-builds-btn')
    page.wait_for_selector('#new-build-btn', state='visible')
    page.click('#new-build-btn')
    page.wait_for_selector('#build-edit-modal', state='visible')

    # Case 1: Try saving without build name
    page.click('#save-build-btn')
    page.wait_for_selector('#app-toast-container .toast', state='visible')
    toast_text = page.locator('#app-toast-container .toast').text_content()
    assert 'enter a build name' in toast_text.lower()

    # Case 2: Provide build name, but type unselected text into part row
    page.locator('#build-name-input').fill('Invalid Part Test')
    page.click('#add-build-part-btn')
    page.wait_for_selector('.build-part-row', state='visible')
    page.locator('.build-part-search-input').fill('NonExistentPartXYZ')

    page.click('#save-build-btn')
    page.wait_for_selector('#app-toast-container .toast', state='visible')
    toast_text = page.locator('#app-toast-container .toast').last.text_content()
    assert 'select a valid part' in toast_text.lower()

    # Ensure nothing was saved in DB
    builds = db.read_builds()
    assert len(builds) == 0


def test_toast_popover_layering_above_modal(ui_page):
    """
    Verify that the toast container operates as a popover ('popover=manual'),
    is promoted to the top layer, and renders visibly in the bottom-end corner
    even while an active modal dialog is displayed.
    """
    page = ui_page

    # Open modal dialog
    page.click('#open-builds-btn')
    page.wait_for_selector('#new-build-btn', state='visible')
    page.click('#new-build-btn')
    page.wait_for_selector('#build-edit-modal', state='visible')

    # Trigger a toast notification while modal is active
    page.evaluate("showToast('Top layer visibility check', 'info')")
    page.wait_for_selector('#app-toast-container .toast', state='visible')

    # Verify popover promotion and positioning
    info = page.evaluate("""() => {
        const container = document.getElementById('app-toast-container');
        const toast = container.querySelector('.toast');
        const cRect = container.getBoundingClientRect();
        const tRect = toast.getBoundingClientRect();
        return {
            isPopoverOpen: container.matches(':popover-open'),
            containerZIndex: window.getComputedStyle(container).zIndex,
            toastVisible: toast.checkVisibility ? toast.checkVisibility() : true,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            toastRect: { left: tRect.left, top: tRect.top, right: tRect.right, bottom: tRect.bottom }
        };
    }""")

    assert info['isPopoverOpen'] is True
    assert info['toastVisible'] is True
    assert int(info['containerZIndex']) >= 10000
    # Verify toast is rendered in the lower-right area of the viewport
    assert info['toastRect']['bottom'] <= info['windowHeight']
    assert info['toastRect']['right'] <= info['windowWidth']
    assert info['toastRect']['left'] > (info['windowWidth'] / 2)

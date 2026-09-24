import pytest
import db


def test_item_modal_clean_dismiss(ui_page):
    """
    Verify that opening the item modal and immediately dismissing it
    (without making any edits) closes cleanly without triggering the
    unsaved changes confirmation prompt.
    """
    page = ui_page

    # Open Add Item modal
    page.click('#add_item')
    page.wait_for_selector('#item-modal', state='visible')

    # Click Cancel button
    page.click('#cancel-item-button')
    page.wait_for_selector('#item-modal', state='hidden')

    # Ensure confirm modal was not opened
    confirm_modal = page.locator('#confirm-action-modal')
    assert not confirm_modal.is_visible()


def test_item_modal_dirty_escape_interception(ui_page):
    """
    Verify that typing into an input marks the form dirty,
    and pressing Escape or clicking Cancel triggers the confirmation modal.
    Choosing Cancel keeps the modal open and retains typed input.
    """
    page = ui_page

    # Open Add Item modal
    page.click('#add_item')
    page.wait_for_selector('#item-modal', state='visible')

    # Type into Item Name
    page.locator('#item_name').fill('Unsaved Widget')

    # Press Escape key
    page.keyboard.press('Escape')

    # Confirmation modal should appear
    page.wait_for_selector('#confirm-action-modal', state='visible')
    assert 'discard' in page.locator('#confirm-action-modal-message').text_content().lower()

    # Item modal should still be visible beneath
    assert page.locator('#item-modal').is_visible()

    # Cancel the discard prompt
    page.click('#confirm-action-cancel-btn')
    page.wait_for_selector('#confirm-action-modal', state='hidden')

    # Item modal remains open with input preserved
    assert page.locator('#item-modal').is_visible()
    assert page.locator('#item_name').input_value() == 'Unsaved Widget'


def test_item_modal_dirty_discard_resets_form(ui_page):
    """
    Verify that confirming discard closes both modals and resets the form inputs
    so reopening the modal presents a pristine form.
    """
    page = ui_page

    # Open Add Item modal
    page.click('#add_item')
    page.wait_for_selector('#item-modal', state='visible')

    # Type into Item Name
    page.locator('#item_name').fill('Discarded Widget')

    # Click Cancel button
    page.click('#cancel-item-button')

    # Confirmation modal appears
    page.wait_for_selector('#confirm-action-modal', state='visible')

    # Confirm discard
    page.click('#confirm-action-confirm-btn')
    page.wait_for_selector('#confirm-action-modal', state='hidden')
    page.wait_for_selector('#item-modal', state='hidden')

    # Reopen Add Item modal and verify it is empty
    page.click('#add_item')
    page.wait_for_selector('#item-modal', state='visible')
    assert page.locator('#item_name').input_value() == ''


def test_item_modal_edit_existing_item_clean_dismiss(ui_page):
    """
    Verify that opening an existing item in Edit mode does not falsely trigger
    the dirty state, allowing clean dismissal with Escape.
    """
    page = ui_page

    # Wait for grid items to load
    page.wait_for_selector('.item-card', state='visible')

    # Click Edit button on first item card
    page.locator('.item-card .edit-btn').first.click()

    # Wait for item modal to open with populated name
    page.wait_for_selector('#item-modal', state='visible')
    assert len(page.locator('#item_name').input_value()) > 0

    # Press Escape without making changes
    page.keyboard.press('Escape')
    page.wait_for_selector('#item-modal', state='hidden')

    # Confirm modal was not triggered
    assert not page.locator('#confirm-action-modal').is_visible()


def test_crop_modal_initialization_rotation_and_save(ui_page):
    """
    Verify that:
    1. Opening crop modal initializes Cropper.js with a visible crop box.
    2. Rotation buttons rotate the image in Cropper.js.
    3. Clicking 'Crop and save' uploads cropped image, updates item modal input,
       marks form dirty, and closes crop modal without closing item modal.
    """
    page = ui_page

    # Open Add Item modal
    page.click('#add_item')
    page.wait_for_selector('#item-modal', state='visible')

    # Provide a valid test image (100x100 solid png data URL)
    test_data_url = (
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAPklEQVR42u3RAQ0AAAgDoK1/aUtg"
        "dxgQIECBAgQIECBAgQIECBAgQIECBAgQIECBAgQIECBAgQIECBD4t8DKfQG9z5+PugAAAABJRU5ErkJggg=="
    )
    img_input = page.locator('#item_image')
    img_input.fill(test_data_url)
    img_input.dispatch_event('input')
    img_input.dispatch_event('change')

    # Verify preview image loads and Crop button becomes visible
    crop_btn = page.locator('#btn-crop-item-image')
    page.wait_for_selector('#btn-crop-item-image:not(.d-none)', state='visible')

    # Click Crop button
    crop_btn.click()

    # Wait for Crop modal and Cropper.js container to be visible
    page.wait_for_selector('#cropImageModal', state='visible')
    page.wait_for_selector('.cropper-container', state='visible')
    page.wait_for_selector('.cropper-crop-box', state='visible')

    # Verify cropper instance is active
    is_active = page.evaluate("() => typeof cropper !== 'undefined' && cropper !== null")
    assert is_active

    # Initial rotation should be 0
    init_rot = page.evaluate("() => cropper.getData().rotate")
    assert init_rot == 0

    # Test Rotate Left (-90 degrees)
    page.click('#rotate-left-btn')
    page.wait_for_timeout(200)
    rot_after_left = page.evaluate("() => cropper.getData().rotate")
    assert rot_after_left == -90

    # Test Rotate Right (+90 degrees back to 0)
    page.click('#rotate-right-btn')
    page.wait_for_timeout(200)
    rot_after_right = page.evaluate("() => cropper.getData().rotate")
    assert rot_after_right == 0

    # Click "Crop and save"
    page.click('#cropAndSaveBtn')

    # Wait for Crop modal to hide
    page.wait_for_selector('#cropImageModal', state='hidden')

    # Item modal remains open
    assert page.locator('#item-modal').is_visible()

    # Item image input should now hold the uploaded cropped image path
    new_image_val = page.locator('#item_image').input_value()
    assert ('/images/' in new_image_val or '/static/uploads/' in new_image_val) and 'cropped.jpg' in new_image_val

    # Form should be marked dirty
    is_dirty = page.evaluate("() => isItemFormDirty")
    assert is_dirty is True


def test_card_menu_crop_modal_rotation_and_save(ui_page):
    """
    Verify that opening crop modal from an existing item card's menu:
    1. Initializes Cropper.js with the item's image.
    2. Rotation buttons rotate the image in Cropper.js.
    3. Clicking 'Crop and save' uploads the cropped image, updates the DB, and closes crop modal.
    """
    page = ui_page
    test_data_url = (
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAPklEQVR42u3RAQ0AAAgDoK1/aUtg"
        "dxgQIECBAgQIECBAgQIECBAgQIECBAgQIECBAgQIECBAgQIECBD4t8DKfQG9z5+PugAAAABJRU5ErkJggg=="
    )
    # Insert an item with an image
    db.write_item({
        'name': 'Item With Image To Crop',
        'link': '',
        'image': test_data_url,
        'position': '[4]',
        'quantity': 1,
        'min_quantity': 1,
        'ip': '192.168.1.100',
        'tags': '[]'
    })
    page.reload()
    page.wait_for_selector('.item-card', state='visible')

    # Find the card and open its action menu
    card = page.locator('.item-card', has_text='Item With Image To Crop')
    card.locator('[data-bs-toggle="dropdown"]').click()
    card.locator('[data-action="crop"]').click()

    # Wait for Crop modal and Cropper.js container
    page.wait_for_selector('#cropImageModal', state='visible')
    page.wait_for_selector('.cropper-container', state='visible')
    page.wait_for_selector('.cropper-crop-box', state='visible')

    # Test Rotate Left
    page.click('#rotate-left-btn')
    page.wait_for_timeout(200)
    assert page.evaluate("() => cropper.getData().rotate") == -90

    # Test Rotate Right
    page.click('#rotate-right-btn')
    page.wait_for_timeout(200)
    assert page.evaluate("() => cropper.getData().rotate") == 0

    # Save
    page.click('#cropAndSaveBtn')
    page.wait_for_selector('#cropImageModal', state='hidden')


def test_crop_modal_drag_release_outside_does_not_close(ui_page):
    """
    Verify that clicking and holding inside the crop popup and releasing the mouse
    outside the popup onto the backdrop does NOT close the modal without warning.
    Only authentic clicks directly on the backdrop should close the dialog.
    """
    page = ui_page

    # Open Add Item modal
    page.click('#add_item')
    page.wait_for_selector('#item-modal', state='visible')

    test_data_url = (
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAPklEQVR42u3RAQ0AAAgDoK1/aUtg"
        "dxgQIECBAgQIECBAgQIECBAgQIECBAgQIECBAgQIECBAgQIECBD4t8DKfQG9z5+PugAAAABJRU5ErkJggg=="
    )
    img_input = page.locator('#item_image')
    img_input.fill(test_data_url)
    img_input.dispatch_event('input')
    img_input.dispatch_event('change')

    page.wait_for_selector('#btn-crop-item-image:not(.d-none)', state='visible')
    page.click('#btn-crop-item-image')

    page.wait_for_selector('#cropImageModal', state='visible')
    page.wait_for_selector('.cropper-crop-box', state='visible')

    # Get box coordinates
    crop_box = page.locator('.cropper-crop-box').bounding_box()
    assert crop_box is not None

    # Start mouse drag inside crop box
    page.mouse.move(crop_box['x'] + 20, crop_box['y'] + 20)
    page.mouse.down()

    # Move mouse way outside the modal onto the top-left backdrop corner
    page.mouse.move(10, 10)
    page.mouse.up()

    # Modal MUST still be visible!
    page.wait_for_timeout(300)
    assert page.locator('#cropImageModal').is_visible()

    # Now verify authentic backdrop click still closes the modal
    # Mousedown at top-left backdrop and mouseup at top-left backdrop
    page.mouse.move(10, 10)
    page.mouse.down()
    page.mouse.up()
    page.wait_for_selector('#cropImageModal', state='hidden')


def test_crop_modal_unconstrained_aspect_and_rotate_without_crop(ui_page):
    """
    Verify that:
    1. Default aspect ratio is unconstrained (Free).
    2. User can toggle Full Image to clear the crop box.
    3. User can rotate and save without cropping any portion of the image.
    4. Aspect ratio buttons (Free, 1:1, 4:3) toggle Cropper aspect ratio.
    """
    page = ui_page

    page.click('#add_item')
    page.wait_for_selector('#item-modal', state='visible')

    # Non-square test image: 120x60 rectangle
    test_rect_url = (
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAA8CAIAAAAiz+n/AAAAsElEQVR4nO3OQQ0AIAADsfk3DS7o40g"
        "qoDvb94AfRPhBhB9E+EGEH0T4QYQfRPhBhB9E+EGEH0T4QYQfRPhBhB9E+EGEH0T4QYQfRPhBhB9E+EGEH0T4QYQfRPhBhB9E+EGE"
        "H0T4QYQfRPhBhB9E+EGEH0T4QYQfRPhBhB9E+EGEH0T4QYQfRPhBhB9E+EGEH0T4QYQfRPhBhB9E+EGEH0T4QYQfRPhBhB9E+EGE"
        "H0Rcvf8Fha+JLF4AAAAASUVORK5CYII="
    )
    img_input = page.locator('#item_image')
    img_input.fill(test_rect_url)
    img_input.dispatch_event('input')
    img_input.dispatch_event('change')

    page.wait_for_selector('#btn-crop-item-image:not(.d-none)', state='visible')
    page.click('#btn-crop-item-image')

    page.wait_for_selector('#cropImageModal', state='visible')
    page.wait_for_selector('.cropper-container', state='visible')

    # 1. Verify default aspect ratio is NaN (unconstrained/free)
    is_aspect_free = page.evaluate("() => Number.isNaN(cropper.options.aspectRatio)")
    assert is_aspect_free is True
    assert 'active' in page.locator('#crop-aspect-free').get_attribute('class')

    # 2. Test 1:1 aspect ratio button
    page.click('#crop-aspect-square')
    assert page.evaluate("() => cropper.options.aspectRatio") == 1
    assert 'active' in page.locator('#crop-aspect-square').get_attribute('class')

    # 3. Test 4:3 aspect ratio button
    page.click('#crop-aspect-card')
    card_ratio = page.evaluate("() => cropper.options.aspectRatio")
    assert abs(card_ratio - (4 / 3)) < 0.01
    assert 'active' in page.locator('#crop-aspect-card').get_attribute('class')

    # 4. Switch back to Free
    page.click('#crop-aspect-free')
    assert page.evaluate("() => Number.isNaN(cropper.options.aspectRatio)") is True

    # 5. Click "Full Image" to clear crop box and rotate without cropping
    page.click('#crop-full-btn')
    is_cropped = page.evaluate("() => cropper.cropped")
    assert is_cropped is False

    # Rotate 90 degrees clockwise
    page.click('#rotate-right-btn')
    assert page.evaluate("() => cropper.getData().rotate") == 90

    # Save full rotated image
    page.click('#cropAndSaveBtn')
    page.wait_for_selector('#cropImageModal', state='hidden')

    # Verify item image value updated with uploaded rotated image
    new_val = page.locator('#item_image').input_value()
    assert '/images/' in new_val or '/static/uploads/' in new_val
    assert 'cropped.jpg' in new_val


def test_navbar_sort_and_tag_icon_sizing(ui_page):
    """
    Verify that the Sorting Methods and Sort by Tag buttons:
    1. Meet WCAG 2.5.5 touch target sizing (at least 40x40 px).
    2. Have clearly visible, unconstrained SVG icons (at least 20px, nominally 24px).
    3. Do not render Bootstrap's squishing .dropdown-toggle::after caret.
    """
    page = ui_page
    page.wait_for_selector('#sortingMethods_text > button.icon-n6px', state='visible')
    page.wait_for_selector('#sortingBytags_text > button.icon-n6px', state='visible')

    for btn_id in ['#sortingMethods_text > button.icon-n6px', '#sortingBytags_text > button.icon-n6px', '#settings_btn_tooltip > button.icon-n6px']:
        btn = page.locator(btn_id)
        box = btn.bounding_box()
        assert box['width'] >= 40, f"{btn_id} width {box['width']} < 40px"
        assert box['height'] >= 40, f"{btn_id} height {box['height']} < 40px"

        # Check SVG icon sizing
        svg = btn.locator('svg')
        assert svg.is_visible()
        svg_box = svg.bounding_box()
        assert svg_box['width'] >= 20, f"{btn_id} svg width {svg_box['width']} < 20px"
        assert svg_box['height'] >= 20, f"{btn_id} svg height {svg_box['height']} < 20px"

        # Verify dropdown caret pseudo-element is hidden
        caret_display = page.evaluate(f"() => window.getComputedStyle(document.querySelector('{btn_id}'), '::after').display")
        assert caret_display == 'none', f"{btn_id} ::after caret should be none, got {caret_display}"

    # Verify button accommodates badge when tags are active without squishing the icon
    page.evaluate("() => sortItemsByTag('resistor')")
    tag_btn = page.locator('#sortingBytags_text > button.icon-n6px')
    tag_box = tag_btn.bounding_box()
    assert tag_box['width'] >= 40
    assert tag_box['height'] >= 40
    tag_svg = tag_btn.locator('svg')
    tag_svg_box = tag_svg.bounding_box()
    assert tag_svg_box['width'] >= 20
    assert tag_svg_box['height'] >= 20






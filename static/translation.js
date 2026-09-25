// Fetch available languages from the server
function loadAvailableLanguages() {
    apiFetch('/api/translations')
        .then(languages => {
            const languageSelector = document.getElementById('language-selector');
            if (!languageSelector) return;
            languageSelector.innerHTML = ''; // Clear existing options

            // Add languages as options
            languages.forEach(lang => {
                const option = document.createElement('option');
                option.value = lang;
                option.textContent = lang.charAt(0).toUpperCase() + lang.slice(1); // Capitalize first letter
                if (lang === language) {
                    option.selected = true;
                }
                languageSelector.appendChild(option);
            });
            loadTranslation(language);
        })
        .catch(error => {
            console.error('Error loading languages:', error);
        });
}

function setTranslation(id, text, attr = 'textContent') {
    const el = document.getElementById(id);
    if (el && text !== undefined && text !== null) {
        if (attr === 'placeholder') {
            el.setAttribute('placeholder', text);
        } else if (attr === 'title') {
            el.setAttribute('title', text);
        } else {
            el[attr] = text;
        }
    }
}

window.currentTranslation = {};
const fallbackTranslations = {
    "cabinet_unconfigured": "Unconfigured",
    "cabinet_full": "Full",
    "cabinet_overcapacity": "Overcapacity",
    "cabinet_bins_metric": "{{occupied}}/{{total}} bins · {{percent}}% full",
    "cabinet_bins_overcapacity": "{{occupied}}/{{total}} bins · 100% full · Overcapacity",
    "cabinet_bins_full": "{{occupied}}/{{total}} bins · 100% full · Full",
    "assign_part_to_bin": "Assign Part to this Bin",
    "assigned_from_map": "Assigned from Map",
    "move_part": "Move Part",
    "cancel_move": "Cancel Move",
    "moving_part_banner": "Moving {{part}} (Bin #{{bin}}). Click target bin to place, or Cancel.",
    "confirm_move_title": "Move Part",
    "confirm_move_msg": "Move {{part}} to Bin {{bin}}?",
    "confirm_occupied_title": "Bin Occupied",
    "confirm_occupied_msg": "Bin {{bin}} currently contains {{target_part}}. What would you like to do?",
    "btn_swap_locations": "Swap Locations",
    "btn_colocate": "Add alongside (Co-locate)"
};

window.t = function(key, params) {
    let str = (window.currentTranslation && window.currentTranslation[key] !== undefined)
        ? window.currentTranslation[key]
        : (fallbackTranslations[key] !== undefined ? fallbackTranslations[key] : key);
    if (params && typeof params === 'object') {
        for (const [k, v] of Object.entries(params)) {
            str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
        }
    }
    return str;
};

// Load the translation file for the selected language
function loadTranslation(lang) {
    fetch(`/static/translations/${lang}.json`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(translation => {
            if (!translation) return;
            window.currentTranslation = translation;

            setTranslation('add_item', translation.add_item);
            setTranslation('search', translation.search, 'placeholder');

            // Translate Tooltips
            setTranslation('sortingMethods_text', translation.sortingMethods_text, 'title');
            setTranslation('sortingBytags_text', translation.sortingBytags_text, 'title');
            setTranslation('settings_btn_tooltip', translation.offcanvasSettingsLabel, 'title');
            setTranslation('plus-btn-inventur', translation.plus_btn_label, 'title');
            setTranslation('minus-btn-inventur', translation.minus_btn_label, 'title');
            setTranslation('edit-btn-inventur', translation.edit_btn_label, 'title');
            setTranslation('continue-btn-inventur', translation.continue_btn_label, 'title');

            const itemsContainer = document.getElementById('items-container-grid');
            if (itemsContainer) {
                const items = Array.from(itemsContainer.children);
                items.forEach(item => {
                    const itemId = item.dataset.id;
                    if (!itemId) return;

                    setTranslation(`copy_item_${itemId}`, translation.copy_item);
                    setTranslation(`delete_item_${itemId}`, translation.delete_item);
                    setTranslation(`crop_image_${itemId}`, translation.crop_image);

                    setTranslation(`plus-btn-${itemId}`, translation.plus_btn_label, 'title');
                    setTranslation(`minus-btn-${itemId}`, translation.minus_btn_label, 'title');
                    setTranslation(`locate-btn-${itemId}`, translation.locate_btn_label, 'title');
                    setTranslation(`edit-btn-${itemId}`, translation.edit_btn_label, 'title');
                });
            }

            // Bootstrap tooltips re-initialization
            document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (tooltipTriggerEl) {
                if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
                    bootstrap.Tooltip.getInstance(tooltipTriggerEl)?.dispose();
                    new bootstrap.Tooltip(tooltipTriggerEl);
                }
            });

            // Settings Page
            setTranslation('offcanvasSettingsLabel', translation.offcanvasSettingsLabel);
            setTranslation('on_btn_label', translation.on_btn_label);
            setTranslation('off_btn_label', translation.off_btn_label);
            setTranslation('party_btn_label', translation.party_btn_label);
            setTranslation('brightness-title', translation.settings_brightness);
            setTranslation('timeout-title', translation.settings_timeout);

            setTranslation('locate_led_color_label', translation.locate_led_color);
            setTranslation('standby_led_color_label', translation.standby_led_color);

            setTranslation('esp_devices_text', translation.esp_devices_text);
            setTranslation('add_esp_button', translation.add_esp_button);

            // Light & Dark Modes
            setTranslation('titile', translation.webinterface_label);
            setTranslation('light_mode_label', translation.light_mode_label);
            setTranslation('dark_mode_label', translation.dark_mode_label);
            setTranslation('auto_mode_label', translation.auto_mode_label);

            // Inventur Box
            setTranslation('inventur_btn_label', translation.inventur_btn_label);
            setTranslation('inventur_label', translation.inventur_btn_label);
            setTranslation('inventur_box_label', translation.inventur_btn_label);
            setTranslation('edit_inventur_btn_label', translation.edit_btn_label);
            setTranslation('continue_inventur_btn_label', translation.continue_btn_label);
            setTranslation('cancel_inventur_btn_label', translation.cancel_btn_label);
            setTranslation('save_inventur_btn_label', translation.save_btn_label);

            // Language Selector
            setTranslation('language_selector_label', translation.language_label);

            // Add Item Box
            setTranslation('item_name_label', translation.add_item);
            setTranslation('item-modal-label', translation.add_item);
            setTranslation('item_url_label', translation.item_url_label);
            setTranslation('item_quantity_label', translation.item_quantity_label);
            setTranslation('item_min_quantity_label', translation.item_min_quantity_label);
            setTranslation('item_imageUrl_label', translation.item_imageUrl_label);
            setTranslation('item_imageUplad_label', translation.item_imageUplad_label);
            setTranslation('item_tag_label', translation.item_tag_label);
            setTranslation('item_esp_select_label', translation.item_select_esp_label);
            setTranslation('test_led_btn_label', translation.test_led_btn_label);
            setTranslation('clear_grid_btn_label', translation.clear_grid_btn_label);
            setTranslation('item_select_leds_label', translation.item_select_leds_label);
            setTranslation('item_cancel_btn_label', translation.cancel_btn_label);
            setTranslation('item_add_btn_label', translation.add_btn_label);

            // Add ESP Box
            setTranslation('left_label', translation.left_label);
            setTranslation('right_label', translation.right_label);
            setTranslation('start_left_label', translation.start_left_label);
            setTranslation('top_label', translation.top_label);
            setTranslation('bottom_label', translation.bottom_label);
            setTranslation('start_top_label', translation.start_top_label);
            setTranslation('horizontal_label', translation.horizontal_label);
            setTranslation('vertical_label', translation.vertical_label);
            setTranslation('serpentine_dir_label', translation.serpentine_dir_label);
            setTranslation('esp-modal-label', translation.add_esp_label);
            setTranslation('esp_name_text', translation.esp_name_text);
            setTranslation('esp_ip_text', translation.esp_ip_text);
            setTranslation('esp_rows_text', translation.esp_rows_text);
            setTranslation('esp_columns_text', translation.esp_columns_text);
            setTranslation('cancel_esp_btn_label', translation.cancel_btn_label);

            setTranslation('cropAndSaveBtn', translation.cropAndSaveBtn);
            setTranslation('cropCancel', translation.cancel_btn_label);
            setTranslation('cropImageModalLabel', translation.cropImageModalLabel);
            setTranslation('espDeleteModalLabel', translation.espDeleteModalLabel);

            const setSortText = (id, text) => {
                const el = document.getElementById(id);
                if (!el || text === undefined || text === null) return;
                const label = el.querySelector('.sort-label');
                if (label) {
                    label.textContent = text;
                } else {
                    el.textContent = text;
                }
            };
            setSortText('sortBybox', translation.sortBybox);
            setSortText('sortByid', translation.sortByid);
            setSortText('sortByname', translation.sortByname);
            setSortText('sortByquantity', translation.sortByquantity);
            setSortText('sortBylocation', translation.sortBylocation);
            setTranslation('sortAsc_text', translation.sortAsc);
            setTranslation('sortDesc_text', translation.sortDesc);
        })
        .catch(error => {
            console.error('Error loading translation:', error);
        });
}

// Event listener for language selection
document.getElementById('language-selector')?.addEventListener('change', function() {
    language = this.value;
    loadTranslation(language);
    addSettings();
});

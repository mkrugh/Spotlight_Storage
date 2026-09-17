var myOffcanvas = document.getElementById('offcanvasSettings')
const timeoutRange = document.getElementById('settings_timeout');
const brightnessRange = document.getElementById('settings_brightness');
const scrollToTop = document.querySelectorAll('.scroll-to-top');
var language = "en";


// Function to update brightness output
function updateBrightnessOutput() {
    const brightnessSlider = document.getElementById("settings_brightness");
    document.getElementById('brightness-display').textContent = brightnessSlider.value + "%";
    addSettings(event);
}

function updateTimeoutOutput() {
    const timeoutSlider = document.getElementById("settings_timeout");
    if (timeoutSlider.value < 1) {
        document.getElementById('timeout-display').textContent = "Toggle";
    } else {
        const minutes = Math.floor(timeoutSlider.value / 60);
        const seconds = timeoutSlider.value % 60;

        document.getElementById('timeout-display').textContent = minutes + "m " + seconds + "s";
    }
    addSettings(event);
}

function addSettings(event) {
    //event.preventDefault();
    const brightness = document.getElementById("settings_brightness").value;
    const timeout = document.getElementById("settings_timeout").value;
    const colors = [
        document.getElementById("color-standby").value.toString(),
        document.getElementById("color-locate").value.toString()
    ];
    let lightMode;
    if (lightMode === undefined) {
        lightMode = "light"
    }
    if (language === undefined){
        language = "en"
    }
    const settings = {brightness, timeout, lightMode, colors, language};
    // Save the settings in the database using fetch
    fetch("/api/settings", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(settings),
    })
        .then((response) => response.json())
        .catch((error) => console.error(error));
}



function loadSettings() {
    // Fetch the settings from the server
    fetch("/api/settings", {
        method: "GET",
        headers: {"Content-Type": "application/json"},
    })
        .then((response) => response.json())
        .then((settings) => {
            // Update input fields with the retrieved settings
            document.getElementById("settings_brightness").value = settings.brightness;
            document.getElementById("settings_timeout").value = settings.timeout;
            const brightnessDisplay = document.getElementById('brightness-display');
            if (brightnessDisplay) brightnessDisplay.textContent = settings.brightness + "%";
            const timeoutDisplay = document.getElementById('timeout-display');
            if (timeoutDisplay) {
                if (settings.timeout < 1) {
                    timeoutDisplay.textContent = "Off";
                } else {
                    const mins = Math.floor(settings.timeout / 60);
                    const secs = settings.timeout % 60;
                    timeoutDisplay.textContent = mins + "m " + secs + "s";
                }
            }

            // Ensure colors is an array and update the color inputs
            const colors = Array.isArray(settings.colors) ? settings.colors : JSON.parse(settings.colors);
            const standbyColor = colors[0] || '#f0f0f0';
            const locateColor = colors[1] || '#00ff00';

            document.getElementById("color-standby").value = standbyColor;
            document.getElementById("color-locate").value = locateColor;
            updateColorDisplay('color-standby', 'picked-color-standby', 'preview-color-standby', standbyColor);
            updateColorDisplay('color-locate', 'picked-color-locate', 'preview-color-locate', locateColor);

            lightMode = settings.lightMode;
            language = settings.language;
            loadAvailableLanguages();
        })
        .catch((error) => console.error(error));
}

window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-bs-theme-value]')
        .forEach(toggle => {
            toggle.addEventListener('click', () => {
                let theme;
                theme = toggle.getAttribute('data-bs-theme-value');
                lightMode = theme;
                addSettings(event);
            })
        })
})

// Function to send a GET request based on the button pressed
function sendLedRequest(state) {
    const url = `/led/${state}`; // Replace with the actual endpoint
    fetch(url)
        .then((response) => {
        })
        .catch((error) => {
            console.error("Error:", error);
        });
}


scrollToTop.forEach(function (scrollToTop) {
    scrollToTop.addEventListener('click', function (e) {
        e.preventDefault();
        window.scroll({
            top: 0,
            left: 0,
            behavior: 'smooth'
        });
    });
});

// Color swatch synchronization and picker dismissal
function updateColorDisplay(inputId, spanId, previewId, colorValue) {
    const span = document.getElementById(spanId);
    if (span) span.textContent = colorValue;
    const preview = document.getElementById(previewId);
    if (preview) preview.style.backgroundColor = colorValue;
}

function updateColor(inputId, spanId, previewId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const color = input.value;
    updateColorDisplay(inputId, spanId, previewId, color);
    addSettings();
}

function dismissColorPickers() {
    const colorInputs = document.querySelectorAll('#offcanvasSettings input[type="color"]');
    colorInputs.forEach(input => {
        input.blur();
    });
}

const standbyColorInput = document.getElementById("color-standby");
const locateColorInput = document.getElementById("color-locate");

if (standbyColorInput) {
    standbyColorInput.addEventListener('focus', function () {
        if (locateColorInput) locateColorInput.blur();
    });
    standbyColorInput.addEventListener('input', function () {
        updateColorDisplay('color-standby', 'picked-color-standby', 'preview-color-standby', this.value);
    });
    standbyColorInput.addEventListener('change', function () {
        updateColor('color-standby', 'picked-color-standby', 'preview-color-standby');
        this.blur();
    });
}

if (locateColorInput) {
    locateColorInput.addEventListener('focus', function () {
        if (standbyColorInput) standbyColorInput.blur();
    });
    locateColorInput.addEventListener('input', function () {
        updateColorDisplay('color-locate', 'picked-color-locate', 'preview-color-locate', this.value);
    });
    locateColorInput.addEventListener('change', function () {
        updateColor('color-locate', 'picked-color-locate', 'preview-color-locate');
        this.blur();
    });
}

if (myOffcanvas) {
    myOffcanvas.addEventListener('hide.bs.offcanvas', dismissColorPickers);
    myOffcanvas.addEventListener('hidden.bs.offcanvas', dismissColorPickers);
}

// Dismiss color pickers when interacting with other settings or clicking outside color cards
document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest('.settings-color-card')) {
        dismissColorPickers();
    }
});

document.addEventListener('show.bs.modal', dismissColorPickers);




document.getElementById("on-button").addEventListener('click', () => {
    sendLedRequest('on')
});
document.getElementById("off-button").addEventListener('click', () => {
    sendLedRequest('off')
});
document.getElementById("party-button").addEventListener('click', () => {
    sendLedRequest('party')
});

brightnessRange.addEventListener('input', function () {
    document.getElementById('brightness-display').textContent = this.value + "%";
});
brightnessRange.addEventListener('change', function () {
    updateBrightnessOutput();
});


timeoutRange.addEventListener('input', function () {
    if (this.value < 1) {
        document.getElementById('timeout-display').textContent = "Off";
    } else {
        var minutes = Math.floor(this.value / 60);
        var seconds = this.value % 60;

        var timeString = minutes + "m " + seconds + "s";
        document.getElementById('timeout-display').textContent = timeString;
    }
});
timeoutRange.addEventListener('change', function () {
    updateTimeoutOutput();
});

myOffcanvas.addEventListener('show.bs.offcanvas', function () {
    updateBrightnessOutput();
    updateTimeoutOutput();
    populateEspTable();
})

let currentnventurItemIndex = 0; // Keep track of the current item index

const inventurModalElement = document.getElementById('inventur-modal');
if (inventurModalElement) {
    inventurModalElement.addEventListener('hide.bs.modal', function () {
        const amount = document.getElementById('current-item-amount');
        if (amount && document.activeElement === amount) {
            amount.blur();
        }
    });
    inventurModalElement.addEventListener('hidden.bs.modal', function () {
        currentnventurItemIndex = 0;
    });
}

document.getElementById('cancel-inventur-button')?.addEventListener('click', function () {
    currentnventurItemIndex = 0;
});

document.getElementById("inventur").addEventListener("click", function () {
    const edit_btn = document.getElementById('edit-btn-inventur');
    const continue_btn = document.getElementById('continue-btn-inventur');
    const text = document.getElementById('current-item-text');
    const img = document.getElementById('current-item-img');
    const amount = document.getElementById('current-item-amount');
    const minus_btn = document.getElementById('minus-btn-inventur');
    const plus_btn = document.getElementById('plus-btn-inventur');
    // Create an array of objects containing ids and names
    const itemsData = fetchedItems;
    // Function to display current item
    const confirmationModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('inventur-modal'));
    confirmationModal.show();

    function setAmountDisplay(qty) {
        if (!amount) return;
        if ('value' in amount) {
            amount.value = qty;
        } else {
            amount.textContent = qty;
        }
    }

    function savePendingInput() {
        if (!itemsData || itemsData.length === 0 || !amount || !('value' in amount)) return;
        const currentItem = itemsData[currentnventurItemIndex];
        if (currentItem) {
            let val = parseInt(amount.value, 10);
            if (isNaN(val) || val < 0) {
                val = 0;
                amount.value = 0;
            }
            if (val !== currentItem.quantity) {
                handleQuantitySet(currentItem, val);
            }
        }
    }

    function displayItem(index) {
        const progressText = document.getElementById('inventur-progress-text');
        const progressBar = document.getElementById('inventur-progress-bar');
        const placeholder = document.getElementById('inventur-placeholder');

        if (!itemsData || itemsData.length === 0) {
            text.textContent = "No items available";
            setAmountDisplay(0);
            img.src = "";
            img.classList.add('d-none');
            if (placeholder) placeholder.classList.remove('d-none');
            if (progressText) progressText.textContent = 'Item 0 of 0';
            if (progressBar) {
                progressBar.style.width = '0%';
                progressBar.setAttribute('aria-valuenow', 0);
            }
            return;
        }

        const currentItem = itemsData[index];
        if (!currentItem) return;

        if (progressText) progressText.textContent = `Item ${index + 1} of ${itemsData.length}`;
        if (progressBar) {
            const percent = Math.round(((index + 1) / itemsData.length) * 100);
            progressBar.style.width = `${percent}%`;
            progressBar.setAttribute('aria-valuenow', percent);
        }

        text.textContent = currentItem.name;
        setAmountDisplay(currentItem.quantity);

        if (currentItem.image && currentItem.image.trim() !== '') {
            img.onload = function () {
                img.classList.remove('d-none');
                if (placeholder) placeholder.classList.add('d-none');
            };
            img.onerror = function () {
                img.classList.add('d-none');
                if (placeholder) placeholder.classList.remove('d-none');
            };
            img.src = currentItem.image;
        } else {
            img.src = '';
            img.classList.add('d-none');
            if (placeholder) placeholder.classList.remove('d-none');
        }

        if (window.lucide) {
            lucide.createIcons();
        }

        fetch(`/api/items/${currentItem.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ action: "locate" }),
        }).catch((error) => console.error(error));
    }

    // Display the first item
    displayItem(currentnventurItemIndex);

    minus_btn.onclick = function () {
        if (!itemsData || itemsData.length === 0) return;
        const currentItem = itemsData[currentnventurItemIndex];
        if (currentItem) {
            handleQuantityChange(currentItem, -1);
            setAmountDisplay(currentItem.quantity);
        }
    };

    plus_btn.onclick = function () {
        if (!itemsData || itemsData.length === 0) return;
        const currentItem = itemsData[currentnventurItemIndex];
        if (currentItem) {
            handleQuantityChange(currentItem, 1);
            setAmountDisplay(currentItem.quantity);
        }
    };

    if (amount && 'value' in amount) {
        amount.onchange = function () {
            savePendingInput();
        };

        amount.onkeydown = function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                amount.blur();
            }
        };
    }

    document.getElementById('save-inventur-button')?.addEventListener('click', function () {
        savePendingInput();
    });

    edit_btn.onclick = function () {
        if (!itemsData || itemsData.length === 0) return;
        savePendingInput();
        const currentItem = itemsData[currentnventurItemIndex];
        if (!currentItem) return;
        isEditingItem = true;
        console.log("editing item");
        removeLocalStorage();

        $("#item-modal").modal("show");
        confirmationModal.hide();
        document.getElementById("item_name").value = currentItem.name;
        document.getElementById("item_url").value = currentItem.link;
        document.getElementById("item_image").value = currentItem.image;
        document.getElementById("item_quantity").value = currentItem.quantity;
        const minQtyEl = document.getElementById("item_min_quantity");
        if (minQtyEl) {
            minQtyEl.value = (currentItem.min_quantity !== undefined && currentItem.min_quantity !== null) ? currentItem.min_quantity : 3;
        }
        if (typeof updateItemImagePreview === 'function') {
            updateItemImagePreview(currentItem.image);
        }

        // Set LED positions for editing
        const parsedPos = (typeof parsePositionsArray === 'function')
            ? parsePositionsArray(currentItem.position)
            : (Array.isArray(currentItem.position) ? currentItem.position : JSON.parse(currentItem.position || '[]'));
        localStorage.setItem('led_positions', JSON.stringify(parsedPos));
        clickedCells = [...parsedPos];
        localStorage.setItem('edit_led_positions', JSON.stringify(parsedPos));
        localStorage.setItem('edit_image_path', JSON.stringify(currentItem.image || ''));

        // Set item tags for editing
        if (currentItem.tags) {
            const cleanedTags = currentItem.tags.replace(/[\[\]'"`\\]/g, '');
            const itemTagsArray = cleanedTags.split(',');
            localStorage.setItem('item_tags', JSON.stringify(itemTagsArray));
            tags = itemTagsArray;
            loadTagsIntoTagify();
        }

        // Set editing item ID and IP
        editingItemId = currentItem.id;
        editingItemIP = currentItem.ip;
    };

    // Handle the "continue" button click
    continue_btn.onclick = function () {
        if (!itemsData || itemsData.length === 0) return;
        savePendingInput();
        console.log("Continue clicked for item with ID: " + itemsData[currentnventurItemIndex].id);
        currentnventurItemIndex++; // Move to the next item
        if (currentnventurItemIndex < itemsData.length) {
            // Display the next item if there's any left
            displayItem(currentnventurItemIndex);
        } else {
            console.log("End of items reached.");
            currentnventurItemIndex = 0; // Reset to the beginning
            displayItem(currentnventurItemIndex); // Display the first item again
        }
    };
});



document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    populateEspTable();
});

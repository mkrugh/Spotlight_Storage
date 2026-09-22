var myOffcanvas = document.getElementById('offcanvasSettings')
const timeoutRange = document.getElementById('settings_timeout');
const brightnessRange = document.getElementById('settings_brightness');
const scrollToTop = document.querySelectorAll('.scroll-to-top');
var language = "en";
var lightMode = "light";


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

function setStandbyCardVisualState(enabled) {
    const card = document.getElementById('color-card-standby');
    const preview = document.getElementById('preview-color-standby');
    const hex = document.getElementById('picked-color-standby');
    if (!card) return;
    if (enabled) {
        card.style.opacity = '1';
        if (preview) preview.style.opacity = '1';
        if (hex) hex.style.opacity = '1';
    } else {
        card.style.opacity = '0.65';
        if (preview) preview.style.opacity = '0.3';
        if (hex) hex.style.opacity = '0.5';
    }
}

function handleStandbyToggleChange(e) {
    const isChecked = e ? e.target.checked : true;
    const standbyInput = document.getElementById("color-standby");
    if (isChecked) {
        const savedColor = localStorage.getItem('standby_custom_color') || (standbyInput && standbyInput.value !== '#000000' ? standbyInput.value : '#f0f0f0');
        if (standbyInput) standbyInput.value = savedColor;
        updateColorDisplay('color-standby', 'picked-color-standby', 'preview-color-standby', savedColor);
        setStandbyCardVisualState(true);
        localStorage.setItem('standby_light_enabled', 'true');
    } else {
        if (standbyInput && standbyInput.value && standbyInput.value !== '#000000') {
            localStorage.setItem('standby_custom_color', standbyInput.value);
        }
        setStandbyCardVisualState(false);
        localStorage.setItem('standby_light_enabled', 'false');
    }
    addSettings();
}

function addSettings(event) {
    //event.preventDefault();
    const brightness = document.getElementById("settings_brightness").value;
    const timeout = document.getElementById("settings_timeout").value;
    const standbyToggle = document.getElementById("toggle-standby-light");
    const isStandbyEnabled = standbyToggle ? standbyToggle.checked : true;

    let standbyColorVal = document.getElementById("color-standby").value.toString();
    if (!isStandbyEnabled) {
        standbyColorVal = "#000000";
    }

    const colors = [
        standbyColorVal,
        document.getElementById("color-locate").value.toString()
    ];
    if (typeof lightMode === 'undefined' || !lightMode) {
        lightMode = "light";
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

            const standbyToggle = document.getElementById("toggle-standby-light");
            const isSavedDisabled = localStorage.getItem('standby_light_enabled') === 'false';
            if (standbyColor.toLowerCase() === '#000000' || isSavedDisabled) {
                if (standbyToggle) standbyToggle.checked = false;
                const savedCustom = localStorage.getItem('standby_custom_color') || '#f0f0f0';
                document.getElementById("color-standby").value = savedCustom;
                updateColorDisplay('color-standby', 'picked-color-standby', 'preview-color-standby', savedCustom);
                setStandbyCardVisualState(false);
            } else {
                if (standbyToggle) standbyToggle.checked = true;
                localStorage.setItem('standby_custom_color', standbyColor);
                localStorage.setItem('standby_light_enabled', 'true');
                document.getElementById("color-standby").value = standbyColor;
                updateColorDisplay('color-standby', 'picked-color-standby', 'preview-color-standby', standbyColor);
                setStandbyCardVisualState(true);
            }

            document.getElementById("color-locate").value = locateColor;
            updateColorDisplay('color-locate', 'picked-color-locate', 'preview-color-locate', locateColor);

            lightMode = settings.lightMode;
            if (typeof window.setAppTheme === 'function') {
                window.setAppTheme(settings.lightMode || 'auto');
            } else if (settings.lightMode) {
                const targetTheme = (settings.lightMode === 'auto')
                    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : settings.lightMode;
                document.documentElement.setAttribute('data-bs-theme', targetTheme);
                document.documentElement.style.colorScheme = targetTheme;
            }
            language = settings.language;
            loadAvailableLanguages();
        })
        .catch((error) => console.error(error));
}

window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-bs-theme-value]')
        .forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                const theme = toggle.getAttribute('data-bs-theme-value');
                lightMode = theme;
                if (typeof window.setAppTheme === 'function') {
                    window.setAppTheme(theme);
                }
                addSettings(e);
            });
        });

    const standbyToggle = document.getElementById("toggle-standby-light");
    if (standbyToggle) {
        standbyToggle.addEventListener("change", handleStandbyToggleChange);
    }
});

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

// Color swatch synchronization and custom in-page color picker
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

// Color conversion utilities
function hexToRgb(hex) {
    hex = String(hex || '').replace('#', '').trim();
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const num = parseInt(hex, 16);
    return isNaN(num) ? [0, 255, 0] : [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r, g, b) {
    const toHex = c => ('0' + Math.max(0, Math.min(255, Math.round(c))).toString(16)).slice(-2);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) {
        h = 0;
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h * 360, s, v];
}

function hsvToRgb(h, s, v) {
    h = (h % 360) / 360;
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Custom In-Page Color Picker Controller
let activeColorTarget = null; // 'locate' or 'standby'
let currentHsv = { h: 120, s: 1, v: 1 };
let isDraggingSatVal = false;

const LED_PRESET_COLORS = [
    '#00ff00', '#ff0000', '#0000ff', '#00ffff', '#ff00ff', '#ffff00',
    '#ff7700', '#ffaa00', '#88ff00', '#8800ff', '#ffffff', '#ffeedd'
];

function drawSatValCanvas() {
    const canvas = document.getElementById('picker-sat-val-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = `hsl(${currentHsv.h}, 100%, 50%)`;
    ctx.fillRect(0, 0, w, h);

    const whiteGrad = ctx.createLinearGradient(0, 0, w, 0);
    whiteGrad.addColorStop(0, '#ffffff');
    whiteGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = whiteGrad;
    ctx.fillRect(0, 0, w, h);

    const blackGrad = ctx.createLinearGradient(0, 0, 0, h);
    blackGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    blackGrad.addColorStop(1, '#000000');
    ctx.fillStyle = blackGrad;
    ctx.fillRect(0, 0, w, h);
}

function updateSatValCursor() {
    const cursor = document.getElementById('picker-sat-val-cursor');
    if (!cursor) return;
    cursor.style.left = `${currentHsv.s * 100}%`;
    cursor.style.top = `${(1 - currentHsv.v) * 100}%`;
}

function applyCustomColor(hex, commit = false) {
    hex = hex.toUpperCase();
    const hexInput = document.getElementById('picker-hex-input');
    if (hexInput && document.activeElement !== hexInput) {
        hexInput.value = hex.replace('#', '');
    }
    const bubble = document.getElementById('picker-preview-bubble');
    if (bubble) bubble.style.backgroundColor = hex;

    if (activeColorTarget) {
        if (activeColorTarget === 'standby') {
            const standbyToggle = document.getElementById("toggle-standby-light");
            if (standbyToggle && !standbyToggle.checked) {
                standbyToggle.checked = true;
                setStandbyCardVisualState(true);
                localStorage.setItem('standby_light_enabled', 'true');
            }
            localStorage.setItem('standby_custom_color', hex);
        }
        const inputId = `color-${activeColorTarget}`;
        const spanId = `picked-color-${activeColorTarget}`;
        const previewId = `preview-color-${activeColorTarget}`;
        const input = document.getElementById(inputId);
        if (input) input.value = hex;
        updateColorDisplay(inputId, spanId, previewId, hex);
        if (commit) {
            addSettings();
        }
    }
}

function updateFromSatValEvent(e) {
    const container = document.getElementById('picker-sat-val-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    currentHsv.s = x / rect.width;
    currentHsv.v = 1 - (y / rect.height);
    updateSatValCursor();
    const [r, g, b] = hsvToRgb(currentHsv.h, currentHsv.s, currentHsv.v);
    const hex = rgbToHex(r, g, b);
    applyCustomColor(hex, false);
}

function setupPresetSwatches() {
    const container = document.getElementById('picker-presets');
    if (!container || container.children.length > 0) return;
    LED_PRESET_COLORS.forEach(color => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'picker-preset-swatch';
        swatch.style.backgroundColor = color;
        swatch.title = color;
        swatch.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const [r, g, b] = hexToRgb(color);
            const [h, s, v] = rgbToHsv(r, g, b);
            currentHsv = { h, s, v };
            const hueSlider = document.getElementById('picker-hue-slider');
            if (hueSlider) hueSlider.value = Math.round(h);
            drawSatValCanvas();
            updateSatValCursor();
            applyCustomColor(color, true);
        });
        container.appendChild(swatch);
    });
}

function openCustomColorPicker(target, cardElement) {
    activeColorTarget = target;
    const popover = document.getElementById('custom-color-picker-popover');
    if (!popover || !cardElement) return;

    setupPresetSwatches();

    const titleEl = document.getElementById('popover-target-title');
    if (titleEl) {
        titleEl.textContent = target === 'locate' ? 'Locate LED Color' : 'Standby LED Color';
    }

    const currentHex = document.getElementById(`color-${target}`)?.value || (target === 'locate' ? '#00ff00' : '#f0f0f0');
    const [r, g, b] = hexToRgb(currentHex);
    const [h, s, v] = rgbToHsv(r, g, b);
    currentHsv = { h, s, v };

    const hueSlider = document.getElementById('picker-hue-slider');
    if (hueSlider) hueSlider.value = Math.round(h);

    drawSatValCanvas();
    updateSatValCursor();
    applyCustomColor(currentHex, false);

    const offcanvasBody = cardElement.closest('.offcanvas-body');
    if (offcanvasBody) {
        const cardRect = cardElement.getBoundingClientRect();
        const bodyRect = offcanvasBody.getBoundingClientRect();
        const top = (cardRect.bottom - bodyRect.top + offcanvasBody.scrollTop + 6);
        popover.style.top = `${top}px`;
        popover.style.left = '1rem';
        popover.style.right = '1rem';
        popover.style.width = 'auto';
    }

    popover.classList.remove('d-none');
}

function dismissColorPickers() {
    const popover = document.getElementById('custom-color-picker-popover');
    if (popover && !popover.classList.contains('d-none')) {
        popover.classList.add('d-none');
        if (activeColorTarget) {
            addSettings();
            activeColorTarget = null;
        }
    }
}

// Bind custom color picker events
document.addEventListener('DOMContentLoaded', () => {
    const locateCard = document.getElementById('color-card-locate');
    if (locateCard) {
        locateCard.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (activeColorTarget === 'locate') {
                dismissColorPickers();
            } else {
                openCustomColorPicker('locate', locateCard);
            }
        });
        locateCard.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                locateCard.click();
            }
        });
    }

    const standbyCard = document.getElementById('color-card-standby');
    if (standbyCard) {
        standbyCard.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (activeColorTarget === 'standby') {
                dismissColorPickers();
            } else {
                openCustomColorPicker('standby', standbyCard);
            }
        });
        standbyCard.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                standbyCard.click();
            }
        });
    }

    const satValContainer = document.getElementById('picker-sat-val-container');
    if (satValContainer) {
        satValContainer.addEventListener('pointerdown', (e) => {
            isDraggingSatVal = true;
            satValContainer.setPointerCapture(e.pointerId);
            updateFromSatValEvent(e);
        });
        satValContainer.addEventListener('pointermove', (e) => {
            if (isDraggingSatVal) {
                updateFromSatValEvent(e);
            }
        });
        const stopDrag = (e) => {
            if (isDraggingSatVal) {
                isDraggingSatVal = false;
                try { satValContainer.releasePointerCapture(e.pointerId); } catch (err) {}
                const [r, g, b] = hsvToRgb(currentHsv.h, currentHsv.s, currentHsv.v);
                applyCustomColor(rgbToHex(r, g, b), true);
            }
        };
        satValContainer.addEventListener('pointerup', stopDrag);
        satValContainer.addEventListener('pointercancel', stopDrag);
    }

    const hueSlider = document.getElementById('picker-hue-slider');
    if (hueSlider) {
        hueSlider.addEventListener('input', (e) => {
            currentHsv.h = parseFloat(e.target.value);
            drawSatValCanvas();
            const [r, g, b] = hsvToRgb(currentHsv.h, currentHsv.s, currentHsv.v);
            applyCustomColor(rgbToHex(r, g, b), false);
        });
        hueSlider.addEventListener('change', () => {
            const [r, g, b] = hsvToRgb(currentHsv.h, currentHsv.s, currentHsv.v);
            applyCustomColor(rgbToHex(r, g, b), true);
        });
    }

    const hexInput = document.getElementById('picker-hex-input');
    if (hexInput) {
        hexInput.addEventListener('input', (e) => {
            const clean = e.target.value.replace(/[^0-9a-fA-F]/g, '');
            if (clean.length === 6) {
                const hex = '#' + clean;
                const [r, g, b] = hexToRgb(hex);
                const [h, s, v] = rgbToHsv(r, g, b);
                currentHsv = { h, s, v };
                const slider = document.getElementById('picker-hue-slider');
                if (slider) slider.value = Math.round(h);
                drawSatValCanvas();
                updateSatValCursor();
                applyCustomColor(hex, true);
            }
        });
    }

    const doneBtn = document.getElementById('picker-done-btn');
    if (doneBtn) {
        doneBtn.addEventListener('click', dismissColorPickers);
    }

    const closeBtn = document.getElementById('popover-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', dismissColorPickers);
    }
});

if (myOffcanvas) {
    myOffcanvas.addEventListener('hide.bs.offcanvas', dismissColorPickers);
    myOffcanvas.addEventListener('hidden.bs.offcanvas', dismissColorPickers);
}

// Dismiss color picker when clicking outside
document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest('#custom-color-picker-popover') && !e.target.closest('.settings-color-card')) {
        dismissColorPickers();
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
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
    const confirmationModal = { show: () => DialogManager.open('inventur-modal'), hide: () => DialogManager.close('inventur-modal') };
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

        if (typeof resetModal === 'function') {
            resetModal(true);
        }
        isEditingItem = true;
        isCopyingItem = false;
        editingItemId = currentItem.id;
        editingItemIP = currentItem.ip;

        const modalLabel = document.getElementById("item-modal-label");
        if (modalLabel) modalLabel.textContent = (typeof translation !== 'undefined' && translation.edit_btn_label) ? translation.edit_btn_label : "Edit Item";
        const saveBtnLabel = document.getElementById("item_add_btn_label");
        if (saveBtnLabel) saveBtnLabel.textContent = (typeof translation !== 'undefined' && translation.save_btn_label) ? translation.save_btn_label : "Save";

        confirmationModal.hide();
        document.getElementById("item_name").value = currentItem.name || "";
        document.getElementById("item_url").value = currentItem.link || "";
        document.getElementById("item_image").value = currentItem.image || "";
        document.getElementById("item_quantity").value = currentItem.quantity;
        const minQtyEl = document.getElementById("item_min_quantity");
        if (minQtyEl) {
            minQtyEl.value = (currentItem.min_quantity !== undefined && currentItem.min_quantity !== null) ? currentItem.min_quantity : 3;
        }
        if (typeof updateItemImagePreview === 'function') {
            updateItemImagePreview(currentItem.image || '');
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
        let itemTagsArray = [];
        if (currentItem.tags) {
            try {
                const parsed = JSON.parse(currentItem.tags);
                if (Array.isArray(parsed)) itemTagsArray = parsed;
                else if (typeof parsed === 'string') itemTagsArray = [parsed];
            } catch (e) {
                const cleanedTags = currentItem.tags.replace(/[\[\]'"`\\]/g, '');
                itemTagsArray = cleanedTags.split(',').map(t => t.trim()).filter(Boolean);
            }
        }
        localStorage.setItem('item_tags', JSON.stringify(itemTagsArray));
        if (typeof loadTagsIntoTagify === 'function') {
            loadTagsIntoTagify(itemTagsArray);
        }

        DialogManager.open('item-modal');
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

/**
 * Check vendored frontend libraries for available updates.
 * Called by the "Check for Updates" button in settings.
 */
async function checkVendorUpdates() {
    const btn = document.getElementById('check-vendor-updates-btn');
    const resultsDiv = document.getElementById('vendor-update-results');
    const tbody = document.getElementById('vendor-update-tbody');
    const hint = document.getElementById('vendor-update-hint');

    if (!btn || !resultsDiv || !tbody || !hint) return;

    // Show loading state
    btn.disabled = true;
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Checking...';

    try {
        const response = await fetch('/api/vendor/check-updates');
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        const data = await response.json();

        // Clear previous results
        tbody.innerHTML = '';

        const statusBadge = {
            'current': '<span class="badge bg-success">Current</span>',
            'outdated': '<span class="badge bg-warning text-dark">Update Available</span>',
            'error': '<span class="badge bg-danger">Error</span>',
            'unknown': '<span class="badge bg-secondary">Unknown</span>'
        };

        (data.libraries || []).forEach(function(lib) {
            const row = document.createElement('tr');
            const escapedName = lib.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const escapedCurrent = lib.current.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const escapedLatest = lib.latest.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            row.innerHTML =
                '<td>' + escapedName + '</td>' +
                '<td><code>' + escapedCurrent + '</code></td>' +
                '<td><code>' + escapedLatest + '</code></td>' +
                '<td>' + (statusBadge[lib.status] || lib.status) + '</td>';
            tbody.appendChild(row);
        });

        if (data.has_updates) {
            hint.textContent = 'Run: python scripts/update_vendor.py --update';
            hint.classList.remove('text-muted');
            hint.classList.add('text-warning');
        } else {
            hint.textContent = 'All libraries are up to date.';
            hint.classList.remove('text-warning');
            hint.classList.add('text-muted');
        }

        resultsDiv.classList.remove('d-none');
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast('Failed to check for updates: ' + err.message, 'danger');
        }
        console.error('Vendor update check failed:', err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
        // Re-initialize lucide icons for the button icon
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    populateEspTable();

    // Wire up vendor update check button
    const vendorBtn = document.getElementById('check-vendor-updates-btn');
    if (vendorBtn) {
        vendorBtn.addEventListener('click', checkVendorUpdates);
    }
});

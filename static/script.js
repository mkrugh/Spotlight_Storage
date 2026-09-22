const selectEspDropdown = document.getElementById("item_esp_select");
let fetchedItems = []; // Define an array to store fetched items
let fetchedEsps = []; // Store fetched ESP devices

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Only allow http(s) and relative URLs in generated HTML (blocks javascript: etc.)
function safeUrl(url) {
    const str = String(url ?? '').trim();
    if (/^https?:\/\//i.test(str) || !str.includes(':')) {
        return escapeHtml(str);
    }
    return '#';
}

// Format external URLs for items so they open external websites rather than localhost relative paths
function formatItemLink(url) {
    if (!url) return null;
    let str = String(url).trim();
    if (!str || str === '#' || str === 'undefined' || str === 'null') return null;

    // Disallow dangerous schemes (javascript:, vbscript:, data:)
    if (/^(javascript|data|vbscript):/i.test(str)) {
        return null;
    }

    // Standard absolute web protocols
    if (/^https?:\/\//i.test(str)) {
        return escapeHtml(str);
    }

    // Protocol-relative URLs
    if (str.startsWith('//')) {
        return escapeHtml('https:' + str);
    }

    // If it looks like a domain name or URL (e.g. www.amazon.com, digikey.com/product/123)
    if (str.includes('.') && !str.includes(' ')) {
        return escapeHtml('https://' + str);
    }

    return null;
}
let isEditingItem = false;
let isCopyingItem = false;
let editingItemId = null; // Track the ID of the item being edited
let editingItemIP = null; // Track the IP of the item being edited

// UI-13: Toast Notification System
function showToast(message, type = 'info', title = null, duration = 3500) {
    const container = document.getElementById('app-toast-container');
    if (!container) return;

    let iconHtml = '';
    let borderCls = '';
    switch (type) {
        case 'success':
            iconHtml = '<i data-lucide="check-circle" class="text-success flex-shrink-0" style="width: 18px; height: 18px;"></i>';
            borderCls = 'border-success-subtle';
            break;
        case 'danger':
        case 'error':
            iconHtml = '<i data-lucide="alert-circle" class="text-danger flex-shrink-0" style="width: 18px; height: 18px;"></i>';
            borderCls = 'border-danger-subtle';
            break;
        case 'warning':
            iconHtml = '<i data-lucide="alert-triangle" class="text-warning flex-shrink-0" style="width: 18px; height: 18px;"></i>';
            borderCls = 'border-warning-subtle';
            break;
        default:
            iconHtml = '<i data-lucide="info" class="text-primary flex-shrink-0" style="width: 18px; height: 18px;"></i>';
            borderCls = 'border-primary-subtle';
            break;
    }

    const toastEl = document.createElement('div');
    toastEl.className = `toast app-toast ${borderCls} show fade align-items-center mb-2`;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');

    if (title) {
        toastEl.innerHTML = `
            <div class="toast-header d-flex align-items-center justify-content-between">
                <div class="d-flex align-items-center gap-2">
                    ${iconHtml}
                    <strong class="me-auto small">${escapeHtml(title)}</strong>
                </div>
                <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body small text-body">${message}</div>
        `;
    } else {
        toastEl.innerHTML = `
            <div class="app-toast-content">
                <div class="d-flex align-items-center flex-shrink-0">${iconHtml}</div>
                <div class="toast-body small flex-grow-1 text-body">${message}</div>
                <button type="button" class="btn-close btn-close-sm flex-shrink-0" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;
    }

    container.appendChild(toastEl);
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons({ root: toastEl });
    }

    const toast = new bootstrap.Toast(toastEl, { delay: duration, autohide: true });
    toast.show();

    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}

// UI-13: Reusable Themed Confirmation Modal (Promise-based)
function showConfirmModal({ title = 'Confirm Action', message = 'Are you sure?', confirmText = 'Confirm', confirmBtnClass = 'btn-danger' } = {}) {
    return new Promise((resolve) => {
        const modalEl = document.getElementById('confirm-action-modal');
        if (!modalEl) {
            resolve(window.confirm(message));
            return;
        }

        const titleEl = document.getElementById('confirm-action-modal-label');
        const messageEl = document.getElementById('confirm-action-modal-message');
        const confirmBtn = document.getElementById('confirm-action-confirm-btn');

        if (titleEl) titleEl.textContent = title;
        if (messageEl) messageEl.textContent = message;
        if (confirmBtn) {
            confirmBtn.textContent = confirmText;
            confirmBtn.className = `btn btn-sm ${confirmBtnClass}`;
        }

        const modal = { show: () => DialogManager.open(modalEl.id), hide: () => DialogManager.close(modalEl.id) };
        let resolved = false;

        const handleConfirm = () => {
            resolved = true;
            modal.hide();
            cleanup();
            resolve(true);
        };

        const handleHidden = () => {
            cleanup();
            if (!resolved) resolve(false);
        };

        const cleanup = () => {
            confirmBtn?.removeEventListener('click', handleConfirm);
            modalEl.removeEventListener('hidden.bs.modal', handleHidden);
        };

        confirmBtn?.addEventListener('click', handleConfirm);
        modalEl.addEventListener('hidden.bs.modal', handleHidden);
        modal.show();
    });
}
window.showConfirmModal = showConfirmModal;



// Async function to handle the addition or editing of an item
async function addItem(event) {
    event.preventDefault();

    const imageUrl = document.getElementById("item_image").value.trim();
    const imageFileInput = document.getElementById("item_image_upload");
    let editImageURL = "";

    if (isEditingItem) {
        editImageURL = localStorage.getItem('edit_image_path').replace(/"/g, '').trim();
    }

    if (imageFileInput.files.length > 0) {
        // If an image file is uploaded, upload the image and set its URL
        const localImage = await uploadImage();
        if (localImage) {
            document.getElementById("item_image").value = localImage;
        }
    } else if (imageUrl !== editImageURL && imageUrl) {
        // If an image URL is provided and it's different from the editing image URL, use it directly
        document.getElementById("item_image").value = imageUrl;
    }

    // Submit lights and tags information
    submitLights();
    if (typeof commitTagifyInput === 'function') {
        commitTagifyInput();
    }
    SubmitTags();

    // Gather item information from the form
    const name = document.getElementById("item_name").value;
    const link = document.getElementById("item_url").value || "";
    const image = document.getElementById("item_image").value.replace(window.location.href, "");
    let position = localStorage.getItem('led_positions') || '[]';
    let quantity = document.getElementById("item_quantity").value;
    const minQtyInput = document.getElementById("item_min_quantity");
    let min_quantity = (minQtyInput && minQtyInput.value !== "" && !isNaN(parseInt(minQtyInput.value, 10)))
        ? parseInt(minQtyInput.value, 10)
        : 3;
    const tags = localStorage.getItem('item_tags');
    const selectedEspOption = selectEspDropdown.options[selectEspDropdown.selectedIndex];

    // Check if there are any empty fields
    if (handleEmptyFields('item')) return; // Exit if any fields are empty


    // Retrieve the IP address of the selected ESP device
    const ip = selectedEspOption.dataset.espIp;

    // Create the item object with gathered information
    const item = {
        name,
        link,
        image,
        position,
        quantity,
        min_quantity,
        ip,
        tags,
    };

    // Check if editing an existing item or adding a new one
    try {
        if (isEditingItem) {
            const currentEditId = editingItemId;
            const response = await fetch(`/api/items/${currentEditId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(item),
            });
            const data = await response.json();

            // Update in-memory fetchedItems
            const idx = fetchedItems.findIndex(i => i.id == currentEditId || i.id == data.id);
            if (idx !== -1) {
                fetchedItems[idx] = { ...fetchedItems[idx], ...data };
            }

            // Update the displayed item in the UI
            const grid = document.getElementById('items-container-grid');
            const col = grid ? (grid.querySelector(`div[data-id="${currentEditId}"]`) || grid.querySelector(`div[data-id="${data.id}"]`)) : null;
            const updatedCol = createItem(data);
            if (grid && col) {
                grid.replaceChild(updatedCol, col);
            }
            if (typeof currentSortMethod !== 'undefined' && currentSortMethod) {
                sortItems(currentSortMethod, currentSortDirection);
            }
            if (typeof applyItemFilters === 'function') {
                applyItemFilters();
            }
            lucide.createIcons();
            fetchDataAndLoadTags();
            if (typeof mapModalVisible !== 'undefined' && mapModalVisible && currentMapEsp) {
                drawMapCanvas(currentMapEsp);
            }
        } else {
            // Add a new item via POST request
            const response = await fetch("/api/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(item),
            });
            const data = await response.json();

            // Keep in-memory fetchedItems synchronized
            fetchedItems.push(data);
            // Create and append the new item to the UI
            const grid = document.getElementById('items-container-grid');
            const col = createItem(data);
            if (grid) {
                grid.appendChild(col);
            }
            if (typeof currentSortMethod !== 'undefined' && currentSortMethod) {
                sortItems(currentSortMethod, currentSortDirection);
            }
            if (typeof applyItemFilters === 'function') {
                applyItemFilters();
            }
            lucide.createIcons();
            fetchDataAndLoadTags();
            if (typeof mapModalVisible !== 'undefined' && mapModalVisible && currentMapEsp) {
                drawMapCanvas(currentMapEsp);
            }
        }
    } catch (error) {
        console.error("Error saving item:", error);
    } finally {
        // Reset editing flag, remove local storage, and reset the modal
        isEditingItem = false;
        isCopyingItem = false;
        removeLocalStorage();
        resetModal();
        if (typeof updatePlacementHealthUI === 'function') {
            updatePlacementHealthUI();
        }
    }
}



function parsePositionsArray(pos) {
    if (!pos) return [];
    if (Array.isArray(pos)) return pos.map(Number).filter(n => !isNaN(n) && n > 0);
    if (typeof pos === 'string') {
        try {
            const parsed = JSON.parse(pos);
            if (Array.isArray(parsed)) return parsed.map(Number).filter(n => !isNaN(n) && n > 0);
            if (typeof parsed === 'number' && !isNaN(parsed) && parsed > 0) return [parsed];
        } catch (e) {}
        const cleaned = pos.replace(/[\[\]\s]/g, '');
        if (!cleaned) return [];
        return cleaned.split(',').map(Number).filter(n => !isNaN(n) && n > 0);
    }
    return [];
}
window.parsePositionsArray = parsePositionsArray;

function removeLocalStorage(){
    localStorage.removeItem('led_positions');
    localStorage.removeItem('edit_led_positions');
    localStorage.removeItem('item_tags');
    localStorage.removeItem('edit_image_path');
}
function updateOccupiedCells(espIp) {
    occupiedCells = [];
    if (!fetchedItems) return;
    fetchedItems.forEach(item => {
        if (item.ip !== espIp) return;
        if (isEditingItem && item.id === editingItemId) return;
        const pos = parsePositionsArray(item.position);
        occupiedCells = occupiedCells.concat(pos);
    });
}

function getEspName(itemIp) {
    if (!itemIp) return '';
    const cleanIp = String(itemIp).trim().toLowerCase();
    const found = fetchedEsps.find(esp =>
        (esp.esp_ip && String(esp.esp_ip).trim().toLowerCase() === cleanIp) ||
        (esp.name && String(esp.name).trim().toLowerCase() === cleanIp)
    );
    if (found && found.name) {
        return found.name;
    }
    return itemIp;
}

// ---------------------------------------------------
// Inventory Health Engine (Placement, Low Stock, Out of Stock)
// ---------------------------------------------------
let inventoryHealthData = {
    placementIssues: [],
    outOfStockItems: [],
    lowStockItems: [],
    activeDrawerTab: 'placement',
    isFiltered: false,
    activeFilterCategory: null
};

// Aliased for backward compatibility
let placementHealthData = {
    orphaned: [],
    unassigned: [],
    allIssues: [],
    isFiltered: false
};

function getEspTotalDrawers(esp) {
    if (!esp) return 0;
    if (esp.sections && Array.isArray(esp.sections) && esp.sections.length > 0) {
        return esp.sections.reduce((sum, s) => sum + (parseInt(s.rows, 10) || 1) * (parseInt(s.cols, 10) || 1), 0);
    }
    const rows = parseInt(esp.rows, 10) || 1;
    const cols = parseInt(esp.cols, 10) || 1;
    return rows * cols;
}

function findEspForItem(item) {
    if (!item || !item.ip || !fetchedEsps) return null;
    const cleanIp = String(item.ip).trim().toLowerCase();
    return fetchedEsps.find(esp =>
        (esp.esp_ip && String(esp.esp_ip).trim().toLowerCase() === cleanIp) ||
        (esp.name && String(esp.name).trim().toLowerCase() === cleanIp) ||
        (esp.id !== undefined && String(esp.id).trim().toLowerCase() === cleanIp)
    ) || null;
}

function computeInventoryHealth(items, esps) {
    const orphaned = [];
    const unassigned = [];
    const outOfStock = [];
    const lowStock = [];

    (items || []).forEach(item => {
        // Placement check
        const positions = parsePositionsArray(item.position);
        const esp = findEspForItem(item);

        if (!item.ip || String(item.ip).trim() === '') {
            unassigned.push({
                item,
                type: 'no_controller',
                badgeText: 'No Controller',
                description: 'No WLED cabinet or controller selected',
                badgeClass: 'bg-secondary-subtle text-secondary'
            });
        } else if (!esp) {
            unassigned.push({
                item,
                type: 'unresolved_controller',
                badgeText: 'Unknown Cabinet',
                description: `Assigned controller "${item.ip}" not found`,
                badgeClass: 'bg-secondary-subtle text-secondary'
            });
        } else if (positions.length === 0) {
            unassigned.push({
                item,
                type: 'no_bin',
                badgeText: 'No Bin',
                description: `Assigned to "${esp.name || esp.esp_ip}", but no bin chosen`,
                badgeClass: 'bg-info-subtle text-info-emphasis',
                esp
            });
        } else {
            const maxDrawers = getEspTotalDrawers(esp);
            const invalidBins = positions.filter(p => p > maxDrawers || p <= 0);
            if (invalidBins.length > 0) {
                orphaned.push({
                    item,
                    type: 'orphaned',
                    badgeText: `Out of Bounds (#${invalidBins.join(', #')})`,
                    description: `Bin #${invalidBins.join(', #')} exceeds "${esp.name || esp.esp_ip}" capacity (${maxDrawers} bins)`,
                    badgeClass: 'bg-warning-subtle text-warning-emphasis',
                    invalidBins,
                    maxDrawers,
                    esp
                });
            }
        }

        // Stock checks
        const qty = parseInt(item.quantity, 10) || 0;
        const minQty = (item.min_quantity !== undefined && item.min_quantity !== null && !isNaN(parseInt(item.min_quantity, 10)))
            ? parseInt(item.min_quantity, 10)
            : 3;

        if (qty <= 0) {
            outOfStock.push({
                item,
                quantity: qty,
                minQuantity: minQty
            });
        } else if (qty <= minQty) {
            lowStock.push({
                item,
                quantity: qty,
                minQuantity: minQty
            });
        }
    });

    inventoryHealthData.placementIssues = [...orphaned, ...unassigned];
    inventoryHealthData.outOfStockItems = outOfStock;
    inventoryHealthData.lowStockItems = lowStock;

    // Backward compatibility
    placementHealthData.orphaned = orphaned;
    placementHealthData.unassigned = unassigned;
    placementHealthData.allIssues = inventoryHealthData.placementIssues;

    return inventoryHealthData;
}

// Backward compatibility helper
function computePlacementHealth(items, esps) {
    computeInventoryHealth(items, esps);
    return placementHealthData;
}

function updatePlacementHealthUI() {
    updateInventoryHealthUI();
}

function getStatusPillVisibility(type) {
    try {
        const stored = localStorage.getItem('status_pill_visibility');
        if (stored) {
            const prefs = JSON.parse(stored);
            if (typeof prefs[type] === 'boolean') {
                return prefs[type];
            }
        }
    } catch (e) {
        console.error('Error reading pill visibility preference:', e);
    }
    return true; // Default is visible
}

function setStatusPillVisibility(type, isVisible) {
    try {
        let prefs = {};
        const stored = localStorage.getItem('status_pill_visibility');
        if (stored) {
            prefs = JSON.parse(stored);
        }
        prefs[type] = !!isVisible;
        localStorage.setItem('status_pill_visibility', JSON.stringify(prefs));
    } catch (e) {
        console.error('Error saving pill visibility preference:', e);
    }
    updateInventoryHealthUI();
}

function initStatusPillsSettings() {
    const placementToggle = document.getElementById('toggle-pill-placement');
    const outToggle = document.getElementById('toggle-pill-out-of-stock');
    const lowToggle = document.getElementById('toggle-pill-low-stock');

    if (placementToggle) {
        placementToggle.checked = getStatusPillVisibility('placement');
        placementToggle.addEventListener('change', (e) => {
            setStatusPillVisibility('placement', e.target.checked);
        });
    }

    if (outToggle) {
        outToggle.checked = getStatusPillVisibility('out_of_stock');
        outToggle.addEventListener('change', (e) => {
            setStatusPillVisibility('out_of_stock', e.target.checked);
        });
    }

    if (lowToggle) {
        lowToggle.checked = getStatusPillVisibility('low_stock');
        lowToggle.addEventListener('change', (e) => {
            setStatusPillVisibility('low_stock', e.target.checked);
        });
    }

    const offcanvasSettings = document.getElementById('offcanvasSettings');
    if (offcanvasSettings) {
        offcanvasSettings.addEventListener('show.bs.offcanvas', () => {
            if (placementToggle) placementToggle.checked = getStatusPillVisibility('placement');
            if (outToggle) outToggle.checked = getStatusPillVisibility('out_of_stock');
            if (lowToggle) lowToggle.checked = getStatusPillVisibility('low_stock');
        });
    }
}

window.getStatusPillVisibility = getStatusPillVisibility;
window.setStatusPillVisibility = setStatusPillVisibility;

function updateInventoryHealthUI() {
    computeInventoryHealth(fetchedItems, fetchedEsps);

    const container = document.getElementById('status-pills-container') || document.getElementById('placement-pill-container');
    const placementBtn = document.getElementById('placement-pill-btn');
    const outBtn = document.getElementById('out-of-stock-pill-btn');
    const lowBtn = document.getElementById('low-stock-pill-btn');

    const placementCountEl = document.getElementById('placement-pill-count');
    const outCountEl = document.getElementById('out-of-stock-pill-count');
    const lowCountEl = document.getElementById('low-stock-pill-count');

    const placementIssues = inventoryHealthData.placementIssues;
    const outOfStock = inventoryHealthData.outOfStockItems;
    const lowStock = inventoryHealthData.lowStockItems;

    const showPlacement = getStatusPillVisibility('placement');
    const showOutOfStock = getStatusPillVisibility('out_of_stock');
    const showLowStock = getStatusPillVisibility('low_stock');

    // Update Pills
    if (placementBtn) {
        if (showPlacement && placementIssues.length > 0) {
            placementBtn.classList.remove('d-none');
            if (placementCountEl) placementCountEl.textContent = placementIssues.length;
        } else {
            placementBtn.classList.add('d-none');
        }
    }

    if (outBtn) {
        if (showOutOfStock && outOfStock.length > 0) {
            outBtn.classList.remove('d-none');
            if (outCountEl) outCountEl.textContent = outOfStock.length;
        } else {
            outBtn.classList.add('d-none');
        }
    }

    if (lowBtn) {
        if (showLowStock && lowStock.length > 0) {
            lowBtn.classList.remove('d-none');
            if (lowCountEl) lowCountEl.textContent = lowStock.length;
        } else {
            lowBtn.classList.add('d-none');
        }
    }

    let visiblePillsCount = 0;
    if (placementBtn && !placementBtn.classList.contains('d-none')) visiblePillsCount++;
    if (outBtn && !outBtn.classList.contains('d-none')) visiblePillsCount++;
    if (lowBtn && !lowBtn.classList.contains('d-none')) visiblePillsCount++;

    if (container) {
        if (visiblePillsCount > 0) {
            container.classList.remove('d-none');
        } else {
            container.classList.add('d-none');
        }
    }

    // Update Drawer Tab Badges
    const drawerPlacementBadge = document.getElementById('drawer-placement-count');
    const drawerOutBadge = document.getElementById('drawer-out-count');
    const drawerLowBadge = document.getElementById('drawer-low-count');
    const legacyCount = document.getElementById('drawer-issues-count');

    if (drawerPlacementBadge) drawerPlacementBadge.textContent = placementIssues.length;
    if (drawerOutBadge) drawerOutBadge.textContent = outOfStock.length;
    if (drawerLowBadge) drawerLowBadge.textContent = lowStock.length;
    if (legacyCount) legacyCount.textContent = placementIssues.length;

    // Render Drawer Lists
    renderPlacementDrawerList(placementIssues);
    renderOutOfStockDrawerList(outOfStock);
    renderLowStockDrawerList(lowStock);

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

function renderPlacementDrawerList(placementIssues) {
    const list = document.getElementById('placement-items-list');
    if (!list) return;

    if (!placementIssues || placementIssues.length === 0) {
        list.innerHTML = '<p class="text-muted small text-center my-4">✨ All items are properly assigned to cabinet bins.</p>';
        return;
    }

    list.innerHTML = placementIssues.map(({ item, badgeText, description, badgeClass }) => {
        const hasImage = item.image && typeof item.image === 'string' && item.image.trim().length > 0;
        const imgHtml = hasImage
            ? `<img src="${safeUrl(item.image)}" class="rounded object-fit-cover flex-shrink-0" style="width: 38px; height: 38px;" alt="${escapeHtml(item.name)}">`
            : `<div class="rounded bg-body-secondary d-flex align-items-center justify-content-center flex-shrink-0" style="width: 38px; height: 38px;"><i data-lucide="package" class="icon-n4px text-secondary"></i></div>`;

        return `
            <div class="card p-2 border shadow-xs bg-body">
                <div class="d-flex align-items-center justify-content-between gap-2">
                    <div class="d-flex align-items-center gap-2 overflow-hidden">
                        ${imgHtml}
                        <div class="overflow-hidden">
                            <div class="fw-semibold text-truncate small">${escapeHtml(item.name)}</div>
                            <div class="text-muted text-truncate" style="font-size: 0.75rem;">${escapeHtml(description)}</div>
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-2 flex-shrink-0">
                        <span class="badge ${badgeClass} rounded-pill d-none d-sm-inline">${badgeText}</span>
                        <button type="button" class="btn btn-sm btn-outline-primary py-1 px-2 text-nowrap" onclick="openAssignPlacement(${item.id})" title="Assign bin location">
                            <span class="small">Assign Bin</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderOutOfStockDrawerList(outOfStockItems) {
    const list = document.getElementById('out-of-stock-items-list');
    if (!list) return;

    if (!outOfStockItems || outOfStockItems.length === 0) {
        list.innerHTML = '<p class="text-muted small text-center my-4">🎉 No items are currently out of stock.</p>';
        return;
    }

    list.innerHTML = outOfStockItems.map(({ item, minQuantity }) => {
        const hasImage = item.image && typeof item.image === 'string' && item.image.trim().length > 0;
        const imgHtml = hasImage
            ? `<img src="${safeUrl(item.image)}" class="rounded object-fit-cover flex-shrink-0" style="width: 38px; height: 38px;" alt="${escapeHtml(item.name)}">`
            : `<div class="rounded bg-body-secondary d-flex align-items-center justify-content-center flex-shrink-0" style="width: 38px; height: 38px;"><i data-lucide="alert-octagon" class="icon-n4px text-danger"></i></div>`;

        return `
            <div class="card p-2 border shadow-xs bg-body">
                <div class="d-flex align-items-center justify-content-between gap-2">
                    <div class="d-flex align-items-center gap-2 overflow-hidden">
                        ${imgHtml}
                        <div class="overflow-hidden">
                            <div class="fw-semibold text-truncate small">${escapeHtml(item.name)}</div>
                            <div class="text-muted text-truncate" style="font-size: 0.75rem;">
                                Stock: <span class="text-danger fw-bold">0</span> &bull; Min: ${minQuantity}
                            </div>
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-2 flex-shrink-0">
                        <button type="button" class="btn btn-sm btn-outline-success py-1 px-2 text-nowrap d-inline-flex align-items-center gap-1" onclick="quickRestockItem(${item.id})" title="Add 1 to stock">
                            <i data-lucide="plus" class="icon-n4px"></i>
                            <span class="small">+1</span>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-secondary py-1 px-2 text-nowrap" onclick="openAssignPlacement(${item.id})" title="Edit item">
                            <span class="small">Edit</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderLowStockDrawerList(lowStockItems) {
    const list = document.getElementById('low-stock-items-list');
    if (!list) return;

    if (!lowStockItems || lowStockItems.length === 0) {
        list.innerHTML = '<p class="text-muted small text-center my-4">👍 All items have adequate stock levels.</p>';
        return;
    }

    list.innerHTML = lowStockItems.map(({ item, quantity, minQuantity }) => {
        const hasImage = item.image && typeof item.image === 'string' && item.image.trim().length > 0;
        const imgHtml = hasImage
            ? `<img src="${safeUrl(item.image)}" class="rounded object-fit-cover flex-shrink-0" style="width: 38px; height: 38px;" alt="${escapeHtml(item.name)}">`
            : `<div class="rounded bg-body-secondary d-flex align-items-center justify-content-center flex-shrink-0" style="width: 38px; height: 38px;"><i data-lucide="trending-down" class="icon-n4px text-warning"></i></div>`;

        return `
            <div class="card p-2 border shadow-xs bg-body">
                <div class="d-flex align-items-center justify-content-between gap-2">
                    <div class="d-flex align-items-center gap-2 overflow-hidden">
                        ${imgHtml}
                        <div class="overflow-hidden">
                            <div class="fw-semibold text-truncate small">${escapeHtml(item.name)}</div>
                            <div class="text-muted text-truncate" style="font-size: 0.75rem;">
                                Stock: <span class="text-warning fw-bold">${quantity}</span> &bull; Min: ${minQuantity}
                            </div>
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-2 flex-shrink-0">
                        <button type="button" class="btn btn-sm btn-outline-success py-1 px-2 text-nowrap d-inline-flex align-items-center gap-1" onclick="quickRestockItem(${item.id})" title="Add 1 to stock">
                            <i data-lucide="plus" class="icon-n4px"></i>
                            <span class="small">+1</span>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-secondary py-1 px-2 text-nowrap" onclick="openAssignPlacement(${item.id})" title="Edit item">
                            <span class="small">Edit</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.openStatusDrawer = function(tabName = 'placement') {
    const drawerEl = document.getElementById('unassigned-drawer');
    if (!drawerEl || typeof bootstrap === 'undefined' || !bootstrap.Offcanvas) return;

    let tabBtnId = 'tab-placement-btn';
    if (tabName === 'out_of_stock') tabBtnId = 'tab-out-of-stock-btn';
    if (tabName === 'low_stock') tabBtnId = 'tab-low-stock-btn';

    const tabBtn = document.getElementById(tabBtnId);
    if (tabBtn && bootstrap.Tab) {
        const tab = bootstrap.Tab.getOrCreateInstance(tabBtn);
        tab.show();
    }
    inventoryHealthData.activeDrawerTab = tabName;
    updateFilterButtonText();

    const bsOffcanvas = bootstrap.Offcanvas.getOrCreateInstance(drawerEl);
    bsOffcanvas.show();
};

window.openPlacementDrawer = function() {
    window.openStatusDrawer('placement');
};

window.quickRestockItem = function(itemId) {
    const item = (fetchedItems || []).find(it => String(it.id) === String(itemId));
    if (!item) return;
    const currentQty = parseInt(item.quantity, 10) || 0;
    handleQuantitySet(item, currentQty + 1);
    updateInventoryHealthUI();
    showToast(`Added 1 to "${item.name}" (now ${item.quantity})`, 'success');
};

function openAssignPlacement(itemId) {
    const item = fetchedItems.find(i => String(i.id) === String(itemId));
    if (!item) return;

    // Close the offcanvas drawer
    const drawerEl = document.getElementById('unassigned-drawer');
    if (drawerEl && typeof bootstrap !== 'undefined' && bootstrap.Offcanvas) {
        const inst = bootstrap.Offcanvas.getInstance(drawerEl);
        if (inst) inst.hide();
    }

    // Close the map modal if open
    if (window.DialogManager) {
        DialogManager.close('map-modal');
    } else {
        const mapModalEl = document.getElementById('map-modal');
        if (mapModalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            const mapModal = bootstrap.Modal.getInstance(mapModalEl);
            if (mapModal) mapModal.hide();
        }
    }

    // Try finding the item's card to trigger standard edit
    const col = document.querySelector(`.item-col[data-id="${itemId}"]`);
    if (col) {
        const editBtn = col.querySelector('.edit-btn');
        if (editBtn) {
            editBtn.click();
            return;
        }
    }

    // Direct fallback
    isEditingItem = true;
    editingItemId = item.id;
    editingItemName = item.name;
    editingItemIP = item.ip;
    DialogManager.open('item-modal');
}

function updateFilterButtonText() {
    const filterBtnText = document.getElementById('drawer-filter-btn-text');
    if (!filterBtnText) return;
    const activeTab = inventoryHealthData.activeDrawerTab || 'placement';
    if (inventoryHealthData.isFiltered && inventoryHealthData.activeFilterCategory === activeTab) {
        filterBtnText.textContent = 'Clear Filter';
    } else {
        filterBtnText.textContent = 'Filter Grid';
    }
}

function toggleFilterGridToUnassigned() {
    const activeTab = inventoryHealthData.activeDrawerTab || 'placement';

    if (inventoryHealthData.isFiltered && inventoryHealthData.activeFilterCategory === activeTab) {
        inventoryHealthData.isFiltered = false;
        inventoryHealthData.activeFilterCategory = null;
        updateFilterButtonText();
        generateItemsGrid();
        return;
    }

    inventoryHealthData.isFiltered = true;
    inventoryHealthData.activeFilterCategory = activeTab;
    updateFilterButtonText();

    // Close offcanvas drawer so user can view grid
    const drawerEl = document.getElementById('unassigned-drawer');
    if (drawerEl && typeof bootstrap !== 'undefined' && bootstrap.Offcanvas) {
        const inst = bootstrap.Offcanvas.getInstance(drawerEl);
        if (inst) inst.hide();
    }

    let targetItems = [];
    if (activeTab === 'placement') {
        targetItems = inventoryHealthData.placementIssues.map(i => i.item);
    } else if (activeTab === 'out_of_stock') {
        targetItems = inventoryHealthData.outOfStockItems.map(i => i.item);
    } else if (activeTab === 'low_stock') {
        targetItems = inventoryHealthData.lowStockItems.map(i => i.item);
    }

    applyStatusFilterToGrid(targetItems);
}

function applyStatusFilterToGrid(targetItems) {
    const targetIds = new Set((targetItems || []).map(i => String(i.id)));
    const allCols = document.querySelectorAll('.item-col');
    let visibleCount = 0;

    allCols.forEach(col => {
        if (targetIds.has(String(col.dataset.id))) {
            col.classList.remove('d-none');
            col.style.display = 'flex';
            visibleCount++;
        } else {
            col.classList.add('d-none');
            col.style.display = 'none';
        }
    });

    updateEmptyState(visibleCount, (fetchedItems || []).length);
}

function applyPlacementFilterToGrid() {
    toggleFilterGridToUnassigned();
}


function populateEspDropdown() {
    let index = 0;
    selectEspDropdown.innerHTML = "";
    // Fetch ESP devices
    fetch("/api/esp").then((response) => response.json()).then((data) => {
        if (Array.isArray(data)) {
            fetchedEsps = data;
        }
        if (data.length > 0) {
            // Devices found: Populate dropdown and select the first one
            data.forEach((esp) => {
                const option = document.createElement("option");
                option.value = esp.id;
                option.dataset.espRows = esp.rows;
                option.dataset.espColumns = esp.cols;
                option.dataset.espStartY = esp.start_top;
                option.dataset.espStartX = esp.start_left;
                option.dataset.espSerpentine = esp.serpentine_direction;
                option.dataset.espSections = esp.sections ? JSON.stringify(esp.sections) : "";
                option.dataset.espIp = esp.esp_ip;
                option.dataset.espName = esp.name;
                option.textContent = esp.name + " (" + esp.esp_ip + ")";
                selectEspDropdown.appendChild(option);

            });

            if (isEditingItem || isCopyingItem) {
                index = findIndexByIP(editingItemIP);
            } else {
                const activeEsp = getActiveEspTab();
                if (activeEsp) {
                    index = findIndexByIP(activeEsp);
                } else {
                    index = 0;
                }
            }
            if (index < 0 || index >= data.length) {
                index = 0;
            }
            selectEspDropdown.selectedIndex = index;

            const selectedOption = selectEspDropdown.options[index];
            if (selectedOption) {
                let rows = selectedOption.getAttribute("data-esp-rows");
                let columns = selectedOption.getAttribute("data-esp-columns");
                let startX = selectedOption.getAttribute("data-esp-start-x");
                let startY = selectedOption.getAttribute("data-esp-start-y");
                let serpentineDirection = selectedOption.getAttribute("data-esp-serpentine");
                const espIp = selectedOption.getAttribute("data-esp-ip");
                updateOccupiedCells(espIp);
                drawGrid("item", rows, columns, startX, startY, serpentineDirection);
            }
        } else {
            // No devices found: Disable dropdown and display message
            selectEspDropdown.disabled = true;
            const messageOption = document.createElement("option");
            messageOption.textContent = "Please add an ESP device first...";
            messageOption.disabled = true;
            selectEspDropdown.appendChild(messageOption);
        }
    }).catch((error) => console.error(error));
}

document.getElementById('item-modal').addEventListener('show.bs.modal', function (event) {
    document.getElementById("item-error-alert").classList.add("d-none");
    document.getElementById("item-error-list").innerHTML = "";

    const triggerBtn = event ? event.relatedTarget : null;
    const isExplicitAdd = triggerBtn && (
        triggerBtn.id === 'add_item' ||
        (triggerBtn.querySelector && triggerBtn.querySelector('#add_item')) ||
        (triggerBtn.getAttribute && triggerBtn.getAttribute('data-bs-target') === '#item-modal' && !triggerBtn.classList.contains('edit-btn') && !triggerBtn.classList.contains('copy-btn')) ||
        (triggerBtn.textContent && triggerBtn.textContent.includes('Add Item'))
    );

    if (isExplicitAdd || (!isEditingItem && !isCopyingItem)) {
        resetModal(true);
    }
});

document.getElementById('item-modal').addEventListener('hidden.bs.modal', function () {
    resetModal(true);
    if (typeof hideHoverIndicators === 'function') {
        hideHoverIndicators('item');
    }
});

document.getElementById('item-modal').addEventListener('shown.bs.modal', function () {
    let inputField = document.getElementById('item_name');
    inputField.focus();
    inputField.select();
    populateEspDropdown();
});
document.getElementById('item_esp_select').addEventListener('change', function () {
    let selectEspDropdown = document.getElementById('item_esp_select');
    let rows = selectEspDropdown.options[selectEspDropdown.selectedIndex].getAttribute("data-esp-rows");
    let columns = selectEspDropdown.options[selectEspDropdown.selectedIndex].getAttribute("data-esp-columns");
    let startX = selectEspDropdown.options[selectEspDropdown.selectedIndex].getAttribute("data-esp-start-x");
    let startY = selectEspDropdown.options[selectEspDropdown.selectedIndex].getAttribute("data-esp-start-y");
    let serpentineDirection = selectEspDropdown.options[selectEspDropdown.selectedIndex].getAttribute("data-esp-serpentine");
    const espIp = selectEspDropdown.options[selectEspDropdown.selectedIndex].getAttribute("data-esp-ip");
    clearAll();
    updateOccupiedCells(espIp);
    drawGrid("item", rows, columns, startX, startY, serpentineDirection);
});

document.getElementById("save-item-button").addEventListener("click", addItem);
document.getElementById("cropAndSaveBtn").addEventListener("click", addItem);
function renderLoadingSkeletons(count = 8) {
    const itemsContainer = document.getElementById('items-container-grid');
    if (!itemsContainer) return;
    itemsContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const col = document.createElement('div');
        col.classList.add('item-col', 'skeleton-col');
        col.innerHTML = `
        <div class="card item-card skeleton-card shadow-sm">
            <div class="skeleton-thumb skeleton-shimmer"></div>
            <div class="card-body p-2 d-flex flex-column gap-2">
                <div class="skeleton-line skeleton-shimmer" style="width: 75%;"></div>
                <div class="skeleton-btn skeleton-shimmer" style="width: 100%;"></div>
                <div class="skeleton-line skeleton-shimmer mt-auto" style="width: 45%;"></div>
            </div>
        </div>`;
        itemsContainer.appendChild(col);
    }
}

function loadItems() {
    renderLoadingSkeletons();
    Promise.all([
        fetch("/api/esp").then((res) => res.json()).catch(() => []),
        fetch("/api/items").then((res) => res.json())
    ])
        .then(([esps, items]) => {
            fetchedEsps = Array.isArray(esps) ? esps : [];
            fetchedItems = Array.isArray(items) ? items : [];
            generateItemsGrid();
        })
        .catch((error) => {
            console.error(error);
            updateEmptyState(0, 0);
        });
}

// Helper function to get badge styling and text based on quantity and custom min_quantity threshold
function getStockBadgeConfig(quantity, minQuantity = 3) {
    const qty = parseInt(quantity, 10) || 0;
    const threshold = (minQuantity !== undefined && minQuantity !== null && !isNaN(parseInt(minQuantity, 10)))
        ? parseInt(minQuantity, 10)
        : 3;
    if (qty <= 0) {
        return {
            cls: 'stock-badge-out',
            text: 'Out of stock'
        };
    } else if (qty <= threshold) {
        return {
            cls: 'stock-badge-low',
            text: `Low: ${qty}`
        };
    } else {
        return {
            cls: 'stock-badge-normal',
            text: `${qty} in stock`
        };
    }
}

function formatLocationBadge(positions, itemIp = null) {
    const parsedPos = parsePositionsArray(positions);
    if (parsedPos.length === 0) return '';

    let isOrphaned = false;
    let maxDrawers = 0;
    if (itemIp) {
        const esp = findEspForItem({ ip: itemIp });
        if (esp) {
            maxDrawers = getEspTotalDrawers(esp);
            if (maxDrawers > 0) {
                isOrphaned = parsedPos.some(p => p > maxDrawers || p <= 0);
            }
        }
    }

    const count = parsedPos.length;
    const allBinsText = parsedPos.join(', ');
    let displayText = '';
    if (count === 1) {
        displayText = `Bin #${parsedPos[0]}`;
    } else if (count === 2) {
        displayText = `Bins #${parsedPos[0]}, #${parsedPos[1]}`;
    } else {
        displayText = `Bins #${parsedPos[0]}, #${parsedPos[1]} (+${count - 2})`;
    }

    if (isOrphaned) {
        return `<span class="location-badge location-badge-warning" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Warning: Exceeds cabinet capacity (${maxDrawers} bins). Bins: ${escapeHtml(allBinsText)}">⚠️ ${escapeHtml(displayText)}</span>`;
    }

    return `<span class="location-badge" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Bins: ${escapeHtml(allBinsText)}">${escapeHtml(displayText)}</span>`;
}

// Locate item with proactive validation for unassigned or orphaned bins
function locateItem(item) {
    if (!item) return;
    if (!item.ip || String(item.ip).trim() === '') {
        showToast(`Cannot locate "${item.name}": No cabinet or controller assigned.`, 'warning');
        return;
    }
    const esp = findEspForItem(item);
    if (!esp) {
        showToast(`Cannot locate "${item.name}": Cabinet "${item.ip}" was not found.`, 'warning');
        return;
    }
    const positions = parsePositionsArray(item.position);
    if (positions.length === 0) {
        showToast(`Cannot locate "${item.name}": No bin position assigned.`, 'warning');
        return;
    }
    const maxDrawers = getEspTotalDrawers(esp);
    const validBins = maxDrawers > 0 ? positions.filter(p => p > 0 && p <= maxDrawers) : positions;
    const invalidBins = maxDrawers > 0 ? positions.filter(p => p > maxDrawers || p <= 0) : [];
    if (invalidBins.length > 0 && validBins.length === 0) {
        showToast(`Cannot locate "${item.name}": Bin #${invalidBins.join(', #')} exceeds cabinet capacity (${maxDrawers} bins).`, 'warning');
        return;
    }
    if (invalidBins.length > 0 && validBins.length > 0) {
        showToast(`Warning: Bin #${invalidBins.join(', #')} exceeds cabinet capacity (${maxDrawers} bins). Locating valid bin(s)...`, 'warning');
    }
    fetch(`/api/items/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ action: "locate" }),
    })
    .then(async (res) => {
        if (res.ok) {
            showToast(`Locating "${item.name}"...`, 'info');
        } else {
            const data = await res.json().catch(() => ({}));
            const errMsg = data.error || `Could not locate "${item.name}".`;
            showToast(`Cannot locate "${item.name}": ${errMsg}`, 'danger');
        }
    })
    .catch((error) => {
        console.error('Locate error:', error);
        showToast(`Network error attempting to locate "${item.name}".`, 'danger');
    });
}

// Function to create an HTML element representing an item
function createItem(item) {
    // Create a new column element for fluid CSS grid
    const col = document.createElement('div');
    col.classList.add('item-col');
    // Set dataset attributes to store item information
    col.dataset.id = item.id;
    col.dataset.name = item.name;
    col.dataset.quantity = parseInt(item.quantity, 10);  // Store as numbers
    item.min_quantity = (item.min_quantity !== undefined && item.min_quantity !== null && item.min_quantity !== '')
        ? parseInt(item.min_quantity, 10)
        : 3;
    col.dataset.minQuantity = item.min_quantity;
    col.dataset.ip = item.ip;
    const espName = getEspName(item.ip);
    col.dataset.espName = espName;
    item.position = parsePositionsArray(item.position);
    col.dataset.position = JSON.stringify(item.position);
    col.dataset.tags = item.tags;

    const stockConfig = getStockBadgeConfig(item.quantity, item.min_quantity);
    const locationBadgeHtml = formatLocationBadge(item.position, item.ip);
    const hasImage = item.image && typeof item.image === 'string' && item.image.trim().length > 0;
    const itemLink = formatItemLink(item.link);
    const titleHtml = itemLink
        ? `<a href="${itemLink}" target="_blank" rel="noopener noreferrer" class="card-title-link mb-1">
               <h5 id="link-btn-${item.id}" class="card-title mb-0" data-bs-toggle="tooltip" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h5>
           </a>`
        : `<div class="card-title-wrapper mb-1">
               <h5 id="link-btn-${item.id}" class="card-title mb-0" data-bs-toggle="tooltip" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h5>
           </div>`;

    const imageHtml = hasImage
        ? `<img src="${safeUrl(item.image)}" class="dynamic-img" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async" onerror="this.style.display='none'; this.parentElement.classList.add('placeholder-img-container'); const icon=document.createElement('i'); icon.setAttribute('data-lucide','package'); icon.className='placeholder-icon'; this.parentElement.appendChild(icon); if(window.lucide) lucide.createIcons();">`
        : `<i data-lucide="package" class="placeholder-icon"></i>`;

    const placeholderClass = hasImage ? '' : 'placeholder-img-container';

    // Set inner HTML for the created column
    col.innerHTML = `
    <div class="card item-card position-relative shadow-sm">
        <!-- Image container with badges -->
        <div class="card-img-container ${placeholderClass} position-relative">
            <div class="card-badges-header">
                ${locationBadgeHtml ? `<div>${locationBadgeHtml}</div>` : '<div></div>'}
                <span id="stock-badge-${item.id}" class="stock-badge ${stockConfig.cls}">${stockConfig.text}</span>
            </div>
            ${imageHtml}
        </div>

        <!-- Card body with item details and buttons -->
        <div class="card-body p-2 d-flex flex-column">
            <!-- Link to the item (if present) or plain title -->
            ${titleHtml}

            <!-- Subtle WLED Controller Reference -->
            <div class="item-esp-meta d-flex align-items-center gap-1 mb-2 text-secondary" data-bs-toggle="tooltip" data-bs-placement="top" title="Controller: ${escapeHtml(espName || 'Unassigned')}${item.ip ? ` (${escapeHtml(item.ip)})` : ''}">
                <i data-lucide="cpu" class="item-esp-icon"></i>
                <span class="item-esp-name text-truncate">${escapeHtml(espName || 'Unassigned')}</span>
            </div>

            <!-- Action buttons: Primary Locate button + Ghost secondary buttons -->
            <div class="d-flex align-items-center gap-1 mb-2">
                <button class="btn btn-locate locate-btn flex-grow-1 py-1 px-2 d-flex align-items-center justify-content-center gap-1" id="locate-btn-${item.id}" data-bs-toggle="tooltip" title="Locate in drawer" data-item-id="${item.id}">
                    <span class="icon-n4px"><i data-lucide="lightbulb"></i></span>
                    <span class="small fw-semibold">Locate</span>
                </button>
                <button class="btn btn-outline-secondary btn-card-ghost edit-btn p-1" id="edit-btn-${item.id}" data-bs-toggle="tooltip" title="Edit">
                    <span class="icon-n4px"><i data-lucide="file-edit"></i></span>
                </button>

                <!-- Dropdown menu trigger -->
                <div class="dropdown">
                    <button class="btn btn-outline-secondary btn-card-ghost p-1" type="button" id="dropdownMenuButton-${item.id}" data-bs-toggle="dropdown" data-bs-boundary="viewport" aria-expanded="false" title="More options">
                        <span class="icon-n4px"><i data-lucide="more-vertical"></i></span>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow" aria-labelledby="dropdownMenuButton-${item.id}">
                        <li><a id="copy_item_${item.id}" class="dropdown-item copy-btn" href="#">Copy Item</a></li>
                        <li><a id="delete_item_${item.id}" class="dropdown-item delete-btn" href="#">Delete</a></li>
                        <li><a id="crop_image_${item.id}" class="dropdown-item image-edit-btn" href="#">Crop Image</a></li>
                    </ul>
                </div>
            </div>

            <!-- Modern Stepper Pill with Accessible Touch Targets -->
            <div class="mt-auto d-flex align-items-center justify-content-between qty-pill-container">
                <button class="btn btn-outline-danger qty-btn minus-btn" id="minus-btn-${item.id}" data-bs-toggle="tooltip" title="-1 from stock" data-item-id="${item.id}">
                    &minus;
                </button>
                <div class="qty-display-wrapper">
                    <span id="quantity-${item.id}" class="qty-display-val">${item.quantity}</span>
                    <span class="qty-display-label">pcs</span>
                </div>
                <button class="btn btn-outline-success qty-btn plus-btn" id="plus-btn-${item.id}" data-bs-toggle="tooltip" title="+1 to stock" data-item-id="${item.id}">
                    &plus;
                </button>
            </div>
        </div>
    </div>`;

    // Add event listeners for quantity change, locating, deleting, and editing
    col.querySelector('.minus-btn').addEventListener('click', () => {
        handleQuantityChange(item, -1); // Decrease quantity by 1
    });

    col.querySelector('.plus-btn').addEventListener('click', () => {
        handleQuantityChange(item, 1); // Increase quantity by 1
    });

    const imgContainer = col.querySelector('.card-img-container');
    if (imgContainer) {
        imgContainer.addEventListener('click', (e) => {
            if (e.target.closest('.stock-badge') || e.target.closest('.location-badge')) return;
            locateItem(item);
        });
    }

    col.querySelector('.locate-btn').addEventListener('click', () => {
        locateItem(item);
    });

    col.querySelector('.delete-btn').addEventListener('click', async () => {
        const confirmed = await showConfirmModal({
            title: 'Delete Item',
            message: `Are you sure you want to delete "${item.name}"? This cannot be undone.`,
            confirmText: 'Delete Item',
            confirmBtnClass: 'btn-danger'
        });
        if (!confirmed) return;

        const id = item.id;
        const itemsContainer = document.getElementById('items-container-grid');
        // Delete item from database
        fetch(`/api/items/${id}`, { method: "DELETE" })
            .then(() => {
                const idx = fetchedItems.findIndex(i => i.id == id);
                if (idx !== -1) {
                    fetchedItems.splice(idx, 1);
                }
                const cardCol = itemsContainer.querySelector(`div[data-id="${id}"]`);
                if (cardCol) cardCol.parentNode.removeChild(cardCol);
                const deleteTooltip = bootstrap.Tooltip.getInstance(col.querySelector('.delete-btn'));
                if (deleteTooltip) {
                    deleteTooltip.hide();
                }
                fetchDataAndLoadTags();
                if (typeof updatePlacementHealthUI === 'function') {
                    updatePlacementHealthUI();
                }
                if (typeof mapModalVisible !== 'undefined' && mapModalVisible && currentMapEsp) {
                    drawMapCanvas(currentMapEsp);
                }
                showToast(`Item "${item.name}" was deleted.`, 'success');
            })
            .catch((error) => {
                console.error(error);
                showToast(`Failed to delete "${item.name}".`, 'danger');
            });
    });

    col.querySelector('.copy-btn').addEventListener('click', () => {
        resetModal(true);
        isCopyingItem = true;
        isEditingItem = false;
        editingItemId = null;
        editingItemIP = item.ip;

        const modalLabel = document.getElementById("item-modal-label");
        if (modalLabel) modalLabel.textContent = (typeof translation !== 'undefined' && translation.add_item) ? translation.add_item : "Add Item";
        const saveBtnLabel = document.getElementById("item_add_btn_label");
        if (saveBtnLabel) saveBtnLabel.textContent = (typeof translation !== 'undefined' && translation.add_btn_label) ? translation.add_btn_label : "Add";

        document.getElementById("item_name").value = item.name || "";
        document.getElementById("item_url").value = item.link || "";
        document.getElementById("item_image").value = item.image || "";
        document.getElementById("item_quantity").value = item.quantity;
        if (document.getElementById("item_min_quantity")) {
            document.getElementById("item_min_quantity").value = (item.min_quantity !== undefined && item.min_quantity !== null) ? item.min_quantity : 3;
        }
        if (typeof updateItemImagePreview === 'function') {
            updateItemImagePreview(item.image || '');
        }
        // Set LED positions for copying
        const parsedPos = parsePositionsArray(item.position);
        localStorage.setItem('led_positions', JSON.stringify(parsedPos));
        clickedCells = [...parsedPos];
        localStorage.setItem('edit_led_positions', JSON.stringify(parsedPos));
        localStorage.setItem('edit_image_path', JSON.stringify(item.image || ''));
        // Set item tags for copying
        let itemTagsArray = [];
        if (item.tags) {
            try {
                const parsed = JSON.parse(item.tags);
                if (Array.isArray(parsed)) itemTagsArray = parsed;
                else if (typeof parsed === 'string') itemTagsArray = [parsed];
            } catch (e) {
                const cleanedTags = item.tags.replace(/[\[\]'"`\\]/g, '');
                itemTagsArray = cleanedTags.split(',').map(t => t.trim()).filter(Boolean);
            }
        }
        localStorage.setItem('item_tags', JSON.stringify(itemTagsArray));
        if (typeof loadTagsIntoTagify === 'function') {
            loadTagsIntoTagify(itemTagsArray);
        }
        DialogManager.open('item-modal');
    });
    col.querySelector('.image-edit-btn').addEventListener('click', () => {
        const imageElement = document.getElementById('imageToCrop');
        const image = item.image;
        const cropImageModal = document.getElementById('cropImageModal');
        const downloadButton = document.getElementById('download-image-btn'); // Get the download button

        // Set the dataset attributes
        cropImageModal.dataset.item = JSON.stringify(item);

        if (isValidUrl(image)) {
            // Fetch the image from the backend instead of setting the URL directly
            fetchWithTimeout(`/proxy-image?url=${encodeURIComponent(image)}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    return response.blob();
                })
                .then(blob => {
                    imageElement.src = URL.createObjectURL(blob);

                    // Set up the download button
                    downloadButton.style.display = 'block'; // Make the button visible

                    // Add click event listener for downloading the image
                    downloadButton.addEventListener('click', function() {
                        const url = window.URL.createObjectURL(blob);
                        // Create a temporary link element
                        const link = document.createElement('a');
                        link.href = url;
                        // Extract the filename from the image URL or set a default name
                        link.download = image.split('/').pop() || 'downloaded_image';
                        // Append the link to the document body
                        document.body.appendChild(link);
                        // Programmatically trigger the download
                        link.click();
                        // Clean up by revoking the Blob URL and removing the link element
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(url);
                    });

                    DialogManager.open('cropImageModal');
                })
                .catch(error => {
                    console.error('Error fetching image:', error);
                    alert('Unable to load image. Please try a different Image URL.');
                });
        } else {
            // Directly use the local image path
            imageElement.src = image;
            downloadButton.style.display = 'none'; // Hide the download button for local images
            DialogManager.open('cropImageModal');
        }
    });




    col.querySelector('.edit-btn').addEventListener('click', () => {
        resetModal(true);
        isEditingItem = true;
        isCopyingItem = false;
        editingItemId = item.id;
        editingItemIP = item.ip;

        const modalLabel = document.getElementById("item-modal-label");
        if (modalLabel) modalLabel.textContent = (typeof translation !== 'undefined' && translation.edit_btn_label) ? translation.edit_btn_label : "Edit Item";
        const saveBtnLabel = document.getElementById("item_add_btn_label");
        if (saveBtnLabel) saveBtnLabel.textContent = (typeof translation !== 'undefined' && translation.save_btn_label) ? translation.save_btn_label : "Save";

        document.getElementById("item_name").value = item.name || "";
        document.getElementById("item_url").value = item.link || "";
        document.getElementById("item_image").value = item.image || "";
        document.getElementById("item_quantity").value = item.quantity;
        if (document.getElementById("item_min_quantity")) {
            document.getElementById("item_min_quantity").value = (item.min_quantity !== undefined && item.min_quantity !== null) ? item.min_quantity : 3;
        }
        if (typeof updateItemImagePreview === 'function') {
            updateItemImagePreview(item.image || '');
        }

        // Set LED positions for editing
        const parsedPos = parsePositionsArray(item.position);
        localStorage.setItem('led_positions', JSON.stringify(parsedPos));
        clickedCells = [...parsedPos];
        localStorage.setItem('edit_led_positions', JSON.stringify(parsedPos));
        localStorage.setItem('edit_image_path', JSON.stringify(item.image || ''));

        // Set item tags for editing
        let itemTagsArray = [];
        if (item.tags) {
            try {
                const parsed = JSON.parse(item.tags);
                if (Array.isArray(parsed)) itemTagsArray = parsed;
                else if (typeof parsed === 'string') itemTagsArray = [parsed];
            } catch (e) {
                const cleanedTags = item.tags.replace(/[\[\]'"`\\]/g, '');
                itemTagsArray = cleanedTags.split(',').map(t => t.trim()).filter(Boolean);
            }
        }
        localStorage.setItem('item_tags', JSON.stringify(itemTagsArray));
        if (typeof loadTagsIntoTagify === 'function') {
            loadTagsIntoTagify(itemTagsArray);
        }

        DialogManager.open('item-modal');
    });

    // Elevate z-index of card and grid column when dropdown menu is open
    const dropdownBtn = col.querySelector(`#dropdownMenuButton-${item.id}`);
    const cardEl = col.querySelector('.card');
    if (dropdownBtn && cardEl) {
        dropdownBtn.addEventListener('show.bs.dropdown', () => {
            col.classList.add('dropdown-open');
            cardEl.classList.add('dropdown-open');
            cardEl.style.zIndex = '1050';
            col.style.zIndex = '1050';
        });
        dropdownBtn.addEventListener('hidden.bs.dropdown', () => {
            col.classList.remove('dropdown-open');
            cardEl.classList.remove('dropdown-open');
            cardEl.style.zIndex = '';
            col.style.zIndex = '';
        });
    }

    // Return the created column element
    return col;
}


function handleQuantitySet(item, newQuantity) {
    if (!item || !item.id) return;
    const itemId = item.id;
    let quantity = parseInt(newQuantity, 10);
    if (isNaN(quantity) || quantity < 0) {
        quantity = 0;
    }
    item.quantity = quantity;

    // Update item card quantity display, stock badge and data attribute if present in DOM
    const quantityElement = document.getElementById(`quantity-${itemId}`);
    if (quantityElement) {
        quantityElement.textContent = quantity.toString();
        const colElement = quantityElement.closest('[data-quantity]');
        if (colElement) {
            colElement.dataset.quantity = quantity;
        }
    }
    const stockBadge = document.getElementById(`stock-badge-${itemId}`);
    if (stockBadge) {
        const badgeConfig = getStockBadgeConfig(quantity, item.min_quantity);
        stockBadge.className = `stock-badge ${badgeConfig.cls}`;
        stockBadge.textContent = badgeConfig.text;
    }

    if (typeof updateInventoryHealthUI === 'function') {
        updateInventoryHealthUI();
    }

    // Update stocktaking modal quantity display if currently showing this item
    const inventurAmount = document.getElementById('current-item-amount');
    if (inventurAmount && typeof currentnventurItemIndex !== 'undefined' && typeof fetchedItems !== 'undefined') {
        const activeInventurItem = fetchedItems[currentnventurItemIndex];
        if (activeInventurItem && activeInventurItem.id === itemId) {
            if ('value' in inventurAmount) {
                inventurAmount.value = quantity;
            } else {
                inventurAmount.textContent = quantity.toString();
            }
        }
    }

    // Create the updated item object
    const updatedItem = { quantity: quantity };

    // Make a fetch request to update the quantity in the database
    fetch(`/api/items/${itemId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Update-Quantity': 'true'  // Custom header to indicate quantity update
        },
        body: JSON.stringify(updatedItem),
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('Error updating quantity:', data.error);
            }
        })
        .catch(error => {
            console.error('Error updating quantity:', error);
        });
}


function handleQuantityChange(item, changeValue) {
    if (!item || !item.id) return;
    let currentQuantity = parseInt(item.quantity, 10);
    if (isNaN(currentQuantity)) {
        const quantityElement = document.getElementById(`quantity-${item.id}`);
        if (quantityElement) {
            currentQuantity = parseInt(quantityElement.textContent, 10);
        }
        if (isNaN(currentQuantity)) {
            currentQuantity = 0;
        }
    }
    handleQuantitySet(item, currentQuantity + changeValue);
}



function updateEmptyState(visibleCount, totalCount) {
    let emptyState = document.getElementById('items-empty-state');
    const itemsContainer = document.getElementById('items-container-grid');
    if (!itemsContainer) return;

    if (!emptyState) {
        emptyState = document.createElement('div');
        emptyState.id = 'items-empty-state';
        emptyState.className = 'grid-column-full empty-state-card text-center d-none';
        emptyState.innerHTML = `
            <div class="mb-3 text-secondary opacity-75">
                <i data-lucide="package-search" style="width: 48px; height: 48px; stroke-width: 1.5;"></i>
            </div>
            <h5 class="fw-semibold text-body-secondary mb-1" id="empty-state-title">No matching items found</h5>
            <p class="text-muted small mb-3" id="empty-state-desc">Try adjusting your search terms, changing tag filters, or add a new part.</p>
            <button type="button" class="btn btn-outline-primary btn-sm px-3" onclick="DialogManager.open('item-modal')">
                <span class="icon-n4px me-1"><i data-lucide="plus"></i></span>
                <span>Add Item</span>
            </button>`;
        itemsContainer.appendChild(emptyState);
    }

    if (visibleCount === 0) {
        emptyState.classList.remove('d-none');
        const titleEl = document.getElementById('empty-state-title');
        const descEl = document.getElementById('empty-state-desc');
        if (totalCount === 0) {
            if (titleEl) titleEl.textContent = "No items in this storage unit";
            if (descEl) descEl.textContent = "Get started by adding your first part or component to this cabinet.";
        } else {
            if (titleEl) titleEl.textContent = "No matching items found";
            if (descEl) descEl.textContent = "Try adjusting your search terms, clearing tag filters, or add a new part.";
        }
        if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    } else {
        emptyState.classList.add('d-none');
    }
}

function generateItemsGrid() {
    const itemsContainer = document.getElementById('items-container-grid');
    // Clear previous content in the container if needed
    itemsContainer.innerHTML = '';
    fetchedItems.forEach((item) => {
        const col = createItem(item)
        itemsContainer.appendChild(col);
    });

    updateEmptyState(fetchedItems.length, fetchedItems.length);

    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
    initialiseTooltips();
    updatePlacementHealthUI();
}
function getActiveEspTab() {
    if (typeof filterESP !== 'undefined' && Array.isArray(filterESP) && filterESP.length > 0) {
        return filterESP;
    }
    const activeTab = document.getElementById('espTabs')?.querySelector('.nav-link.active');
    if (activeTab && activeTab.dataset.filter && activeTab.dataset.filter !== "All Boxes") {
        return activeTab.dataset.filter;
    }
    return null;
}

function findIndexByIP(ip) {
    if (!ip) return 0;
    const targets = Array.isArray(ip) ? ip : [ip];
    const cleanTargets = targets
        .map(t => (t !== undefined && t !== null) ? String(t).trim().toLowerCase() : '')
        .filter(t => t.length > 0 && t !== 'all boxes');
    if (cleanTargets.length === 0) return 0;

    const options = Array.from(selectEspDropdown.options);
    for (let i = 0; i < options.length; i++) {
        const optionIp = (options[i].dataset.espIp || '').trim().toLowerCase();
        const optionName = (options[i].dataset.espName || '').trim().toLowerCase();
        if (cleanTargets.some(target => target === optionIp || target === optionName)) {
            return i;
        }
    }
    return 0;
}



function initialiseTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        const dialogParent = tooltipTriggerEl.closest('dialog.app-dialog');
        const container = dialogParent ? dialogParent : document.body;
        return new bootstrap.Tooltip(tooltipTriggerEl, { container: container });
    });
}

function resetModal(skipHide = false) {
    isEditingItem = false;
    isCopyingItem = false;
    editingItemId = null;
    editingItemIP = null;

    const nameInput = document.getElementById("item_name");
    if (nameInput) nameInput.value = "";
    const urlInput = document.getElementById("item_url");
    if (urlInput) urlInput.value = "";
    const imgInput = document.getElementById("item_image");
    if (imgInput) imgInput.value = "";
    const qtyInput = document.getElementById("item_quantity");
    if (qtyInput) qtyInput.value = "";
    const minQtyInput = document.getElementById("item_min_quantity");
    if (minQtyInput) minQtyInput.value = "3";
    const uploadInput = document.getElementById("item_image_upload");
    if (uploadInput) uploadInput.value = "";

    if (typeof updateItemImagePreview === 'function') {
        updateItemImagePreview('');
    }
    const tagsInput = document.getElementById("item_tags");
    if (tagsInput) tagsInput.value = "";
    if (typeof tagify !== 'undefined' && tagify && tagify.removeAllTags) {
        tagify.removeAllTags();
    }
    const errorAlert = document.getElementById("item-error-alert");
    if (errorAlert) errorAlert.classList.add("d-none");
    const errorList = document.getElementById("item-error-list");
    if (errorList) errorList.innerHTML = "";

    const modalLabel = document.getElementById("item-modal-label");
    if (modalLabel) {
        modalLabel.textContent = (typeof translation !== 'undefined' && translation.add_item) ? translation.add_item : "Add Item";
    }
    const saveBtnLabel = document.getElementById("item_add_btn_label");
    if (saveBtnLabel) {
        saveBtnLabel.textContent = (typeof translation !== 'undefined' && translation.add_btn_label) ? translation.add_btn_label : "Add";
    }

    removeLocalStorage();
    clearAll();
    clickedCells = [];

    if (!skipHide) {
        const modalEl = document.getElementById('item-modal');
        DialogManager.close('item-modal');
    }
}

let currentSortMethod = '';
let currentSortDirection = 'asc';

function parseItemPosition(val) {
    const pos = parsePositionsArray(val);
    if (pos.length === 0) return [999999, 999999];
    return [pos[0], pos[1] || 0];
}

function handleSortClick(sortMethod, event) {
    if (event) {
        event.preventDefault();
    }
    if (currentSortMethod === sortMethod) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortMethod = sortMethod;
    }
    sortItems(currentSortMethod, currentSortDirection);
}

function setSortDirection(direction, event) {
    if (event) {
        event.preventDefault();
    }
    currentSortDirection = direction;
    if (!currentSortMethod) {
        currentSortMethod = 'name';
    }
    sortItems(currentSortMethod, currentSortDirection);
}

function updateSortUI() {
    const ascBtn = document.getElementById('sort-dir-asc');
    const descBtn = document.getElementById('sort-dir-desc');
    if (ascBtn && descBtn) {
        if (currentSortDirection === 'asc') {
            ascBtn.classList.add('active');
            descBtn.classList.remove('active');
        } else {
            descBtn.classList.add('active');
            ascBtn.classList.remove('active');
        }
    }

    const methodMap = {
        'ip': 'sortBybox',
        'id': 'sortByid',
        'name': 'sortByname',
        'quantity': 'sortByquantity',
        'position': 'sortBylocation'
    };

    const arrowIcon = currentSortDirection === 'desc' ? 'arrow-down' : 'arrow-up';

    Object.entries(methodMap).forEach(([method, elemId]) => {
        const itemEl = document.getElementById(elemId);
        if (!itemEl) return;
        const indicator = itemEl.querySelector('.sort-indicator');

        if (method === currentSortMethod) {
            itemEl.classList.add('active');
            if (indicator) {
                indicator.innerHTML = `<i data-lucide="${arrowIcon}"></i>`;
            }
        } else {
            itemEl.classList.remove('active');
            if (indicator) {
                indicator.innerHTML = '';
            }
        }
    });

    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
}

function sortItems(sortMethod = currentSortMethod, direction = currentSortDirection) {
    currentSortMethod = sortMethod || 'name';
    currentSortDirection = direction || 'asc';

    const itemsContainer = document.getElementById('items-container-grid');
    if (!itemsContainer) return;
    const items = Array.from(itemsContainer.children);
    const modifier = currentSortDirection === 'desc' ? -1 : 1;

    const sortedItems = items.sort((a, b) => {
        if (typeof filterTags !== 'undefined' && filterTags.length > 1 && typeof tagFilterMode !== 'undefined' && tagFilterMode === 'any') {
            const scoreA = typeof getItemTagMatchScore === 'function' ? getItemTagMatchScore(a) : 0;
            const scoreB = typeof getItemTagMatchScore === 'function' ? getItemTagMatchScore(b) : 0;
            if (scoreB !== scoreA) {
                return scoreB - scoreA;
            }
        }

        let valA = a.dataset[currentSortMethod] ?? '';
        let valB = b.dataset[currentSortMethod] ?? '';

        if (currentSortMethod === 'quantity' || currentSortMethod === 'id') {
            const numA = parseInt(valA, 10) || 0;
            const numB = parseInt(valB, 10) || 0;
            if (numA !== numB) {
                return (numA - numB) * modifier;
            }
        } else if (currentSortMethod === 'position') {
            const posA = parseItemPosition(valA);
            const posB = parseItemPosition(valB);
            if (posA[0] !== posB[0]) {
                return (posA[0] - posB[0]) * modifier;
            }
            if (posA[1] !== posB[1]) {
                return (posA[1] - posB[1]) * modifier;
            }
        } else {
            // String comparison with natural numeric sorting
            const cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
            if (cmp !== 0) {
                return cmp * modifier;
            }
        }

        // Secondary tiebreaker: ID ascending
        const idA = parseInt(a.dataset.id, 10) || 0;
        const idB = parseInt(b.dataset.id, 10) || 0;
        return (idA - idB) * modifier;
    });

    const emptyState = document.getElementById('items-empty-state');
    // Clear and re-append in sorted order
    itemsContainer.innerHTML = '';
    sortedItems.forEach(item => {
        itemsContainer.appendChild(item);
    });
    if (emptyState) {
        itemsContainer.appendChild(emptyState);
    }

    updateSortUI();
}
const searchInput = document.getElementById("search");
const searchClearBtn = document.getElementById("search-clear-btn");

function filterItemsBySearch(text) {
    const searchText = (text || '').toLowerCase().trim();
    if (typeof applyItemFilters === 'function') {
        applyItemFilters();
    } else {
        const itemsContainer = document.getElementById('items-container-grid');
        if (!itemsContainer) return;
        const items = Array.from(itemsContainer.children).filter(el => el.classList.contains('item-col') && !el.classList.contains('skeleton-col'));
        let visibleCount = 0;
        const tokens = searchText.split(/\s+/).filter(Boolean);

        items.forEach((item) => {
            const itemName = (item.dataset["name"] || "").toLowerCase();
            let itemTags = (item.dataset["tags"] || "").toLowerCase();
            if (itemTags === 'undefined' || itemTags === 'null') itemTags = '';
            let itemEsp = (item.dataset["espName"] || "").toLowerCase();
            if (itemEsp === 'undefined' || itemEsp === 'null') itemEsp = '';

            const matches = tokens.length === 0 || tokens.every(token => {
                const rawToken = token.toLowerCase();
                const cleanToken = rawToken.replace(/^[#@]+/, '');
                if (!cleanToken) return itemTags.length > 0;
                return itemName.includes(rawToken) || 
                       itemName.includes(cleanToken) || 
                       (cleanToken && itemTags.includes(cleanToken)) || 
                       itemEsp.includes(rawToken);
            });
            if (matches) {
                item.style.display = "flex";
                visibleCount++;
            } else {
                item.style.display = "none";
            }
        });

        updateEmptyState(visibleCount, items.length);
    }

    if (searchClearBtn) {
        searchClearBtn.style.display = searchText ? 'inline-flex' : 'none';
    }
}

if (searchInput) {
    searchInput.addEventListener("input", function (e) {
        filterItemsBySearch(e.target.value);
    });
}

if (searchClearBtn) {
    searchClearBtn.addEventListener("click", function () {
        if (searchInput) {
            searchInput.value = "";
            filterItemsBySearch("");
            searchInput.focus();
        }
    });
}

// Global shortcut: press '/' or 'Ctrl+K' / 'Cmd+K' to focus search
document.addEventListener("keydown", function (e) {
    if ((e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    } else if (e.key === "Escape" && document.activeElement === searchInput) {
        if (searchInput.value) {
            searchInput.value = "";
            filterItemsBySearch("");
        } else {
            searchInput.blur();
        }
    }
});


const showAlert = (alertId, message, formType) => {
    const alert = document.getElementById(alertId);
    alert.classList.remove('d-none');

    const errorListId = formType === 'item' ? 'item-error-list' : 'error-list';
    const errorList = document.getElementById(errorListId);
    errorList.innerHTML = message;

    // Scroll to the top of the modal or page
    alert.scrollIntoView({ behavior: 'smooth' });
};


const handleEmptyFields = (formType) => {
    let emptyFields = [];
    let alertId = '';

    if (formType === 'esp') {
        const name = document.getElementById('esp_name').value;
        const esp_ip = document.getElementById('esp_ip').value;

        if (name.trim() === '') {
            emptyFields.push('Name');
        }
        if (esp_ip.trim() === '') {
            emptyFields.push('IP Address');
        }

        alertId ='esp-error-alert';
    } else if (formType === 'item') {
        const itemName = document.getElementById('item_name').value;
        const itemUrl = document.getElementById('item_url').value;
        const itemQuantity = document.getElementById('item_quantity').value;
        let position = localStorage.getItem('led_positions') || '[]';

        if (itemName.trim() === '') {
            emptyFields.push('Item Name');
        }
        if (itemUrl.trim() === '') {
            emptyFields.push('Item URL');
        }
        if (itemQuantity.trim() === '') {
            emptyFields.push('Item Quantity');
        }
        alertId = 'item-error-alert';
    }

    if (emptyFields.length > 0) {
        const message = "The following fields are empty:<br>" + emptyFields.map(field => `<li>${field}</li>`).join('');
        showAlert(alertId, message, formType);
        return true;
    }

    return false;
};



loadItems();
window.addEventListener('resize', function() {
    lucide.createIcons(); // This ensures icons are re-rendered if needed
});


// Function to fetch with timeout
function fetchWithTimeout(url, timeout = 1000) {  // Increase the timeout value to 10 seconds
    return Promise.race([
        fetch(url),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), timeout)
        )
    ]);
}

// Adding event listener to the cropAndSaveBtn for saving the cropped image
document.getElementById("cropAndSaveBtn").addEventListener("click", onCropAndSave);

// Event listener for the modal hide event to reset dataset
document.getElementById('cropImageModal').addEventListener('hidden.bs.modal', function () {
    resetModalAndCropper(this);
});

// Automatically hide and disable tooltips on dropdowns when opened to prevent covering menus
document.addEventListener('show.bs.dropdown', function (e) {
    const dropdown = e.target.closest('.dropdown') || e.target;
    if (!dropdown) return;
    const tooltip = (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) ?
        (bootstrap.Tooltip.getInstance(dropdown) ||
         bootstrap.Tooltip.getInstance(dropdown.querySelector('[data-bs-toggle="dropdown"]')) ||
         bootstrap.Tooltip.getInstance(dropdown.querySelector('.dropdown-toggle'))) : null;
    if (tooltip) {
        tooltip.hide();
        tooltip.disable();
    }
});

document.addEventListener('hidden.bs.dropdown', function (e) {
    const dropdown = e.target.closest('.dropdown') || e.target;
    if (!dropdown) return;
    const tooltip = (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) ?
        (bootstrap.Tooltip.getInstance(dropdown) ||
         bootstrap.Tooltip.getInstance(dropdown.querySelector('[data-bs-toggle="dropdown"]')) ||
         bootstrap.Tooltip.getInstance(dropdown.querySelector('.dropdown-toggle'))) : null;
    if (tooltip) {
        tooltip.enable();
    }
});

document.addEventListener('click', function (e) {
    const toggleBtn = e.target.closest('[data-bs-toggle="dropdown"]');
    if (toggleBtn) {
        const dropdown = toggleBtn.closest('.dropdown');
        const tooltip = (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) ?
            ((dropdown && bootstrap.Tooltip.getInstance(dropdown)) ||
             bootstrap.Tooltip.getInstance(toggleBtn)) : null;
        if (tooltip) {
            tooltip.hide();
        }
    }
    const offcanvasBtn = e.target.closest('[data-bs-toggle="offcanvas"]');
    if (offcanvasBtn) {
        const tooltipEl = document.getElementById('settings_btn_tooltip');
        if (tooltipEl) {
            const tooltip = (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) ?
                bootstrap.Tooltip.getInstance(tooltipEl) : null;
            if (tooltip) {
                tooltip.hide();
            }
        }
    }
});

document.addEventListener('show.bs.offcanvas', function () {
    const tooltipEl = document.getElementById('settings_btn_tooltip');
    if (tooltipEl) {
        const tooltip = (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) ?
            bootstrap.Tooltip.getInstance(tooltipEl) : null;
        if (tooltip) {
            tooltip.hide();
            tooltip.disable();
        }
    }
});

document.addEventListener('hidden.bs.offcanvas', function () {
    const tooltipEl = document.getElementById('settings_btn_tooltip');
    if (tooltipEl) {
        const tooltip = (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) ?
            bootstrap.Tooltip.getInstance(tooltipEl) : null;
        if (tooltip) {
            tooltip.enable();
        }
    }
});

// Auto-close collapsed mobile navbar on outside clicks, item clicks, focus loss, and escape
function closeNavbarCollapse() {
    const navbarCollapse = document.getElementById('navbarCollapse');
    if (navbarCollapse && navbarCollapse.classList.contains('show')) {
        const bsCollapse = (typeof bootstrap !== 'undefined' && bootstrap.Collapse) ?
            (bootstrap.Collapse.getInstance(navbarCollapse) || new bootstrap.Collapse(navbarCollapse, { toggle: false })) : null;
        if (bsCollapse) {
            bsCollapse.hide();
        } else {
            navbarCollapse.classList.remove('show');
        }
    }
}

document.addEventListener('click', function (e) {
    const navbar = document.querySelector('.app-navbar');
    if (!navbar) return;

    // If click is outside navbar, close collapsed menu
    if (!navbar.contains(e.target)) {
        closeNavbarCollapse();
        return;
    }

    // If an action button/link inside navbarCollapse was clicked (e.g. Add Item, Builds, Map)
    const actionBtn = e.target.closest('#navbarCollapse button:not(.dropdown-toggle), #navbarCollapse a:not(.dropdown-toggle)');
    if (actionBtn) {
        closeNavbarCollapse();
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeNavbarCollapse();
    }
});

document.addEventListener('show.bs.modal', function () {
    closeNavbarCollapse();
});

document.addEventListener('show.bs.offcanvas', function () {
    closeNavbarCollapse();
});

document.querySelector('.app-navbar')?.addEventListener('focusout', function () {
    setTimeout(() => {
        const navbar = document.querySelector('.app-navbar');
        if (navbar && !navbar.contains(document.activeElement)) {
            closeNavbarCollapse();
        }
    }, 150);
});

// Clamp navbar dropdown menus within viewport boundaries to prevent right or left cutoff
document.addEventListener('shown.bs.dropdown', function (e) {
    const toggleBtn = e.target.classList?.contains('dropdown-toggle') ? e.target : e.target.querySelector?.('.dropdown-toggle');
    const menu = toggleBtn?.closest('.dropdown')?.querySelector('.dropdown-menu') || e.target.querySelector?.('.dropdown-menu');
    if (!menu) return;

    const margin = 10;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const rect = menu.getBoundingClientRect();

    if (rect.right > viewportWidth - margin) {
        const overflow = rect.right - (viewportWidth - margin);
        menu.style.transform = `translateX(-${overflow}px)`;
    } else if (rect.left < margin) {
        const underflow = margin - rect.left;
        menu.style.transform = `translateX(${underflow}px)`;
    }
});

document.addEventListener('hidden.bs.dropdown', function (e) {
    const toggleBtn = e.target.classList?.contains('dropdown-toggle') ? e.target : e.target.querySelector?.('.dropdown-toggle');
    const menu = toggleBtn?.closest('.dropdown')?.querySelector('.dropdown-menu') || e.target.querySelector?.('.dropdown-menu');
    if (menu) {
        menu.style.transform = '';
        menu.style.marginLeft = '';
    }
});

// Unassigned / Placement drawer filter trigger
document.getElementById('drawer-filter-grid-btn')?.addEventListener('click', toggleFilterGridToUnassigned);

// Drawer tabs switch listener
document.getElementById('drawer-tabs')?.addEventListener('shown.bs.tab', (event) => {
    const targetId = event.target.getAttribute('id');
    if (targetId === 'tab-placement-btn') inventoryHealthData.activeDrawerTab = 'placement';
    else if (targetId === 'tab-out-of-stock-btn') inventoryHealthData.activeDrawerTab = 'out_of_stock';
    else if (targetId === 'tab-low-stock-btn') inventoryHealthData.activeDrawerTab = 'low_stock';

    if (typeof updateFilterButtonText === 'function') {
        updateFilterButtonText();
    }
});

// Initialize status pills toggles in Settings
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStatusPillsSettings);
} else {
    initStatusPillsSettings();
}
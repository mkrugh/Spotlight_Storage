let mapModal = null;
let mapModalVisible = false;
let currentMapEsp = null;
let currentSelectedLed = null;
let currentMapZoom = 1;
let movingItem = null;

function getGlobalItems() {
    if (typeof fetchedItems !== 'undefined' && Array.isArray(fetchedItems) && fetchedItems.length > 0) {
        return fetchedItems;
    }
    if (window.fetchedItems && Array.isArray(window.fetchedItems)) {
        return window.fetchedItems;
    }
    return [];
}

document.addEventListener('DOMContentLoaded', function () {
    const modalEl = document.getElementById('map-modal');
    if (modalEl) {
        mapModal = { show: () => DialogManager.open('map-modal'), hide: () => DialogManager.close('map-modal') };
        modalEl.addEventListener('shown.bs.modal', () => { mapModalVisible = true; });
        modalEl.addEventListener('hidden.bs.modal', () => {
            mapModalVisible = false;
            currentSelectedLed = null;
            movingItem = null;
            document.getElementById('map-move-banner')?.classList.add('d-none');
        });
    }

    const gridView = document.getElementById('map-drawer-grid-view');
    const updateZoom = () => {
        if (gridView) gridView.style.zoom = currentMapZoom;
    };

    document.getElementById('map-zoom-in')?.addEventListener('click', () => {
        currentMapZoom = Math.min(currentMapZoom + 0.25, 3);
        updateZoom();
    });

    document.getElementById('map-zoom-out')?.addEventListener('click', () => {
        currentMapZoom = Math.max(currentMapZoom - 0.25, 0.5);
        updateZoom();
    });

    document.getElementById('map-zoom-reset')?.addEventListener('click', () => {
        currentMapZoom = 1;
        updateZoom();
    });

    // Delegated click handler for controller picker
    document.getElementById('map-esp-picker')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="select-esp"]');
        if (!btn || !btn.dataset.espId) return;
        const espList = (typeof ESPs !== 'undefined' && ESPs.length > 0) ? ESPs : (window.ESPs || []);
        const targetEsp = espList.find(x => String(x.id) === String(btn.dataset.espId));
        if (targetEsp) showMapForEsp(targetEsp);
    });

    // Delegated click handler for drawer grid cards
    document.getElementById('map-drawer-grid-view')?.addEventListener('click', (e) => {
        const card = e.target.closest('.map-drawer-card');
        if (card && card.dataset.led !== undefined) {
            selectDrawer(parseInt(card.dataset.led, 10));
        }
    });

    // Move banner cancel
    document.getElementById('map-move-cancel-btn')?.addEventListener('click', () => {
        movingItem = null;
        document.getElementById('map-move-banner').classList.add('d-none');
    });

    // Delegated click handler for orphaned / out-of-bounds side panel & inspector actions
    document.getElementById('map-side-panel')?.addEventListener('click', (e) => {
        const startMoveBtn = e.target.closest('[data-action="start-move"]');
        if (startMoveBtn && startMoveBtn.dataset.itemId) {
            const itemId = startMoveBtn.dataset.itemId;
            const items = getGlobalItems();
            let item = items.find(i => String(i.id) === String(itemId));

            const initiateMove = (targetItem) => {
                if (!targetItem) return;
                movingItem = {
                    id: targetItem.id,
                    name: targetItem.name || 'Part',
                    oldLedNum: currentSelectedLed,
                    oldEspIp: currentMapEsp ? currentMapEsp.esp_ip : ''
                };
                const bannerText = document.getElementById('map-move-banner-text');
                if (bannerText) bannerText.textContent = `Select a new bin to move "${targetItem.name}" to.`;
                const moveBanner = document.getElementById('map-move-banner');
                if (moveBanner) {
                    moveBanner.classList.remove('d-none');
                }
                if (window.lucide && lucide.createIcons) lucide.createIcons();
            };

            if (item) {
                initiateMove(item);
            } else {
                fetch(`/api/items/${itemId}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(fetched => {
                        if (fetched) initiateMove(fetched);
                    })
                    .catch(err => console.error("Error fetching item for move:", err));
            }
            return;
        }

        const assignEmptyBtn = e.target.closest('[data-action="assign-empty-bin"]');
        if (assignEmptyBtn) {
            const espIp = assignEmptyBtn.dataset.espIp;
            const espId = assignEmptyBtn.dataset.espId;
            const ledNum = parseInt(assignEmptyBtn.dataset.ledNum, 10);
            assignPartFromMap(espId, espIp, ledNum);
            return;
        }

        const reassignBtn = e.target.closest('[data-action="reassign-item"]');
        if (reassignBtn && reassignBtn.dataset.itemId) {
            if (window.openAssignPlacement) window.openAssignPlacement(reassignBtn.dataset.itemId);
            return;
        }
        const openDrawerBtn = e.target.closest('[data-action="open-placement-drawer"]');
        if (openDrawerBtn) {
            if (window.DialogManager) DialogManager.close('map-modal');
            if (window.openPlacementDrawer) window.openPlacementDrawer();
            return;
        }
    });
});

document.getElementById('open-map-btn')?.addEventListener('click', openMapModal);

function isItemLowStock(item) {
    if (!item) return false;
    const qty = parseInt(item.quantity, 10) || 0;
    const minQty = (item.min_quantity !== undefined && item.min_quantity !== null && item.min_quantity !== '' && !isNaN(parseInt(item.min_quantity, 10)))
        ? parseInt(item.min_quantity, 10)
        : 3;
    return qty <= minQty;
}

function formatCabinetDropdownLabel(e) {
    const name = e.name || ('Cabinet ' + e.id);
    const total = (e.total_bins !== undefined && e.total_bins !== null) ? parseInt(e.total_bins, 10) : 0;
    const occupied = (e.occupied_bins !== undefined && e.occupied_bins !== null) ? parseInt(e.occupied_bins, 10) : 0;

    let metricText = '';
    if (total <= 0) {
        metricText = (window.t ? window.t('cabinet_unconfigured') : 'Unconfigured');
    } else if (occupied > total) {
        metricText = window.t
            ? window.t('cabinet_bins_overcapacity', { occupied, total })
            : `${occupied}/${total} bins · 100% full · Overcapacity`;
    } else if (occupied === total) {
        metricText = window.t
            ? window.t('cabinet_bins_full', { occupied, total })
            : `${occupied}/${total} bins · 100% full · Full`;
    } else {
        const percent = Math.round((occupied / total) * 100);
        metricText = window.t
            ? window.t('cabinet_bins_metric', { occupied, total, percent })
            : `${occupied}/${total} bins · ${percent}% full`;
    }

    return `${name} (${metricText})`;
}

function populateMapEspDropdown(selectedEsp) {
    const selectEl = document.getElementById('map-esp-select');
    const selectWrapper = document.getElementById('map-esp-select-wrapper');
    if (!selectEl) return;

    selectEl.innerHTML = '';
    (ESPs || []).forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = formatCabinetDropdownLabel(e);
        selectEl.appendChild(opt);
    });

    if (selectedEsp) {
        selectEl.value = selectedEsp.id;
    }

    selectEl.onchange = function () {
        const selectedId = this.value;
        const chosen = (ESPs || []).find(e => String(e.id) === String(selectedId));
        if (chosen) {
            showMapForEsp(chosen);
        }
    };

    if (selectWrapper) {
        selectWrapper.style.display = (ESPs || []).length > 1 ? 'flex' : 'none';
    }
}

async function openMapModal() {
    if ((!ESPs || ESPs.length === 0) && typeof fetchedEsps !== 'undefined' && fetchedEsps.length > 0) {
        ESPs = fetchedEsps;
    }

    const resolveInitialEsp = (espList) => {
        let esp = null;
        let activeFilter = null;
        if (typeof getActiveEspTab === 'function') {
            activeFilter = getActiveEspTab();
        } else if (typeof filterESP !== 'undefined' && filterESP.length > 0) {
            activeFilter = filterESP;
        }

        if (activeFilter) {
            const filterTargets = Array.isArray(activeFilter) ? activeFilter : [activeFilter];
            const cleanTargets = filterTargets
                .map(t => (t !== undefined && t !== null) ? String(t).trim().toLowerCase() : '')
                .filter(t => t.length > 0 && t !== 'all boxes');

            if (cleanTargets.length > 0) {
                esp = espList.find(e =>
                    cleanTargets.some(target =>
                        target === String(e.id).toLowerCase() ||
                        target === (e.name || '').trim().toLowerCase() ||
                        target === (e.esp_ip || '').trim().toLowerCase()
                    )
                );
            }
        }

        if (!esp && espList.length > 0) {
            esp = espList[0];
        }
        return esp;
    };

    // If we have cached controllers, render and open the modal immediately
    if (ESPs && ESPs.length > 0) {
        const initialEsp = resolveInitialEsp(ESPs);
        populateMapEspDropdown(initialEsp);
        if (initialEsp) {
            showMapForEsp(initialEsp);
        } else {
            showEspPicker();
        }
    } else {
        // If not in memory yet, open modal with loading state immediately
        if (!mapModalVisible) mapModal.show();
        const gridView = document.getElementById('map-drawer-grid-view');
        if (gridView) {
            gridView.innerHTML = '<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Loading cabinet map...</div>';
        }
    }

    // Refresh ESP metrics and items concurrently in parallel
    try {
        const [freshEsps, freshItems] = await Promise.all([
            fetch('/api/esp?include_metrics=true').then(r => r.ok ? r.json() : []).catch(() => []),
            fetch('/api/items').then(r => r.ok ? r.json() : []).catch(() => [])
        ]);

        if (Array.isArray(freshEsps) && freshEsps.length > 0) {
            ESPs = freshEsps;
            window.ESPs = freshEsps;
        }
        if (Array.isArray(freshItems) && freshItems.length > 0) {
            fetchedItems = freshItems;
        }

        if (!ESPs || ESPs.length === 0) {
            alert('No ESP devices configured.');
            if (mapModalVisible) mapModal.hide();
            return;
        }

        const activeTargetEsp = currentMapEsp
            ? (ESPs.find(e => String(e.id) === String(currentMapEsp.id)) || resolveInitialEsp(ESPs))
            : resolveInitialEsp(ESPs);

        populateMapEspDropdown(activeTargetEsp);

        if (mapModalVisible) {
            if (activeTargetEsp) {
                showMapForEsp(activeTargetEsp);
            } else {
                showEspPicker();
            }
        }
    } catch (e) {
        console.error('Error refreshing map data in background:', e);
    }
}

function showEspPicker() {
    document.getElementById('map-modal-title').textContent = 'Select a storage location';
    document.getElementById('map-esp-picker').innerHTML =
        ESPs.map(e =>
            `<button class="btn btn-outline-secondary me-2 mb-2" data-action="select-esp" data-esp-id="${escapeHtml(String(e.id))}">${escapeHtml(e.name)}</button>`
        ).join('');
    document.getElementById('map-esp-picker').classList.remove('d-none');
    document.getElementById('map-canvas-container').classList.add('d-none');
    document.getElementById('map-side-panel').classList.add('d-none');
    if (!mapModalVisible) mapModal.show();
}

function showMapForEsp(esp) {
    currentMapEsp = esp;
    currentSelectedLed = null;

    const titleEl = document.getElementById('map-modal-title');
    if (titleEl) titleEl.textContent = 'Map';

    const selectEl = document.getElementById('map-esp-select');
    if (selectEl && String(selectEl.value) !== String(esp.id)) {
        selectEl.value = esp.id;
    }

    const container = document.getElementById('map-canvas-container');
    if (container) {
        container.style.overflowX = 'auto';
        container.style.overflowY = 'auto';
    }

    document.getElementById('map-esp-picker')?.classList.add('d-none');
    container?.classList.remove('d-none');
    document.getElementById('map-side-panel')?.classList.remove('d-none');
    resetMapPanel();

    renderMapGrid(esp);
    if (window.lucide && lucide.createIcons) lucide.createIcons();

    if (!mapModalVisible) {
        mapModal.show();
    }
}

function resetMapPanel() {
    currentSelectedLed = null;
    const inspector = document.getElementById('map-inspector-content');
    if (inspector) {
        inspector.innerHTML = `
            <div class="p-3 rounded border text-muted small text-center bg-body-tertiary">
                Click any drawer position on the map to inspect stored parts.
            </div>
        `;
    }
    const heading = document.getElementById('map-items-heading');
    if (heading) heading.textContent = '';
    const list = document.getElementById('map-items-list');
    if (list) {
        list.innerHTML = '<p class="text-muted small">Click any drawer position on the map to inspect stored parts.</p>';
    }
}

function renderMapGrid(esp) {
    const container = document.getElementById('map-drawer-grid-view');
    if (!container) return;

    const occupancy = buildOccupancyMap(esp);
    const isMulti = esp.sections && Array.isArray(esp.sections) && esp.sections.length > 0;

    let totalDrawers = 0;
    let gridHtml = '';

    if (isMulti) {
        const normalizedSections = esp.sections.map(s => ({
            name: s.name || '',
            rows: Math.max(1, parseInt(s.rows, 10) || 1),
            cols: Math.max(1, parseInt(s.cols, 10) || 1),
            start_left: String(s.start_left || 'left').toLowerCase() === '1' ? 'right' : String(s.start_left || 'left').toLowerCase(),
            start_top: String(s.start_top || 'top').toLowerCase(),
            serpentine_direction: String(s.serpentine_direction || 'horizontal').toLowerCase() === '1' ? 'vertical' : String(s.serpentine_direction || 'horizontal').toLowerCase()
        }));

        totalDrawers = normalizedSections.reduce((sum, s) => sum + s.rows * s.cols, 0);
        let cumLedOffset = 0;

        gridHtml = normalizedSections.map((s, secIdx) => {
            let sectionCellsHtml = '';
            for (let r = 0; r < s.rows; r++) {
                for (let c = 0; c < s.cols; c++) {
                    const localLed = calculateLedNumber(r, c, s.start_left, s.start_top, s.serpentine_direction, s.rows, s.cols);
                    const ledNum = cumLedOffset + localLed;
                    const items = occupancy[ledNum] || [];
                    const isSelected = currentSelectedLed === ledNum;
                    sectionCellsHtml += createDrawerCardHtml(ledNum, items, isSelected);
                }
            }
            cumLedOffset += s.rows * s.cols;

            const headerHtml = normalizedSections.length > 1
                ? `<div class="d-flex align-items-center justify-content-between mb-2 mt-3 text-muted small fw-bold">
                       <span>${escapeHtml(s.name || `Section ${secIdx + 1}`)}</span>
                       <span>${s.cols} cols × ${s.rows} rows</span>
                   </div>`
                : '';

            return `
                ${headerHtml}
                <div class="map-drawer-grid mb-3" style="grid-template-columns: repeat(${s.cols}, minmax(0, 1fr));">
                    ${sectionCellsHtml}
                </div>
            `;
        }).join('');

    } else {
        const rows = Math.max(1, parseInt(esp.rows, 10) || 1);
        const columns = Math.max(1, parseInt(esp.cols, 10) || 1);
        let startX = String(esp.start_left || 'left').toLowerCase();
        let startY = String(esp.start_top || 'top').toLowerCase();
        let serpDir = String(esp.serpentine_direction || 'horizontal').toLowerCase();
        if (startX === '1') startX = 'right';
        if (serpDir === '1') serpDir = 'vertical';

        totalDrawers = rows * columns;
        let cellsHtml = '';
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < columns; c++) {
                const ledNum = calculateLedNumber(r, c, startX, startY, serpDir, rows, columns);
                const items = occupancy[ledNum] || [];
                const isSelected = currentSelectedLed === ledNum;
                cellsHtml += createDrawerCardHtml(ledNum, items, isSelected);
            }
        }

        gridHtml = `
            <div class="map-drawer-grid" style="grid-template-columns: repeat(${columns}, minmax(0, 1fr));">
                ${cellsHtml}
            </div>
        `;
    }

    container.innerHTML = gridHtml;

    // Calculate live occupancy stats
    let occupiedCount = 0;
    for (let i = 1; i <= totalDrawers; i++) {
        if (occupancy[i] && occupancy[i].length > 0) {
            occupiedCount++;
        }
    }
    const pct = totalDrawers > 0 ? Math.round((occupiedCount / totalDrawers) * 100) : 0;
    const occTextEl = document.getElementById('map-occupancy-text');
    if (occTextEl) {
        occTextEl.textContent = `${occupiedCount} / ${totalDrawers} drawers occupied (${pct}%)`;
    }

    // Check for out-of-bounds / orphaned parts assigned to bins beyond cabinet capacity
    const orphanBanner = document.getElementById('map-orphan-banner');
    const orphanBannerText = document.getElementById('map-orphan-banner-text');
    const orphanViewBtn = document.getElementById('map-orphan-view-btn');

    const orphanedKeys = Object.keys(occupancy).filter(k => {
        const n = parseInt(k, 10);
        return !isNaN(n) && n > totalDrawers && occupancy[k] && occupancy[k].length > 0;
    });

    const orphanedList = [];
    const seenIds = new Set();
    orphanedKeys.forEach(k => {
        const binNum = parseInt(k, 10);
        (occupancy[k] || []).forEach(item => {
            const id = item.id || item.name;
            if (!seenIds.has(id)) {
                seenIds.add(id);
                orphanedList.push({ item, invalidBin: binNum });
            }
        });
    });

    if (orphanBanner && orphanBannerText) {
        if (orphanedList.length > 0) {
            orphanBannerText.innerHTML = `<strong>${orphanedList.length} part${orphanedList.length > 1 ? 's' : ''}</strong> assigned to bins exceeding cabinet capacity (${totalDrawers} drawers).`;
            orphanBanner.classList.remove('d-none');
            if (orphanViewBtn) {
                orphanViewBtn.onclick = () => renderOrphanInspector(orphanedList, esp, totalDrawers);
            }
        } else {
            orphanBanner.classList.add('d-none');
        }
    }
}

function renderOrphanInspector(orphanedList, esp, totalDrawers) {
    const container = document.getElementById('map-inspector-content');
    if (!container) return;

    // Deselect any selected drawer card in the grid
    const allCards = document.querySelectorAll('#map-drawer-grid-view .map-drawer-card');
    allCards.forEach(c => c.classList.remove('drawer-selected'));
    currentSelectedLed = null;

    const itemsHtml = orphanedList.map(({ item, invalidBin }) => {
        const itemId = item.id;
        const name = escapeHtml(item.name || 'Unnamed Item');
        return `
            <div class="p-2 mb-2 rounded border bg-body-tertiary d-flex flex-column gap-1">
                <div class="d-flex align-items-center justify-content-between">
                    <span class="fw-bold text-truncate" title="${name}">${name}</span>
                    <span class="badge location-badge-warning">Bin #${invalidBin}</span>
                </div>
                <div class="d-flex align-items-center justify-content-between mt-1">
                    <span class="small text-danger" style="font-size:0.75rem;">Exceeds limit (${totalDrawers})</span>
                    <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2" style="font-size:0.75rem;" data-action="reassign-item" data-item-id="${escapeHtml(String(itemId))}">
                        Reassign
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="map-inspector-card">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="fw-bold text-warning d-flex align-items-center gap-1">
                    <i data-lucide="alert-triangle" style="width:16px;height:16px;"></i>
                    Out-of-Bounds Parts
                </span>
                <span class="badge bg-warning-subtle text-warning-emphasis border border-warning">${orphanedList.length}</span>
            </div>
            <p class="text-muted small mb-2">
                These parts have positions assigned beyond cabinet "${escapeHtml(esp.name || 'Cabinet')}"'s current capacity (${totalDrawers} drawers).
            </p>
            <div class="overflow-auto pe-1" style="max-height: 260px;">
                ${itemsHtml}
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm w-100 mt-2" data-action="open-placement-drawer">
                Open Placement Drawer
            </button>
        </div>
    `;
    if (window.lucide && lucide.createIcons) lucide.createIcons();
}

function createDrawerCardHtml(ledNum, items, isSelected) {
    const isEmpty = !items || items.length === 0;
    const paddedNum = String(ledNum).padStart(2, '0');

    if (isEmpty) {
        return `
            <div class="map-drawer-card map-drawer-empty ${isSelected ? 'drawer-selected' : ''}" data-led="${ledNum}">
                <div class="drawer-bin-num">#${paddedNum}</div>
                <div class="text-center small font-italic opacity-75 my-auto text-truncate" style="font-size:0.72rem;">Empty</div>
                <div style="height: 6px;"></div>
            </div>
        `;
    }

    const primary = items[0];
    const extraCount = items.length - 1;
    const isLow = items.some(it => isItemLowStock(it));
    const qty = parseInt(primary.quantity, 10) || 0;

    return `
        <div class="map-drawer-card ${isLow ? 'map-drawer-low' : 'map-drawer-occupied'} ${isSelected ? 'drawer-selected' : ''}" data-led="${ledNum}">
            <div class="d-flex align-items-center justify-content-between overflow-hidden text-nowrap" style="min-width:0;">
                <span class="drawer-bin-num flex-shrink-0">#${paddedNum}</span>
                <div class="d-flex align-items-center gap-1 flex-shrink-0">
                    ${extraCount > 0 ? `<span class="drawer-tag-extra">+${extraCount}</span>` : ''}
                    ${isLow ? `<span class="drawer-tag-low">Low</span>` : ''}
                </div>
            </div>
            <div class="drawer-title-clamp" title="${escapeHtml(primary.name || '')}">
                ${escapeHtml(primary.name || '')}
            </div>
            <div class="d-flex align-items-center justify-content-between pt-1 overflow-hidden" style="min-width:0;">
                <span class="text-muted fw-semibold flex-shrink-0" style="font-size:0.65rem;">Qty:</span>
                <span class="${isLow ? 'drawer-qty-pill-low' : 'drawer-qty-pill-occ'} text-truncate" style="max-width:55px;">
                    ${qty}
                </span>
            </div>
        </div>
    `;
}

function selectDrawer(ledNum) {
    if (movingItem) {
        if (ledNum === movingItem.oldLedNum && currentMapEsp && currentMapEsp.esp_ip === movingItem.oldEspIp) {
            // Cancel move if they click the same bin
            movingItem = null;
            document.getElementById('map-move-banner')?.classList.add('d-none');
        } else {
            executeMoveOrSwap(movingItem, currentMapEsp, ledNum);
            return;
        }
    }

    currentSelectedLed = ledNum;

    // Update selection styling on cards
    const allCards = document.querySelectorAll('#map-drawer-grid-view .map-drawer-card');
    allCards.forEach(c => {
        if (parseInt(c.dataset.led, 10) === ledNum) {
            c.classList.add('drawer-selected');
        } else {
            c.classList.remove('drawer-selected');
        }
    });

    if (!currentMapEsp) return;
    const occupancy = buildOccupancyMap(currentMapEsp);
    const items = occupancy[ledNum] || [];

    renderDrawerInspector(ledNum, items, currentMapEsp);
    renderMapItems(ledNum, items);
}

function renderDrawerInspector(ledNum, items, esp) {
    const container = document.getElementById('map-inspector-content');
    if (!container) return;

    if (!ledNum) {
        container.innerHTML = `
            <div class="p-3 rounded border text-muted small text-center bg-body-tertiary">
                Click any drawer position on the map to inspect stored parts.
            </div>
        `;
        return;
    }

    if (!items || items.length === 0) {
        const btnLabel = (window.t ? window.t('assign_part_to_bin') : 'Assign Part to this Bin');
        container.innerHTML = `
            <div class="map-inspector-card">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="fw-bold">Drawer #${ledNum}</span>
                    <span class="badge bg-secondary-subtle text-secondary border">Empty Bin</span>
                </div>
                <p class="text-muted small mb-3">This drawer position is currently unassigned and available for storage.</p>
                <button type="button" class="btn btn-primary btn-sm w-100 d-flex align-items-center justify-content-center gap-2"
                        data-action="assign-empty-bin"
                        data-esp-ip="${escapeHtml(esp.esp_ip || '')}"
                        data-esp-id="${escapeHtml(String(esp.id || ''))}"
                        data-led-num="${ledNum}">
                    <i data-lucide="plus-circle" style="width:16px;height:16px;"></i>
                    <span>${escapeHtml(btnLabel)}</span>
                </button>
            </div>
        `;
        if (window.lucide && lucide.createIcons) {
            lucide.createIcons({ root: container });
        }
        return;
    }

    const isLow = items.some(it => isItemLowStock(it));

    container.innerHTML = `
        <div class="map-inspector-card">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <div>
                    <div class="fw-bold">Drawer #${ledNum}</div>
                    <div class="small text-muted">${escapeHtml(esp.name || '')}</div>
                </div>
                <span class="badge ${isLow ? 'bg-danger-subtle text-danger border border-danger-subtle' : 'bg-warning-subtle text-warning border border-warning-subtle'} px-2 py-1 fw-bold text-uppercase" style="font-size:0.68rem;">
                    ${isLow ? '⚠ Low Stock' : 'Occupied'}
                </span>
            </div>

            <div class="d-flex flex-column gap-2 pt-2 border-top">
                ${items.map(item => {
                    const itemLow = isItemLowStock(item);
                    return `
                        <div class="map-inspector-item-card">
                            <div class="d-flex align-items-start gap-2">
                                ${item.image
                                    ? `<img src="${safeUrl(item.image)}" style="width:38px;height:38px;object-fit:cover;flex-shrink:0;" class="rounded border" alt="${escapeHtml(item.name || '')}" loading="lazy" decoding="async">`
                                    : `<div style="width:38px;height:38px;flex-shrink:0;" class="rounded border bg-secondary-subtle d-flex align-items-center justify-content-center text-muted"><i data-lucide="package" class="icon-n4px"></i></div>`
                                }
                                <div class="flex-grow-1 overflow-hidden">
                                    <div class="fw-bold small text-truncate" title="${escapeHtml(item.name || '')}">${escapeHtml(item.name || '')}</div>
                                    <div class="d-flex align-items-center justify-content-between small mt-1">
                                        <span class="text-muted">Stock:</span>
                                        <span class="fw-bold ${itemLow ? 'text-danger' : 'text-warning-emphasis'}">${parseInt(item.quantity, 10) || 0} pcs</span>
                                    </div>
                                    ${item.min_quantity !== undefined && item.min_quantity !== null && item.min_quantity !== ''
                                        ? `<div class="d-flex align-items-center justify-content-between text-muted" style="font-size:0.72rem;"><span>Alert threshold:</span><span>≤ ${item.min_quantity}</span></div>`
                                        : ''}
                                    ${item.link
                                        ? `<div class="mt-1"><a href="${safeUrl(item.link)}" target="_blank" rel="noopener noreferrer" class="small text-primary text-decoration-none">Supplier link ↗</a></div>`
                                        : ''}
                                    <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 mt-2 w-100 d-flex align-items-center justify-content-center gap-1"
                                            data-action="start-move" data-item-id="${item.id}" style="font-size: 0.72rem;">
                                        <i data-lucide="move" style="width: 14px; height: 14px;"></i> Move Part
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    if (window.lucide && lucide.createIcons) {
        lucide.createIcons({ root: container });
    }
}


function drawMapCanvas(esp) {
    if (esp.sections && Array.isArray(esp.sections) && esp.sections.length > 0) {
        drawMultiSectionMap(esp);
        return;
    }

    const rows = parseInt(esp.rows);
    const columns = parseInt(esp.cols);
    let startX = String(esp.start_left).toLowerCase();
    let startY = String(esp.start_top).toLowerCase();
    let serpDir = String(esp.serpentine_direction).toLowerCase();
    if (startX === '1') startX = 'right';
    if (serpDir === '1') serpDir = 'vertical';

    const container = document.getElementById('map-canvas-container');
    const canvas = document.getElementById('map-responsive-canvas');
    const lw = 2;

    let containerWidth = container.clientWidth - 4;
    let boxSize = (containerWidth - lw) / columns;
    if (boxSize <= 60) {
        boxSize = 60;
        canvas.width = boxSize * columns + lw;
    } else {
        canvas.width = containerWidth;
    }
    canvas.height = boxSize * rows + lw;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    ctx.strokeStyle = '#6c757d';
    ctx.lineWidth = lw;
    const half = lw / 2;
    for (let i = 0; i <= rows; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * boxSize + half);
        ctx.lineTo(canvas.width, i * boxSize + half);
        ctx.stroke();
    }
    for (let j = 0; j <= columns; j++) {
        ctx.beginPath();
        ctx.moveTo(j * boxSize + half, 0);
        ctx.lineTo(j * boxSize + half, canvas.height);
        ctx.stroke();
    }

    const occupancy = buildOccupancyMap(esp);
    const dark = localStorage.getItem('theme') === 'dark';

    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < columns; j++) {
            const ledNum = calculateLedNumber(i, j, startX, startY, serpDir, rows, columns);
            const cx = j * boxSize + boxSize / 2 + half;
            const cy = i * boxSize + boxSize / 2 + half;
            const hasItems = !!(occupancy[ledNum] && occupancy[ledNum].length > 0);

            ctx.beginPath();
            ctx.arc(cx, cy, hasItems ? boxSize / 8 : boxSize / 15, 0, Math.PI * 2);
            ctx.fillStyle = hasItems ? '#fd7e14' : '#ffc107';
            ctx.fill();

            ctx.fillStyle = dark ? 'white' : 'black';
            ctx.font = `${boxSize / 5}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(ledNum), cx + boxSize / 5, cy - boxSize / 5);
        }
    }

    canvas.onclick = (e) => handleMapClick(e, esp, boxSize, lw, startX, startY, serpDir);
    setupMapHoverTracking(esp, false, boxSize, lw, startX, startY, serpDir);
}

function drawMultiSectionMap(esp) {
    const container = document.getElementById('map-canvas-container');
    const canvas = document.getElementById('map-responsive-canvas');
    const lw = 2;
    const half = lw / 2;

    let containerWidth = container.clientWidth - 4;

    const normalizedSections = esp.sections.map(s => ({
        rows: Math.max(1, parseInt(s.rows) || 1),
        cols: Math.max(1, parseInt(s.cols) || 1),
        start_left: String(s.start_left || 'left').toLowerCase() === '1' ? 'right' : String(s.start_left || 'left').toLowerCase(),
        start_top: String(s.start_top || 'top').toLowerCase(),
        serpentine_direction: String(s.serpentine_direction || 'horizontal').toLowerCase() === '1' ? 'vertical' : String(s.serpentine_direction || 'horizontal').toLowerCase()
    }));

    const totalRows = normalizedSections.reduce((sum, s) => sum + s.rows, 0);
    const maxCols = Math.max(...normalizedSections.map(s => s.cols));

    let boxHeight = Math.max(50, Math.floor((containerWidth - lw) / maxCols));
    if ((containerWidth - lw) / maxCols < 50) {
        boxHeight = 50;
        canvas.width = 50 * maxCols + lw;
    } else {
        canvas.width = containerWidth;
    }
    canvas.height = boxHeight * totalRows + lw;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const occupancy = buildOccupancyMap(esp);
    const dark = localStorage.getItem('theme') === 'dark';

    let currentSecY = 0;
    let cumLedOffset = 0;

    normalizedSections.forEach((s, secIdx) => {
        const secHeight = s.rows * boxHeight;
        const colWidth = (canvas.width - lw) / s.cols;

        // Grid lines
        ctx.strokeStyle = '#6c757d';
        ctx.lineWidth = lw;
        for (let r = 0; r <= s.rows; r++) {
            ctx.beginPath();
            ctx.moveTo(0, currentSecY + r * boxHeight + half);
            ctx.lineTo(canvas.width, currentSecY + r * boxHeight + half);
            ctx.stroke();
        }
        for (let c = 0; c <= s.cols; c++) {
            ctx.beginPath();
            ctx.moveTo(c * colWidth + half, currentSecY + half);
            ctx.lineTo(c * colWidth + half, currentSecY + secHeight + half);
            ctx.stroke();
        }

        // Section divider
        if (secIdx > 0) {
            ctx.lineWidth = lw * 2;
            ctx.strokeStyle = '#495057';
            ctx.beginPath();
            ctx.moveTo(0, currentSecY + half);
            ctx.lineTo(canvas.width, currentSecY + half);
            ctx.stroke();
            ctx.lineWidth = lw;
        }

        // Circles & drawer labels
        const minCellDim = Math.min(colWidth, boxHeight);
        for (let r = 0; r < s.rows; r++) {
            for (let c = 0; c < s.cols; c++) {
                const localLed = calculateLedNumber(r, c, s.start_left, s.start_top, s.serpentine_direction, s.rows, s.cols);
                const ledNum = cumLedOffset + localLed;
                const cx = c * colWidth + colWidth / 2 + half;
                const cy = currentSecY + r * boxHeight + boxHeight / 2 + half;
                const hasItems = !!(occupancy[ledNum] && occupancy[ledNum].length > 0);

                ctx.beginPath();
                ctx.arc(cx, cy, hasItems ? minCellDim / 8 : minCellDim / 15, 0, Math.PI * 2);
                ctx.fillStyle = hasItems ? '#fd7e14' : '#ffc107';
                ctx.fill();

                ctx.fillStyle = dark ? 'white' : 'black';
                ctx.font = `${minCellDim / 4.5}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(ledNum), cx + minCellDim / 5, cy - minCellDim / 5);
            }
        }

        currentSecY += secHeight;
        cumLedOffset += s.rows * s.cols;
    });

    canvas.onclick = (e) => handleMultiSectionMapClick(e, esp, normalizedSections, boxHeight, lw);
    setupMapHoverTracking(esp, true, boxHeight, lw, null, null, null, normalizedSections);
}

function handleMultiSectionMapClick(event, esp, sections, boxHeight, lw) {
    const canvas = document.getElementById('map-responsive-canvas');
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let currentSecY = 0;
    let cumLedOffset = 0;

    for (const s of sections) {
        const secHeight = s.rows * boxHeight;
        if (y >= currentSecY && y < currentSecY + secHeight) {
            const r = Math.max(0, Math.min(s.rows - 1, Math.floor((y - currentSecY) / boxHeight)));
            const colWidth = (canvas.width - lw) / s.cols;
            const c = Math.max(0, Math.min(s.cols - 1, Math.floor(x / colWidth)));
            const localLed = calculateLedNumber(r, c, s.start_left, s.start_top, s.serpentine_direction, s.rows, s.cols);
            const ledNum = cumLedOffset + localLed;

            selectDrawer(ledNum);
            return;
        }
        currentSecY += secHeight;
        cumLedOffset += s.rows * s.cols;
    }
}

function parsePositions(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(Number).filter(n => !isNaN(n) && n > 0);
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.map(Number).filter(n => !isNaN(n) && n > 0);
            if (typeof parsed === 'number' && !isNaN(parsed) && parsed > 0) return [parsed];
        } catch (e) {}
        const cleaned = raw.replace(/[\[\]\s]/g, '');
        if (!cleaned) return [];
        return cleaned.split(',').map(Number).filter(n => !isNaN(n) && n > 0);
    }
    return [];
}

function buildOccupancyMap(esp) {
    const occupancy = {};
    (fetchedItems || []).forEach(item => {
        if (!itemBelongsToEsp(item, esp)) return;
        const positions = parsePositions(item.position);
        positions.forEach(led => {
            if (!occupancy[led]) occupancy[led] = [];
            occupancy[led].push(item);
        });
    });
    return occupancy;
}

function itemBelongsToEsp(item, esp) {
    if (!item || !esp) return false;
    const ip = (item.ip || '').trim().toLowerCase();
    const espName = (esp.name || '').trim().toLowerCase();
    const espIp = (esp.esp_ip || '').trim().toLowerCase();
    const espId = String(esp.id !== undefined && esp.id !== null ? esp.id : '').trim().toLowerCase();
    return ip === espName || ip === espIp || (espId.length > 0 && ip === espId);
}

function handleMapClick(event, esp, boxSize, lw, startX, startY, serpDir) {
    const canvas = document.getElementById('map-responsive-canvas');
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const row = Math.floor(y / boxSize);
    const col = Math.floor(x / boxSize);
    const ledNum = calculateLedNumber(row, col, startX, startY, serpDir, parseInt(esp.rows), parseInt(esp.cols));
    selectDrawer(ledNum);
}

function renderMapItems(ledNum, items) {
    document.getElementById('map-items-heading').textContent = `Position ${ledNum}`;
    const container = document.getElementById('map-items-list');
    if (items.length === 0) {
        container.innerHTML = '<p class="text-muted small mt-1">No items at this position.</p>';
        return;
    }
    container.innerHTML = items.map(item => `
        <div class="d-flex align-items-center mb-2 border rounded p-2">
            ${item.image
                ? `<img src="${safeUrl(item.image)}" style="width:44px;height:44px;object-fit:cover;flex-shrink:0;" class="rounded me-2" alt="${escapeHtml(item.name || '')}" loading="lazy" decoding="async">`
                : '<div style="width:44px;height:44px;flex-shrink:0;" class="me-2 bg-secondary rounded opacity-25"></div>'}
            <div class="overflow-hidden">
                <div class="fw-semibold small text-truncate">${escapeHtml(item.name)}</div>
                <div class="text-muted small">Stock: ${item.quantity}</div>
            </div>
        </div>
    `).join('');
}

let currentMapContext = null;

function setupMapHoverTracking(esp, isMulti, boxDim, lw, startX, startY, serpDir, normalizedSections) {
    const occupancy = buildOccupancyMap(esp);
    currentMapContext = { esp, isMulti, boxDim, lw, startX, startY, serpDir, normalizedSections, occupancy };
    const canvas = document.getElementById('map-responsive-canvas');
    const container = document.getElementById('map-canvas-container');
    const highlight = document.getElementById('map-cell-highlight');
    const tooltip = document.getElementById('map-cell-tooltip');
    if (!canvas || !container || !highlight || !tooltip) return;

    if (canvas.dataset.hoverInitialized === 'true') return;
    canvas.dataset.hoverInitialized = 'true';

    let mapRafPending = false;
    let lastPointerEvent = null;

    function processMapHover(e) {
        if (!currentMapContext) return;
        const ctx = currentMapContext;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        let cell = null;
        if (ctx.isMulti && ctx.normalizedSections) {
            const sections = ctx.normalizedSections;
            const boxHeight = ctx.boxDim;
            let currentSecY = 0;
            let cumLedOffset = 0;
            for (let secIdx = 0; secIdx < sections.length; secIdx++) {
                const s = sections[secIdx];
                const secHeight = s.rows * boxHeight;
                if (y >= currentSecY && y < currentSecY + secHeight) {
                    const r = Math.max(0, Math.min(s.rows - 1, Math.floor((y - currentSecY) / boxHeight)));
                    const colWidth = (canvas.width - ctx.lw) / s.cols;
                    const c = Math.max(0, Math.min(s.cols - 1, Math.floor(x / colWidth)));
                    const localLed = calculateLedNumber(r, c, s.start_left, s.start_top, s.serpentine_direction, s.rows, s.cols);
                    const globalLed = cumLedOffset + localLed;

                    cell = {
                        section: secIdx + 1,
                        row: r + 1,
                        col: c + 1,
                        ledNumber: globalLed,
                        pixelX: (c * colWidth) / scaleX,
                        pixelY: (currentSecY + r * boxHeight) / scaleY,
                        pixelW: colWidth / scaleX,
                        pixelH: boxHeight / scaleY
                    };
                    break;
                }
                currentSecY += secHeight;
                cumLedOffset += s.rows * s.cols;
            }
        } else {
            const rows = parseInt(ctx.esp.rows) || 1;
            const columns = parseInt(ctx.esp.cols) || 1;
            const boxSize = ctx.boxDim;
            const r = Math.min(rows - 1, Math.max(0, Math.floor(y / boxSize)));
            const c = Math.min(columns - 1, Math.max(0, Math.floor(x / boxSize)));
            const ledNum = calculateLedNumber(r, c, ctx.startX, ctx.startY, ctx.serpDir, rows, columns);

            cell = {
                section: null,
                row: r + 1,
                col: c + 1,
                ledNumber: ledNum,
                pixelX: (c * boxSize) / scaleX,
                pixelY: (r * boxSize) / scaleY,
                pixelW: boxSize / scaleX,
                pixelH: boxSize / scaleY
            };
        }

        if (!cell) {
            highlight.classList.add('d-none');
            tooltip.classList.add('d-none');
            return;
        }

        highlight.style.left = `${cell.pixelX}px`;
        highlight.style.top = `${cell.pixelY}px`;
        highlight.style.width = `${cell.pixelW}px`;
        highlight.style.height = `${cell.pixelH}px`;
        highlight.classList.remove('d-none');

        const occupancy = ctx.occupancy || (ctx.occupancy = buildOccupancyMap(ctx.esp));
        const itemsAtPos = occupancy[cell.ledNumber] || [];
        let statusBadge = '';
        let subtitle = '';

        if (itemsAtPos.length > 0) {
            statusBadge = `<span class="badge bg-warning-subtle text-warning border border-warning-subtle px-1 py-0">${itemsAtPos.length} part${itemsAtPos.length > 1 ? 's' : ''}</span>`;
            subtitle = escapeHtml(itemsAtPos[0].name) + (itemsAtPos.length > 1 ? ` (+${itemsAtPos.length - 1} more)` : '');
        } else {
            statusBadge = `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-1 py-0">Empty</span>`;
            subtitle = 'Available storage bin';
        }

        const secInfo = cell.section ? `Sec ${cell.section} · ` : '';
        tooltip.innerHTML = `
            <div class="d-flex align-items-center gap-1.5 mb-0.5">
                <span class="fw-bold">Bin #${cell.ledNumber}</span>
                ${statusBadge}
            </div>
            <div class="text-body-secondary small">${secInfo}R${cell.row} C${cell.col} · ${subtitle}</div>
        `;

        const tooltipX = cell.pixelX + cell.pixelW / 2;
        tooltip.style.left = `${tooltipX}px`;
        if (cell.pixelY < 50) {
            tooltip.style.top = `${cell.pixelY + cell.pixelH + 8}px`;
            tooltip.style.transform = 'translate(-50%, 0)';
        } else {
            tooltip.style.top = `${cell.pixelY}px`;
            tooltip.style.transform = 'translate(-50%, -100%)';
        }
        tooltip.classList.remove('d-none');
    }

    canvas.addEventListener('pointermove', function (e) {
        lastPointerEvent = e;
        if (mapRafPending) return;
        mapRafPending = true;
        requestAnimationFrame(() => {
            if (lastPointerEvent) {
                processMapHover(lastPointerEvent);
            }
            mapRafPending = false;
        });
    });

    canvas.addEventListener('pointerleave', function () {
        lastPointerEvent = null;
        highlight.classList.add('d-none');
        tooltip.classList.add('d-none');
    });
}

document.getElementById('map-modal')?.addEventListener('hidden.bs.modal', function () {
    const highlight = document.getElementById('map-cell-highlight');
    const tooltip = document.getElementById('map-cell-tooltip');
    if (highlight) highlight.classList.add('d-none');
    if (tooltip) tooltip.classList.add('d-none');
});
async function executeMoveOrSwap(movingParams, targetEsp, targetLedNum) {
    if (!movingParams || !targetEsp) {
        movingItem = null;
        document.getElementById('map-move-banner')?.classList.add('d-none');
        return;
    }

    const allItems = getGlobalItems();
    let itemA = allItems.find(i => String(i.id) === String(movingParams.id));
    if (!itemA) {
        try {
            const res = await fetch(`/api/items/${movingParams.id}`);
            if (res.ok) itemA = await res.json();
        } catch (e) {}
    }
    if (!itemA) {
        movingItem = null;
        document.getElementById('map-move-banner')?.classList.add('d-none');
        return;
    }

    // Check if target bin has any existing items
    const occupancy = buildOccupancyMap(targetEsp);
    const existingItems = occupancy[targetLedNum] || [];

    const confirmMsg = existingItems.length > 0 
        ? `Are you sure you want to SWAP "${itemA.name}" with the ${existingItems.length} part(s) in Drawer #${targetLedNum}?`
        : `Move "${itemA.name}" to Drawer #${targetLedNum}?`;
        
    if (!confirm(confirmMsg)) {
        movingItem = null;
        document.getElementById('map-move-banner')?.classList.add('d-none');
        return;
    }

    try {
        const promises = [];
        
        // Update Item A to new location
        const itemAPayload = {
            name: itemA.name || '',
            link: itemA.link || '',
            image: itemA.image || '',
            position: JSON.stringify([targetLedNum]),
            quantity: parseInt(itemA.quantity, 10) || 0,
            min_quantity: itemA.min_quantity !== undefined && itemA.min_quantity !== null ? itemA.min_quantity : 3,
            ip: targetEsp.esp_ip || '',
            tags: itemA.tags || ''
        };
        promises.push(fetch(`/api/items/${itemA.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itemAPayload)
        }));

        // If target bin had items, move them to Item A's old location (swap)
        if (existingItems.length > 0) {
            existingItems.forEach(itemB => {
                const itemBPayload = {
                    name: itemB.name || '',
                    link: itemB.link || '',
                    image: itemB.image || '',
                    position: movingParams.oldLedNum !== null && movingParams.oldLedNum !== undefined ? JSON.stringify([movingParams.oldLedNum]) : '[]',
                    quantity: parseInt(itemB.quantity, 10) || 0,
                    min_quantity: itemB.min_quantity !== undefined && itemB.min_quantity !== null ? itemB.min_quantity : 3,
                    ip: movingParams.oldEspIp || '',
                    tags: itemB.tags || ''
                };
                promises.push(fetch(`/api/items/${itemB.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(itemBPayload)
                }));
            });
        }

        const responses = await Promise.all(promises);
        if (responses.some(r => !r.ok)) throw new Error('Failed to update one or more items.');

        // Hide banner
        movingItem = null;
        document.getElementById('map-move-banner')?.classList.add('d-none');

        // Re-fetch items so map occupancy is immediately updated
        const freshRes = await fetch('/api/items');
        if (freshRes.ok) {
            const freshItems = await freshRes.json();
            fetchedItems = freshItems;
            window.fetchedItems = freshItems;
        }

        if (typeof loadItems === 'function') loadItems();

        // Reselect the new drawer
        showMapForEsp(targetEsp);
        selectDrawer(targetLedNum);

    } catch (err) {
        console.error(err);
        alert('Error moving item: ' + err.message);
        movingItem = null;
        document.getElementById('map-move-banner')?.classList.add('d-none');
    }
}


function assignPartFromMap(espId, espIp, ledNum) {
    const mapModalEl = document.getElementById('map-modal');
    const onMapHidden = () => {
        mapModalEl?.removeEventListener('hidden.bs.modal', onMapHidden);
        if (window.openAddModalWithPreFill) {
            window.openAddModalWithPreFill({ espId, espIp, ledNum });
        }
    };

    if (mapModalEl && window.DialogManager) {
        mapModalEl.addEventListener('hidden.bs.modal', onMapHidden, { once: true });
        DialogManager.close('map-modal');
    } else {
        if (window.openAddModalWithPreFill) {
            window.openAddModalWithPreFill({ espId, espIp, ledNum });
        }
    }
}
window.assignPartFromMap = assignPartFromMap;



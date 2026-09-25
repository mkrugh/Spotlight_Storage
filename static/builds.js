let editingBuildId = null;
let pendingExecuteBuildId = null;

const buildsListModal = { show: () => DialogManager.open('builds-list-modal'), hide: () => DialogManager.close('builds-list-modal') };
const buildEditModal = { show: () => DialogManager.open('build-edit-modal'), hide: () => DialogManager.close('build-edit-modal') };
const buildExecuteModal = { show: () => DialogManager.open('build-execute-modal'), hide: () => DialogManager.close('build-execute-modal') };

async function openBuildsModal() {
    buildsListModal.show();
    const container = document.getElementById('builds-list-container');
    if (container && (!container.children || container.children.length === 0)) {
        container.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div></div>';
    }
    try {
        const builds = await apiFetch('/api/builds?include_parts=true');
        renderBuildsList(builds || []);
    } catch (err) {
        console.error('Error opening builds modal:', err);
    }
}

function getBuildReadiness(build) {
    const items = build.items || [];
    if (items.length === 0) {
        return {
            badgeHtml: '<span class="build-readiness-chip bg-secondary-subtle text-secondary border border-secondary-subtle"><i data-lucide="package" style="width:12px;height:12px;"></i>No parts</span>',
            summary: 'No parts assigned'
        };
    }
    const shortages = items.filter(p => (parseInt(p.quantity, 10) || 0) < (parseInt(p.quantity_needed, 10) || 1));
    if (shortages.length === 0) {
        return {
            badgeHtml: '<span class="build-readiness-chip bg-success-subtle text-success border border-success-subtle"><i data-lucide="check-circle" style="width:12px;height:12px;"></i>Ready (100% in stock)</span>',
            summary: `${items.length} of ${items.length} parts in stock`
        };
    } else {
        const shortageNames = shortages.map(s => s.name).slice(0, 2).join(', ');
        const extra = shortages.length > 2 ? ` +${shortages.length - 2}` : '';
        return {
            badgeHtml: `<span class="build-readiness-chip bg-danger-subtle text-danger border border-danger-subtle"><i data-lucide="alert-circle" style="width:12px;height:12px;"></i>Shortage (${shortages.length} missing)</span>`,
            summary: `Missing: ${shortageNames}${extra}`
        };
    }
}

function renderBuildsList(builds) {
    const container = document.getElementById('builds-list-container');
    if (builds.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No builds yet. Click "New Build" to create one.</p>';
        return;
    }
    container.innerHTML = builds.map(b => {
        const readiness = getBuildReadiness(b);
        return `
            <div class="d-flex align-items-center justify-content-between mb-2 border rounded p-2.5 build-item-card">
                <div class="pe-2 overflow-hidden">
                    <div class="d-flex align-items-center gap-2 mb-0.5 flex-wrap">
                        <span class="fw-semibold text-truncate">${escapeHtml(b.name)}</span>
                        ${readiness.badgeHtml}
                    </div>
                    <div class="text-body-secondary small">${escapeHtml(readiness.summary)}</div>
                </div>
                <div class="d-flex align-items-center flex-shrink-0">
                    <button class="btn btn-outline-success btn-sm pe-2 me-1 btn-execute-build"
                            data-build-id="${b.id}" data-build-name="${escapeHtml(b.name)}">
                        <i data-lucide="hammer" style="width:14px;height:14px;"></i>
                        <span class="ms-1">Execute</span>
                    </button>
                    <button class="btn btn-outline-primary btn-sm me-1 btn-edit-build" data-build-id="${b.id}" data-build-name="${escapeHtml(b.name)}">
                        <i data-lucide="pencil" style="width:14px;height:14px;"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm btn-delete-build" data-build-id="${b.id}" data-build-name="${escapeHtml(b.name)}">
                        <i data-lucide="trash" style="width:14px;height:14px;"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    lucide.createIcons();
}

let initialBuildPartsJson = '[]';
let initialBuildName = '';
let isForcingClose = false;

function getCurrentBuildPartsData() {
    const rows = document.querySelectorAll('#build-parts-list .build-part-row');
    return Array.from(rows).filter(row => {
        const hiddenInput = row.querySelector('.build-part-id');
        const searchInput = row.querySelector('.build-part-search-input');
        const idVal = (hiddenInput ? hiddenInput.value : '')?.trim() || '';
        const searchVal = (searchInput ? searchInput.value : '')?.trim() || '';
        return Boolean(idVal || searchVal);
    }).map(row => {
        const hiddenInput = row.querySelector('.build-part-id');
        const qtyInput = row.querySelector('.build-part-qty');
        return {
            item_id: hiddenInput ? hiddenInput.value : '',
            quantity: qtyInput ? qtyInput.value : '1'
        };
    });
}

function hasUnsavedBuildParts() {
    const rows = document.querySelectorAll('#build-parts-list .build-part-row');
    const usedRows = Array.from(rows).filter(row => {
        const hiddenInput = row.querySelector('.build-part-id');
        const searchInput = row.querySelector('.build-part-search-input');
        const idVal = (hiddenInput ? hiddenInput.value : '')?.trim() || '';
        const searchVal = (searchInput ? searchInput.value : '')?.trim() || '';
        return Boolean(idVal || searchVal);
    });
    const currentName = (document.getElementById('build-name-input')?.value || '').trim();

    if (editingBuildId === null) {
        // In a new build: if ANY filled/touched parts were added or a name entered, it's unsaved!
        return usedRows.length > 0 || currentName.length > 0;
    } else {
        // In edit mode: compare against initial loaded state
        const currentParts = getCurrentBuildPartsData();
        return JSON.stringify(currentParts) !== initialBuildPartsJson || currentName !== initialBuildName;
    }
}

function forceCloseBuildModal() {
    isForcingClose = true;
    buildEditModal.hide();
    isForcingClose = false;
}

async function openNewBuildModal() {
    editingBuildId = null;
    initialBuildPartsJson = '[]';
    initialBuildName = '';
    document.getElementById('build-edit-modal-label').textContent = 'New Build';
    document.getElementById('build-name-input').value = '';
    document.getElementById('build-parts-list').innerHTML = '';

    if (typeof fetchedItems === 'undefined' || fetchedItems.length === 0) {
        try {
            const r = await fetch('/api/items');
            if (r.ok) fetchedItems = await r.json();
        } catch (e) {
            console.error('Failed to fetch items for build picker:', e);
        }
    }

    buildsListModal.hide();
    buildEditModal.show();
}

function openEditBuildModal(buildId, buildName = null) {
    editingBuildId = buildId;
    document.getElementById('build-edit-modal-label').textContent = 'Edit Build';
    document.getElementById('build-name-input').value = buildName || '';
    initialBuildName = buildName || '';
    initialBuildPartsJson = '[]';
    const partsList = document.getElementById('build-parts-list');
    partsList.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

    buildsListModal.hide();
    buildEditModal.show();

    const itemsPromise = (typeof fetchedItems !== 'undefined' && fetchedItems.length > 0)
        ? Promise.resolve(fetchedItems)
        : fetch('/api/items').then(r => r.ok ? r.json() : []).catch(() => []);

    const buildPromise = fetch(`/api/builds/${buildId}`).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] }));

    Promise.all([buildPromise, itemsPromise]).then(([buildData, items]) => {
        if (editingBuildId !== buildId) return;

        if ((!buildName || buildName.trim() === '') && buildData && buildData.name) {
            const nameInput = document.getElementById('build-name-input');
            if (nameInput) nameInput.value = buildData.name;
            initialBuildName = buildData.name;
        }

        const allItems = (typeof fetchedItems !== 'undefined' && fetchedItems.length > 0)
            ? fetchedItems : items;

        partsList.innerHTML = '';
        const itemsList = buildData.items || [];
        itemsList.forEach(part => {
            addPartRow(allItems, part.item_id, part.quantity_needed);
        });

        // Snapshot the initial state
        initialBuildPartsJson = JSON.stringify(getCurrentBuildPartsData());
    }).catch(err => {
        console.error('Error fetching build details:', err);
        partsList.innerHTML = '<div class="text-center py-3 text-danger small">Failed to load build parts.</div>';
    });
}

function getItemTagsArray(item) {
    if (!item || !item.tags) return [];
    if (Array.isArray(item.tags)) {
        return item.tags.map(t => typeof t === 'object' ? (t.value || t.name || String(t)) : String(t));
    }
    if (typeof item.tags === 'string') {
        try {
            const parsed = JSON.parse(item.tags);
            if (Array.isArray(parsed)) {
                return parsed.map(t => typeof t === 'object' ? (t.value || t.name || String(t)) : String(t));
            }
        } catch (e) {
            // fallback for plain strings
        }
        return item.tags.replace(/[\[\]'"\\]/g, '').split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
}

function safeEscape(str) {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

let buildPartRowCounter = 0;

function addPartRow(items, selectedItemId, qty) {
    const allItems = (items && items.length > 0) ? items
        : (typeof fetchedItems !== 'undefined' ? fetchedItems : []);

    const selectedItem = selectedItemId ? allItems.find(i => String(i.id) === String(selectedItemId)) : null;
    const initialName = selectedItem ? selectedItem.name : '';
    const rowId = ++buildPartRowCounter;
    const menuId = `build-part-menu-${rowId}`;

    const row = document.createElement('div');
    row.className = 'd-flex align-items-center mb-2 build-part-row gap-2';
    row.innerHTML = `
        <div class="build-part-search-container position-relative flex-grow-1">
            <input type="hidden" class="build-part-id" value="${safeEscape(selectedItemId || '')}">
            <input type="text" class="form-control form-control-sm build-part-search-input" 
                   placeholder="Search by part name or tag..." value="${safeEscape(initialName)}" 
                   autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" 
                   aria-controls="${menuId}" aria-haspopup="listbox" aria-label="Search part by name or tag">
            <div class="build-part-search-menu shadow-sm" id="${menuId}" role="listbox" style="display: none;"></div>
        </div>
        <div class="d-flex align-items-center gap-1.5 flex-shrink-0">
            <span class="small text-muted">Need:</span>
            <input type="number" class="form-control form-control-sm build-part-qty" style="width:70px" min="1" value="${qty || 1}">
        </div>
        <span class="part-stock-badge border text-nowrap flex-shrink-0">Select a part</span>
        <button type="button" class="btn btn-outline-danger btn-sm btn-remove-part flex-shrink-0" title="Remove part">
            <i data-lucide="trash" style="width:14px;height:14px;"></i>
        </button>
    `;

    const searchContainer = row.querySelector('.build-part-search-container');
    const hiddenInput = row.querySelector('.build-part-id');
    const searchInput = row.querySelector('.build-part-search-input');
    const searchMenu = row.querySelector('.build-part-search-menu');
    const qtyInput = row.querySelector('.build-part-qty');
    const stockBadge = row.querySelector('.part-stock-badge');

    let activeIndex = -1;

    function closeDropdown() {
        searchMenu.style.display = 'none';
        searchInput.setAttribute('aria-expanded', 'false');
        searchInput.removeAttribute('aria-activedescendant');
        activeIndex = -1;
    }

    function renderDropdown(filterText) {
        const query = (filterText || '').trim().toLowerCase();
        const tokens = query.split(/\s+/).filter(Boolean);
        const filtered = allItems.filter(item => {
            if (tokens.length === 0) return true;
            const name = (item.name || '').toLowerCase();
            const tags = getItemTagsArray(item).map(t => t.toLowerCase());
            return tokens.every(token => {
                const rawToken = token.toLowerCase();
                const cleanToken = rawToken.replace(/^[#@]+/, '');
                if (!cleanToken) return tags.length > 0;
                return name.includes(rawToken) || 
                       name.includes(cleanToken) || 
                       tags.some(t => t.includes(cleanToken) || t.includes(rawToken));
            });
        });

        activeIndex = -1;
        if (filtered.length === 0) {
            searchMenu.innerHTML = '<div class="p-2 text-muted small text-center">No matching parts found</div>';
        } else {
            searchMenu.innerHTML = filtered.map((item, idx) => {
                const tags = getItemTagsArray(item);
                const tagsHtml = tags.map(t => `<span class="badge bg-body-secondary text-body border fw-normal me-1 mb-0.5" style="font-size:0.68rem; padding:0.15em 0.4em;">#${safeEscape(t)}</span>`).join('');
                const isSelected = String(item.id) === String(hiddenInput.value);
                const optionId = `${menuId}-opt-${idx}`;
                return `
                    <div class="build-part-search-item ${isSelected ? 'active' : ''}" 
                         id="${optionId}"
                         role="option" aria-selected="${isSelected ? 'true' : 'false'}"
                         data-item-id="${safeEscape(item.id)}" data-item-name="${safeEscape(item.name)}" data-index="${idx}">
                        <div class="d-flex flex-column overflow-hidden me-2" style="min-width: 0;">
                            <span class="fw-semibold text-truncate small">${safeEscape(item.name)}</span>
                            ${tagsHtml ? `<div class="d-flex align-items-center flex-wrap mt-0.5">${tagsHtml}</div>` : ''}
                        </div>
                        <span class="badge ${item.quantity > 0 ? 'bg-secondary-subtle text-secondary border border-secondary-subtle' : 'bg-danger-subtle text-danger border border-danger-subtle'} flex-shrink-0 small ms-auto align-self-start mt-0.5">
                            In Stock: ${item.quantity ?? 0}
                        </span>
                    </div>
                `;
            }).join('');
        }
        searchMenu.style.display = 'block';
        searchInput.setAttribute('aria-expanded', 'true');
    }

    function selectItem(id, name) {
        hiddenInput.value = id;
        searchInput.value = name;
        closeDropdown();
        updateStockBadge();
    }

    function updateStockBadge() {
        const selectedId = hiddenInput.value;
        const item = selectedId ? allItems.find(i => String(i.id) === String(selectedId)) : null;
        const stock = item ? (parseInt(item.quantity, 10) || 0) : 0;
        const needed = parseInt(qtyInput.value, 10) || 1;

        if (!selectedId || !item) {
            stockBadge.className = 'part-stock-badge border text-nowrap flex-shrink-0 bg-secondary-subtle text-secondary border-secondary-subtle';
            stockBadge.textContent = 'Select a part';
        } else if (stock >= needed) {
            stockBadge.className = 'part-stock-badge border text-nowrap flex-shrink-0 bg-success-subtle text-success border-success-subtle';
            stockBadge.textContent = `In Stock: ${stock}`;
        } else {
            stockBadge.className = 'part-stock-badge border text-nowrap flex-shrink-0 bg-danger-subtle text-danger border-danger-subtle';
            stockBadge.textContent = `In Stock: ${stock} (Shortage)`;
        }
    }

    searchInput.addEventListener('focus', () => {
        renderDropdown(searchInput.value);
    });

    searchInput.addEventListener('input', () => {
        const selectedId = hiddenInput.value;
        const item = selectedId ? allItems.find(i => String(i.id) === String(selectedId)) : null;
        if (!item || searchInput.value.trim() !== item.name) {
            hiddenInput.value = '';
            updateStockBadge();
        }
        renderDropdown(searchInput.value);
    });

    searchInput.addEventListener('keydown', (e) => {
        const itemsList = searchMenu.querySelectorAll('.build-part-search-item');
        if (searchMenu.style.display !== 'none' && itemsList.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIndex = (activeIndex + 1) % itemsList.length;
                itemsList.forEach((el, idx) => el.classList.toggle('highlighted', idx === activeIndex));
                const curr = searchMenu.querySelector(`[data-index="${activeIndex}"]`);
                if (curr) {
                    curr.scrollIntoView({ block: 'nearest' });
                    searchInput.setAttribute('aria-activedescendant', curr.id);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIndex = (activeIndex - 1 + itemsList.length) % itemsList.length;
                itemsList.forEach((el, idx) => el.classList.toggle('highlighted', idx === activeIndex));
                const curr = searchMenu.querySelector(`[data-index="${activeIndex}"]`);
                if (curr) {
                    curr.scrollIntoView({ block: 'nearest' });
                    searchInput.setAttribute('aria-activedescendant', curr.id);
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeIndex >= 0 && activeIndex < itemsList.length) {
                    const target = itemsList[activeIndex];
                    selectItem(target.dataset.itemId, target.dataset.itemName);
                } else if (itemsList.length === 1) {
                    const target = itemsList[0];
                    selectItem(target.dataset.itemId, target.dataset.itemName);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeDropdown();
            } else if (e.key === 'Tab') {
                closeDropdown();
            }
        }
    });

    // Use mousedown so selection completes before input focusout triggers
    searchMenu.addEventListener('mousedown', (e) => {
        const itemEl = e.target.closest('.build-part-search-item');
        if (itemEl) {
            e.preventDefault();
            selectItem(itemEl.dataset.itemId, itemEl.dataset.itemName);
        }
    });

    searchMenu.addEventListener('click', (e) => {
        const itemEl = e.target.closest('.build-part-search-item');
        if (itemEl) {
            e.preventDefault();
            selectItem(itemEl.dataset.itemId, itemEl.dataset.itemName);
        }
    });

    // Close menu when focus moves outside this search container (e.g. Tab navigation)
    searchContainer.addEventListener('focusout', (e) => {
        if (!searchContainer.contains(e.relatedTarget)) {
            closeDropdown();
        }
    });

    qtyInput.addEventListener('input', updateStockBadge);
    updateStockBadge();

    row.querySelector('.btn-remove-part').addEventListener('click', () => {
        row.remove();
    });

    document.getElementById('build-parts-list').appendChild(row);
    lucide.createIcons();
}

function saveBuild() {
    const name = document.getElementById('build-name-input').value.trim();
    if (!name) {
        if (typeof showToast === 'function') {
            showToast('Please enter a build name.', 'warning');
        } else {
            alert('Please enter a build name.');
        }
        return;
    }

    // First: Prune completely blank part rows (where both part id and search input are empty)
    const existingRows = document.querySelectorAll('#build-parts-list .build-part-row');
    existingRows.forEach(row => {
        const hiddenInput = row.querySelector('.build-part-id');
        const searchInput = row.querySelector('.build-part-search-input');
        const idVal = (hiddenInput ? hiddenInput.value : '')?.trim();
        const searchVal = (searchInput ? searchInput.value : '')?.trim();
        if (!idVal && !searchVal) {
            row.remove();
        }
    });

    // Re-query rows after pruning
    const rows = document.querySelectorAll('#build-parts-list .build-part-row');
    if (rows.length > 0) {
        const unselectedRow = Array.from(rows).some(row => {
            const hiddenInput = row.querySelector('.build-part-id');
            const selectEl = row.querySelector('.build-part-select');
            const idVal = hiddenInput ? hiddenInput.value : (selectEl ? selectEl.value : null);
            return !idVal || isNaN(parseInt(idVal, 10)) || parseInt(idVal, 10) <= 0;
        });

        if (unselectedRow) {
            if (typeof showToast === 'function') {
                showToast('Please select a valid part from the search list for all rows.', 'warning');
            } else {
                alert('Please select a valid part from the search list for all rows.');
            }
            return;
        }
    }

    const items = Array.from(rows).map(row => {
        const hiddenInput = row.querySelector('.build-part-id');
        const selectEl = row.querySelector('.build-part-select');
        const idVal = hiddenInput ? hiddenInput.value : (selectEl ? selectEl.value : null);
        return {
            item_id: parseInt(idVal, 10),
            quantity_needed: parseInt(row.querySelector('.build-part-qty').value, 10) || 1
        };
    }).filter(item => !isNaN(item.item_id) && item.item_id > 0);

    const body = { name, items };

    const method = editingBuildId ? 'PUT' : 'POST';
    const url = editingBuildId ? `/api/builds/${editingBuildId}` : '/api/builds';

    fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
        .then(r => r.json())
        .then(() => {
            forceCloseBuildModal();
            if (typeof showToast === 'function') {
                showToast(`Build "${name}" saved successfully.`, 'success');
            }
            openBuildsModal();
        })
        .catch(err => {
            console.error('Error saving build:', err);
            if (typeof showToast === 'function') {
                showToast(`Failed to save build "${name}".`, 'danger');
            }
        });
}

function openExecuteModal(buildId, buildName) {
    pendingExecuteBuildId = buildId;
    document.getElementById('build-execute-name').textContent = buildName;
    document.getElementById('build-execute-warnings').classList.add('d-none');
    document.getElementById('build-execute-warnings').textContent = '';

    fetch(`/api/builds/${buildId}`)
        .then(r => r.json())
        .then(data => {
            const partsEl = document.getElementById('build-execute-parts');
            if (data.items.length === 0) {
                partsEl.textContent = 'No parts in this build.';
            } else {
                partsEl.innerHTML = data.items.map(p =>
                    `<span class="me-3">${escapeHtml(p.name)}: <strong>${p.quantity_needed}</strong> (stock: ${p.quantity})</span>`
                ).join('<br>');
            }
            buildExecuteModal.show();
        });
}

function confirmExecute() {
    if (!pendingExecuteBuildId) return;
    fetch(`/api/builds/${pendingExecuteBuildId}/execute`, { method: 'POST' })
        .then(r => r.json())
        .then(data => {
            if (data.warnings && data.warnings.length > 0) {
                const warningsEl = document.getElementById('build-execute-warnings');
                warningsEl.innerHTML = '<strong>Low stock warnings:</strong><br>' +
                    data.warnings.map(w => `${escapeHtml(w.name)}: needed ${w.need}, had ${w.have}`).join('<br>');
                warningsEl.classList.remove('d-none');
                if (typeof showToast === 'function') {
                    showToast('Build executed with stock shortage warnings.', 'warning');
                }
                if (typeof loadItems === 'function') loadItems();
            } else {
                buildExecuteModal.hide();
                if (typeof showToast === 'function') {
                    showToast('Build executed successfully. Stock updated.', 'success');
                }
                if (typeof loadItems === 'function') loadItems();
            }
            pendingExecuteBuildId = null;
        })
        .catch(err => {
            console.error('Error executing build:', err);
            if (typeof showToast === 'function') {
                showToast('Failed to execute build.', 'danger');
            }
        });
}

async function deleteBuild(buildId, buildName) {
    let confirmed = false;
    if (typeof showConfirmModal === 'function') {
        confirmed = await showConfirmModal({
            title: 'Delete Build',
            message: `Are you sure you want to delete build "${buildName}"?`,
            confirmText: 'Delete Build',
            confirmBtnClass: 'btn-danger'
        });
    } else {
        confirmed = confirm(`Delete build "${buildName}"?`);
    }
    if (!confirmed) return;

    fetch(`/api/builds/${buildId}`, { method: 'DELETE' })
        .then(() => {
            if (typeof showToast === 'function') {
                showToast(`Build "${buildName}" was deleted.`, 'success');
            }
            openBuildsModal();
        })
        .catch(err => {
            console.error('Error deleting build:', err);
            if (typeof showToast === 'function') {
                showToast(`Failed to delete build "${buildName}".`, 'danger');
            }
        });
}

// escapeHtml is defined in script.js

// Event wiring
document.getElementById('open-builds-btn').addEventListener('click', openBuildsModal);

document.getElementById('new-build-btn').addEventListener('click', openNewBuildModal);

document.getElementById('add-build-part-btn').addEventListener('click', () => {
    const allItems = typeof fetchedItems !== 'undefined' ? fetchedItems : [];
    addPartRow(allItems, null, 1);
});

document.getElementById('save-build-btn').addEventListener('click', saveBuild);

document.getElementById('confirm-execute-btn').addEventListener('click', confirmExecute);

document.getElementById('builds-list-container').addEventListener('click', function (e) {
    const execBtn = e.target.closest('.btn-execute-build');
    const editBtn = e.target.closest('.btn-edit-build');
    const delBtn = e.target.closest('.btn-delete-build');
    if (execBtn) openExecuteModal(execBtn.dataset.buildId, execBtn.dataset.buildName);
    if (editBtn) openEditBuildModal(editBtn.dataset.buildId, editBtn.dataset.buildName);
    if (delBtn) deleteBuild(delBtn.dataset.buildId, delBtn.dataset.buildName);
});

// Delegated click listener to dismiss any open search dropdowns on outside clicks
document.addEventListener('click', function (e) {
    if (!e.target.closest('.build-part-search-container')) {
        document.querySelectorAll('.build-part-search-menu').forEach(menu => {
            menu.style.display = 'none';
        });
        document.querySelectorAll('.build-part-search-input').forEach(input => {
            input.setAttribute('aria-expanded', 'false');
        });
    }
});

// Intercept exiting build-edit-modal without saving when parts have been added
const buildEditModalEl = document.getElementById('build-edit-modal');
if (buildEditModalEl) {
    buildEditModalEl.addEventListener('click', async function (e) {
        if (isForcingClose) return;

        const isDismissBtn = e.target.closest('[data-dialog-dismiss], [data-bs-dismiss="modal"]');
        const isBackdropClick = (e.target === buildEditModalEl);

        if (!isDismissBtn && !isBackdropClick) return;

        if (hasUnsavedBuildParts()) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            let confirmed = false;
            if (typeof showConfirmModal === 'function') {
                confirmed = await showConfirmModal({
                    title: 'Discard Unsaved Parts?',
                    message: 'You have added parts to this build. Are you sure you want to exit without saving?',
                    confirmText: 'Discard & Exit',
                    confirmBtnClass: 'btn-danger'
                });
            } else {
                confirmed = confirm('You have added parts to this build. Are you sure you want to exit without saving?');
            }

            if (confirmed) {
                forceCloseBuildModal();
            }
        }
    }, true);

    buildEditModalEl.addEventListener('keydown', async function (e) {
        if (e.key === 'Escape' && !isForcingClose) {
            if (hasUnsavedBuildParts()) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                let confirmed = false;
                if (typeof showConfirmModal === 'function') {
                    confirmed = await showConfirmModal({
                        title: 'Discard Unsaved Parts?',
                        message: 'You have added parts to this build. Are you sure you want to exit without saving?',
                        confirmText: 'Discard & Exit',
                        confirmBtnClass: 'btn-danger'
                    });
                } else {
                    confirmed = confirm('You have added parts to this build. Are you sure you want to exit without saving?');
                }

                if (confirmed) {
                    forceCloseBuildModal();
                }
            }
        }
    }, true);

    buildEditModalEl.addEventListener('cancel', function (e) {
        if (!isForcingClose && hasUnsavedBuildParts()) {
            e.preventDefault();
        }
    });
}



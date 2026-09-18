let editingBuildId = null;
let pendingExecuteBuildId = null;

const buildsListModal = { show: () => DialogManager.open('builds-list-modal'), hide: () => DialogManager.close('builds-list-modal') };
const buildEditModal = { show: () => DialogManager.open('build-edit-modal'), hide: () => DialogManager.close('build-edit-modal') };
const buildExecuteModal = { show: () => DialogManager.open('build-execute-modal'), hide: () => DialogManager.close('build-execute-modal') };

async function openBuildsModal() {
    try {
        const r = await fetch('/api/builds');
        const builds = await r.json();
        // Fetch detailed item info for each build to compute live stock readiness
        const detailedBuilds = await Promise.all(builds.map(async b => {
            try {
                const detRes = await fetch(`/api/builds/${b.id}`);
                if (detRes.ok) {
                    const data = await detRes.json();
                    b.items = data.items || [];
                } else {
                    b.items = [];
                }
            } catch (e) {
                b.items = [];
            }
            return b;
        }));
        renderBuildsList(detailedBuilds);
        buildsListModal.show();
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
                    <button class="btn btn-outline-primary btn-sm me-1 btn-edit-build" data-build-id="${b.id}">
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

function openNewBuildModal() {
    editingBuildId = null;
    document.getElementById('build-edit-modal-label').textContent = 'New Build';
    document.getElementById('build-name-input').value = '';
    document.getElementById('build-parts-list').innerHTML = '';
    buildsListModal.hide();
    buildEditModal.show();
}

function openEditBuildModal(buildId) {
    editingBuildId = buildId;
    document.getElementById('build-edit-modal-label').textContent = 'Edit Build';
    fetch(`/api/builds/${buildId}`)
        .then(r => r.json())
        .then(data => {
            fetch('/api/items')
                .then(r => r.json())
                .then(items => {
                    document.getElementById('build-name-input').value = '';
                    document.getElementById('build-parts-list').innerHTML = '';

                    // Find name from fetched items or use fetchedItems global
                    const allItems = (typeof fetchedItems !== 'undefined' && fetchedItems.length > 0)
                        ? fetchedItems : items;

                    // Fetch build name from builds list
                    fetch('/api/builds')
                        .then(r => r.json())
                        .then(builds => {
                            const build = builds.find(b => b.id == buildId);
                            if (build) document.getElementById('build-name-input').value = build.name;
                        });

                    data.items.forEach(part => {
                        addPartRow(allItems, part.item_id, part.quantity_needed);
                    });

                    buildsListModal.hide();
                    buildEditModal.show();
                });
        });
}

function addPartRow(items, selectedItemId, qty) {
    const allItems = (items && items.length > 0) ? items
        : (typeof fetchedItems !== 'undefined' ? fetchedItems : []);

    const options = allItems.map(item =>
        `<option value="${item.id}" data-stock="${item.quantity ?? 0}" ${item.id == selectedItemId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`
    ).join('');

    const row = document.createElement('div');
    row.className = 'd-flex align-items-center mb-2 build-part-row flex-wrap gap-2';
    row.innerHTML = `
        <select class="form-select form-select-sm build-part-select" style="min-width: 140px; flex: 1;">${options}</select>
        <div class="d-flex align-items-center gap-1.5 flex-shrink-0">
            <span class="small text-muted">Need:</span>
            <input type="number" class="form-control form-control-sm build-part-qty" style="width:70px" min="1" value="${qty || 1}">
        </div>
        <span class="part-stock-badge border text-nowrap flex-shrink-0" id="part-stock-badge">In Stock: 0</span>
        <button type="button" class="btn btn-outline-danger btn-sm btn-remove-part flex-shrink-0">
            <i data-lucide="trash" style="width:14px;height:14px;"></i>
        </button>
    `;

    const selectEl = row.querySelector('.build-part-select');
    const qtyInput = row.querySelector('.build-part-qty');
    const stockBadge = row.querySelector('#part-stock-badge');

    function updateStockBadge() {
        const selectedOpt = selectEl.options[selectEl.selectedIndex];
        const stock = selectedOpt ? (parseInt(selectedOpt.getAttribute('data-stock'), 10) || 0) : 0;
        const needed = parseInt(qtyInput.value, 10) || 1;

        if (stock >= needed) {
            stockBadge.className = 'part-stock-badge border text-nowrap flex-shrink-0 bg-success-subtle text-success border-success-subtle';
            stockBadge.textContent = `In Stock: ${stock}`;
        } else {
            stockBadge.className = 'part-stock-badge border text-nowrap flex-shrink-0 bg-danger-subtle text-danger border-danger-subtle';
            stockBadge.textContent = `In Stock: ${stock} (Shortage)`;
        }
    }

    selectEl.addEventListener('change', updateStockBadge);
    qtyInput.addEventListener('input', updateStockBadge);
    updateStockBadge();

    row.querySelector('.btn-remove-part').addEventListener('click', () => row.remove());
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

    const rows = document.querySelectorAll('#build-parts-list .build-part-row');
    const items = Array.from(rows).map(row => ({
        item_id: parseInt(row.querySelector('.build-part-select').value, 10),
        quantity_needed: parseInt(row.querySelector('.build-part-qty').value, 10) || 1
    }));

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
            buildEditModal.hide();
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
    if (editBtn) openEditBuildModal(editBtn.dataset.buildId);
    if (delBtn) deleteBuild(delBtn.dataset.buildId, delBtn.dataset.buildName);
});

let mapModal = null;
let mapModalVisible = false;
let currentMapEsp = null;

document.addEventListener('DOMContentLoaded', function () {
    mapModal = new bootstrap.Modal(document.getElementById('map-modal'));

    const modalEl = document.getElementById('map-modal');
    modalEl.addEventListener('shown.bs.modal', () => { mapModalVisible = true; });
    modalEl.addEventListener('hidden.bs.modal', () => { mapModalVisible = false; });
});

document.getElementById('open-map-btn').addEventListener('click', openMapModal);

async function openMapModal() {
    // Refresh ESPs if empty
    if (!ESPs || ESPs.length === 0) {
        try {
            const espRes = await fetch('/api/esp');
            if (espRes.ok) ESPs = await espRes.json();
        } catch (e) {
            console.error('Error fetching ESPs for map:', e);
        }
    }

    if (!ESPs || ESPs.length === 0) {
        alert('No ESP devices configured.');
        return;
    }

    // Always fetch latest items from the server so the map is guaranteed to be current without page reload
    try {
        const itemRes = await fetch('/api/items');
        if (itemRes.ok) {
            fetchedItems = await itemRes.json();
        }
    } catch (e) {
        console.error('Error refreshing items for map:', e);
    }

    // Use currently active ESP filter if set, otherwise single ESP or picker
    let esp = null;
    if (typeof filterESP !== 'undefined' && filterESP.length > 0) {
        esp = ESPs.find(e =>
            filterESP.some(f =>
                f.toLowerCase() === e.name.toLowerCase() ||
                f.toLowerCase() === e.esp_ip.toLowerCase()
            )
        );
    }
    if (!esp && ESPs.length === 1) {
        esp = ESPs[0];
    }

    if (esp) {
        showMapForEsp(esp);
    } else {
        showEspPicker();
    }
}

function showEspPicker() {
    document.getElementById('map-modal-title').textContent = 'Select a storage location';
    document.getElementById('map-esp-picker').innerHTML =
        ESPs.map(e =>
            `<button class="btn btn-outline-secondary me-2 mb-2" onclick="showMapForEsp(ESPs.find(x=>x.id==${e.id}))">${escapeHtml(e.name)}</button>`
        ).join('');
    document.getElementById('map-esp-picker').classList.remove('d-none');
    document.getElementById('map-canvas-container').classList.add('d-none');
    document.getElementById('map-side-panel').classList.add('d-none');
    if (!mapModalVisible) mapModal.show();
}

function showMapForEsp(esp) {
    currentMapEsp = esp;
    document.getElementById('map-modal-title').textContent = `Map \u2013 ${esp.name}`;
    document.getElementById('map-esp-picker').classList.add('d-none');
    document.getElementById('map-canvas-container').classList.remove('d-none');
    document.getElementById('map-side-panel').classList.remove('d-none');
    resetMapPanel();

    if (!mapModalVisible) {
        document.getElementById('map-modal').addEventListener('shown.bs.modal', function handler() {
            drawMapCanvas(esp);
            document.getElementById('map-modal').removeEventListener('shown.bs.modal', handler);
        });
        mapModal.show();
    } else {
        setTimeout(() => drawMapCanvas(esp), 50);
    }
}

function resetMapPanel() {
    document.getElementById('map-items-heading').textContent = '';
    document.getElementById('map-items-list').innerHTML =
        '<p class="text-muted small">Click an LED position to see which items are stored there.</p>';
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
        container.style.overflowX = 'scroll';
    } else {
        canvas.width = containerWidth;
        container.style.overflowX = 'hidden';
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
        container.style.overflowX = 'scroll';
    } else {
        canvas.width = containerWidth;
        container.style.overflowX = 'hidden';
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

            const occupancy = buildOccupancyMap(esp);
            renderMapItems(ledNum, occupancy[ledNum] || []);
            return;
        }
        currentSecY += secHeight;
        cumLedOffset += s.rows * s.cols;
    }
}

function parsePositions(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(Number).filter(n => !isNaN(n));
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.map(Number).filter(n => !isNaN(n));
            if (typeof parsed === 'number') return [parsed];
        } catch (e) {}
        const cleaned = raw.replace(/[\[\]\s]/g, '');
        if (!cleaned) return [];
        return cleaned.split(',').map(Number).filter(n => !isNaN(n));
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
    const ip = (item.ip || '').trim().toLowerCase();
    const espName = (esp.name || '').trim().toLowerCase();
    const espIp = (esp.esp_ip || '').trim().toLowerCase();
    return ip === espName || ip === espIp;
}

function handleMapClick(event, esp, boxSize, lw, startX, startY, serpDir) {
    const canvas = document.getElementById('map-responsive-canvas');
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const row = Math.floor(y / boxSize);
    const col = Math.floor(x / boxSize);
    const ledNum = calculateLedNumber(row, col, startX, startY, serpDir, parseInt(esp.rows), parseInt(esp.cols));
    const occupancy = buildOccupancyMap(esp);
    renderMapItems(ledNum, occupancy[ledNum] || []);
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
                ? `<img src="${safeUrl(item.image)}" style="width:44px;height:44px;object-fit:cover;flex-shrink:0;" class="rounded me-2">`
                : '<div style="width:44px;height:44px;flex-shrink:0;" class="me-2 bg-secondary rounded opacity-25"></div>'}
            <div class="overflow-hidden">
                <div class="fw-semibold small text-truncate">${escapeHtml(item.name)}</div>
                <div class="text-muted small">Stock: ${item.quantity}</div>
            </div>
        </div>
    `).join('');
}

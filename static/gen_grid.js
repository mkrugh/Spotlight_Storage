let clickedCells = [];
let selectedCells = [];
let occupiedCells = [];
let isEventListened = false;
let canvas;

function getActiveSections(mode) {
    if (mode === "esp") {
        const isMulti = document.getElementById('esp_grid_type_multi')?.checked;
        if (isMulti && typeof currentEspSections !== 'undefined' && Array.isArray(currentEspSections) && currentEspSections.length > 0) {
            return currentEspSections;
        }
        return null;
    } else if (mode === "item") {
        const selectEspDropdown = document.getElementById('item_esp_select');
        if (selectEspDropdown && selectEspDropdown.selectedIndex >= 0) {
            const raw = selectEspDropdown.options[selectEspDropdown.selectedIndex]?.dataset?.espSections;
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
                } catch(e) {}
            }
        }
        return null;
    }
    return null;
}

function drawMultiSectionGrid(mode, sections) {
    const canvasContainer = document.getElementById(mode + '-canvas-container');
    const responsiveCanvas = document.getElementById(mode + '-responsive-canvas');
    if (!canvasContainer || !responsiveCanvas) return;
    const theme = localStorage.getItem('theme');

    let containerStyle = window.getComputedStyle(canvasContainer);
    let containerPadding = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
    let containerWidth = canvasContainer.clientWidth - containerPadding;

    const normalizedSections = sections.map(s => ({
        rows: Math.max(1, parseInt(s.rows) || 1),
        cols: Math.max(1, parseInt(s.cols) || 1),
        start_left: String(s.start_left || 'left').toLowerCase() === '1' ? 'right' : String(s.start_left || 'left').toLowerCase(),
        start_top: String(s.start_top || 'top').toLowerCase(),
        serpentine_direction: String(s.serpentine_direction || 'horizontal').toLowerCase() === '1' ? 'vertical' : String(s.serpentine_direction || 'horizontal').toLowerCase()
    }));

    const totalRows = normalizedSections.reduce((sum, s) => sum + s.rows, 0);
    const maxCols = Math.max(...normalizedSections.map(s => s.cols));
    const totalLeds = normalizedSections.reduce((sum, s) => sum + (s.rows * s.cols), 0);

    let lineWidth = 2;
    let halfLineWidth = lineWidth / 2;
    let boxHeight = Math.max(50, Math.floor((containerWidth - lineWidth) / maxCols));

    if ((containerWidth - lineWidth) / maxCols < 50) {
        boxHeight = 50;
        responsiveCanvas.width = 50 * maxCols + lineWidth;
        canvasContainer.style.overflowX = 'scroll';
    } else {
        responsiveCanvas.width = containerWidth;
        canvasContainer.style.overflowX = 'hidden';
    }
    responsiveCanvas.height = boxHeight * totalRows + lineWidth;

    const ctx = responsiveCanvas.getContext('2d');
    ctx.clearRect(0, 0, responsiveCanvas.width, responsiveCanvas.height);

    const lineColour = "#0d6efd";
    const gridColour = "#6c757d";

    let currentSecY = 0;
    let cumLedOffset = 0;
    let lastSectionExitPos = null;

    // Draw grid lines, serpentine lines, and section jumpers
    normalizedSections.forEach((s, secIdx) => {
        const secHeight = s.rows * boxHeight;
        const colWidth = (responsiveCanvas.width - lineWidth) / s.cols;

        // Grid lines for this section
        ctx.strokeStyle = gridColour;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([]);

        // Horizontal grid lines
        for (let r = 0; r <= s.rows; r++) {
            const y = currentSecY + r * boxHeight + halfLineWidth;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(responsiveCanvas.width, y);
            ctx.stroke();
        }
        // Vertical grid lines
        for (let c = 0; c <= s.cols; c++) {
            const x = c * colWidth + halfLineWidth;
            ctx.beginPath();
            ctx.moveTo(x, currentSecY + halfLineWidth);
            ctx.lineTo(x, currentSecY + secHeight + halfLineWidth);
            ctx.stroke();
        }

        // Section divider line
        if (secIdx > 0) {
            ctx.lineWidth = lineWidth * 2;
            ctx.strokeStyle = '#495057';
            ctx.beginPath();
            ctx.moveTo(0, currentSecY + halfLineWidth);
            ctx.lineTo(responsiveCanvas.width, currentSecY + halfLineWidth);
            ctx.stroke();
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = gridColour;
        }

        // Serpentine wiring line
        ctx.strokeStyle = lineColour;
        ctx.lineWidth = lineWidth;
        if (s.serpentine_direction === "horizontal") {
            // Horizontal row segments
            for (let r = 0; r < s.rows; r++) {
                const y = currentSecY + r * boxHeight + boxHeight / 2 + halfLineWidth;
                ctx.beginPath();
                ctx.moveTo(colWidth / 2 + halfLineWidth, y);
                ctx.lineTo(responsiveCanvas.width - colWidth / 2 - halfLineWidth, y);
                ctx.stroke();
            }

            // Vertical turn segments between consecutive rows
            for (let r = 0; r < s.rows - 1; r++) {
                let turnOnRight;
                if (s.start_top === "top") {
                    turnOnRight = (s.start_left === "left") ? (r % 2 === 0) : (r % 2 === 1);
                } else {
                    const fromBottom = s.rows - r - 2;
                    turnOnRight = (s.start_left === "left") ? (fromBottom % 2 === 0) : (fromBottom % 2 === 1);
                }
                const turnX = turnOnRight
                    ? responsiveCanvas.width - colWidth / 2 - halfLineWidth
                    : colWidth / 2 + halfLineWidth;
                const y1 = currentSecY + r * boxHeight + boxHeight / 2 + halfLineWidth;
                const y2 = currentSecY + (r + 1) * boxHeight + boxHeight / 2 + halfLineWidth;

                ctx.beginPath();
                ctx.moveTo(turnX, y1);
                ctx.lineTo(turnX, y2);
                ctx.stroke();
            }
        } else {
            // Vertical serpentine segments
            for (let c = 0; c < s.cols; c++) {
                const x = c * colWidth + colWidth / 2 + halfLineWidth;
                ctx.beginPath();
                ctx.moveTo(x, currentSecY + boxHeight / 2 + halfLineWidth);
                ctx.lineTo(x, currentSecY + secHeight - boxHeight / 2 - halfLineWidth);
                ctx.stroke();
            }
            for (let c = 0; c < s.cols - 1; c++) {
                let turnOnBottom;
                if (s.start_left === "left") {
                    turnOnBottom = (s.start_top === "top") ? (c % 2 === 0) : (c % 2 === 1);
                } else {
                    const fromRight = s.cols - c - 2;
                    turnOnBottom = (s.start_top === "top") ? (fromRight % 2 === 0) : (fromRight % 2 === 1);
                }
                const turnY = turnOnBottom
                    ? currentSecY + secHeight - boxHeight / 2 - halfLineWidth
                    : currentSecY + boxHeight / 2 + halfLineWidth;
                const x1 = c * colWidth + colWidth / 2 + halfLineWidth;
                const x2 = (c + 1) * colWidth + colWidth / 2 + halfLineWidth;

                ctx.beginPath();
                ctx.moveTo(x1, turnY);
                ctx.lineTo(x2, turnY);
                ctx.stroke();
            }
        }

        // Inter-section wiring jumper
        let entryCoords = null;
        let exitCoords = null;
        const sectionLedCount = s.rows * s.cols;
        for (let r = 0; r < s.rows; r++) {
            for (let c = 0; c < s.cols; c++) {
                const localLed = calculateLedNumber(r, c, s.start_left, s.start_top, s.serpentine_direction, s.rows, s.cols);
                const cx = c * colWidth + colWidth / 2 + halfLineWidth;
                const cy = currentSecY + r * boxHeight + boxHeight / 2 + halfLineWidth;
                if (localLed === 1) entryCoords = { x: cx, y: cy };
                if (localLed === sectionLedCount) exitCoords = { x: cx, y: cy };
            }
        }

        if (lastSectionExitPos && entryCoords) {
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = '#20c997'; // Distinct jumper color
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(lastSectionExitPos.x, lastSectionExitPos.y);
            ctx.lineTo(entryCoords.x, entryCoords.y);
            ctx.stroke();
            ctx.restore();
        }

        lastSectionExitPos = exitCoords;
        currentSecY += secHeight;
    });

    // Draw LED circles and drawer numbers
    currentSecY = 0;
    cumLedOffset = 0;
    normalizedSections.forEach(s => {
        const secHeight = s.rows * boxHeight;
        const colWidth = (responsiveCanvas.width - lineWidth) / s.cols;
        const minCellDim = Math.min(colWidth, boxHeight);
        const circleRadius = minCellDim / 15;
        const indicatorCircleRadius = minCellDim / 8;

        for (let r = 0; r < s.rows; r++) {
            for (let c = 0; c < s.cols; c++) {
                const localLed = calculateLedNumber(r, c, s.start_left, s.start_top, s.serpentine_direction, s.rows, s.cols);
                const globalLed = cumLedOffset + localLed;

                const cx = c * colWidth + colWidth / 2 + halfLineWidth;
                const cy = currentSecY + r * boxHeight + boxHeight / 2 + halfLineWidth;

                const isStart = globalLed === 1;
                const isEnd = globalLed === totalLeds;
                const isClicked = mode === "item" && clickedCells.includes(globalLed);
                const isOccupied = mode === "item" && occupiedCells.includes(globalLed);

                ctx.beginPath();
                if (isClicked) {
                    ctx.arc(cx, cy, indicatorCircleRadius, 0, Math.PI * 2);
                    ctx.fillStyle = '#003ef8';
                } else if (isStart) {
                    ctx.arc(cx, cy, indicatorCircleRadius, 0, Math.PI * 2);
                    ctx.fillStyle = '#198754';
                } else if (isEnd) {
                    ctx.arc(cx, cy, indicatorCircleRadius, 0, Math.PI * 2);
                    ctx.fillStyle = '#dc3545';
                } else if (isOccupied) {
                    ctx.arc(cx, cy, minCellDim / 11, 0, Math.PI * 2);
                    ctx.fillStyle = '#fd7e14';
                } else {
                    ctx.arc(cx, cy, circleRadius, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffc107';
                }
                ctx.fill();

                // Drawer number text
                ctx.fillStyle = (theme === 'dark') ? 'white' : 'black';
                ctx.font = `${minCellDim / 4.5}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(globalLed.toString(), cx + minCellDim / 5, cy - minCellDim / 5);
            }
        }

        currentSecY += secHeight;
        cumLedOffset += s.rows * s.cols;
    });

    if (mode === "item") {
        responsiveCanvas.onclick = function (event) {
            handleCellClick(event, mode);
        };
    }
    setupCanvasHoverTracking(mode);
}

function redrawMultiSectionGrid(mode, sections) {
    drawMultiSectionGrid(mode, sections);
}

function drawGrid(mode, rows, columns, startX, startY, serpentineDirection) {
    const activeSections = getActiveSections(mode);
    if (activeSections) {
        drawMultiSectionGrid(mode, activeSections);
        return;
    }

    // Convert string values to lowercase
    if (typeof startX === 'string') {
        startX = startX.toLowerCase();
    }
    if (typeof startY === 'string') {
        startY = startY.toLowerCase();
    }
    if (typeof serpentineDirection === 'string') {
        serpentineDirection = serpentineDirection.toLowerCase();
    }

    const canvasContainer = document.getElementById(mode + '-canvas-container');
    const responsiveCanvas = document.getElementById(mode + '-responsive-canvas');
    const theme = localStorage.getItem('theme')

    // Get the actual pixel width of the canvas container
    let containerStyle = window.getComputedStyle(canvasContainer);
    let containerPadding = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
    let containerWidth = canvasContainer.clientWidth - containerPadding;
    let containerHeight = canvasContainer.clientHeight;
    responsiveCanvas.width = containerWidth;
    responsiveCanvas.height = containerHeight;
    if (mode === "esp") {
        rows = parseInt(document.getElementById('esp_rows').value);
        columns = parseInt(document.getElementById('esp_columns').value);
        startX = document.getElementById('esp_startx').options[document.getElementById('esp_startx').selectedIndex].getAttribute("data-startx").toLowerCase();
        startY = document.getElementById('esp_starty').options[document.getElementById('esp_starty').selectedIndex].getAttribute("data-starty").toLowerCase();
        serpentineDirection = document.getElementById('esp_serpentine').options[document.getElementById('esp_serpentine').selectedIndex].getAttribute("data-serpentine").toLowerCase();

    }else {
        if (startX == 1) {
            startX = "right";
        }

        if (serpentineDirection == 1) {
            serpentineDirection =  "vertical";
        }
    }
    columns = parseInt(columns);
    rows = parseInt(rows);

    //console.log("startX: " + startX + ", " + "startY: " + startY + ", " + "serpentineDirection: " + serpentineDirection)
    canvas = document.getElementById(mode + '-responsive-canvas');
    let ctx = canvas.getContext('2d');
    let lineWidth = 2;
    let boxSize = (canvas.width - lineWidth) / columns;

    //Overflow detection if canvas is too small for amount of columns
    if (boxSize <= 60) {
        boxSize = 60;
        canvas.width = (boxSize * columns) + lineWidth;
        canvasContainer.style.overflowX = 'scroll';

    }
    canvas.height = (boxSize * rows) + lineWidth;
   
    let lineColour = "#0d6efd";
    let gridColour = "#6c757d";
    let offset = 0;
    let startIndicatorX = 0
    let startIndicatorY = 0
    let endIndicatorX = 0
    let endIndicatorY = 0
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = lineWidth;
    let halfLineWidth = lineWidth / 2;
    // Draw grid
    ctx.strokeStyle = gridColour;
    for (let i = 0; i <= rows; i++) {
        ctx.beginPath();
        let y = i * boxSize + halfLineWidth; // Add half of the line width
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    for (let j = 0; j <= columns; j++) {
        ctx.beginPath();
        let x = j * boxSize + halfLineWidth; // Add half of the line width
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    // Draw line
    ctx.strokeStyle = lineColour;
    if (serpentineDirection === "horizontal") {
        // Draw horizontal lines
        for (let i = 0; i <= rows - 1; i++) {
            ctx.beginPath();
            const y = (i * boxSize + halfLineWidth) + (boxSize / 2); // Add half of the line width
            ctx.moveTo(boxSize / 2, y);
            ctx.lineTo(canvas.width - (boxSize / 2), y);
            ctx.stroke();
        }
        if (startY === "top") {
            startIndicatorY = 0;
            endIndicatorY = rows - 1;
        } else if (startY === "bottom") {
            startIndicatorY = rows - 1;
            endIndicatorY = 0;
        }
        if (startX === "left") {
            startIndicatorX = 0;
            endIndicatorX = rows % 2 ? columns - 1 : 0;
        } else if (startX === "right") {
            startIndicatorX = columns - 1;
            endIndicatorX = rows % 2 ? 0 : columns - 1;
        }

        // Draw vertical turns between rows
        for (let r = 0; r < rows - 1; r++) {
            let turnOnRight;
            if (startY === "top") {
                turnOnRight = (startX === "left") ? (r % 2 === 0) : (r % 2 === 1);
            } else {
                const fromBottom = rows - r - 2;
                turnOnRight = (startX === "left") ? (fromBottom % 2 === 0) : (fromBottom % 2 === 1);
            }
            const turnX = turnOnRight
                ? (columns - 1) * boxSize + boxSize / 2 + halfLineWidth
                : boxSize / 2 + halfLineWidth;
            const y1 = r * boxSize + boxSize / 2 + halfLineWidth;
            const y2 = (r + 1) * boxSize + boxSize / 2 + halfLineWidth;

            ctx.beginPath();
            ctx.moveTo(turnX, y1);
            ctx.lineTo(turnX, y2);
            ctx.stroke();
        }
    } else {
        // Draw vertical lines
        for (let i = 0; i <= columns - 1; i++) {
            ctx.beginPath();
            let x = (i * boxSize + halfLineWidth) + (boxSize / 2); // Add half of the line width
            ctx.moveTo(x, boxSize / 2);
            ctx.lineTo(x, canvas.height - (boxSize / 2));
            ctx.stroke();
        }

        if (startX === "left" && startY === "top") {
            startIndicatorX = 0;
            startIndicatorY = 0;
            endIndicatorX = columns - 1;
            endIndicatorY = columns % 2 ? rows - 1 : 0;
        } else if (startX === "right" && startY === "top") {
            startIndicatorX = columns - 1;
            startIndicatorY = 0;
            endIndicatorX = 0;
            endIndicatorY = columns % 2 ? rows - 1 : 0;
        } else if (startX === "left" && startY === "bottom") {
            startIndicatorY = rows - 1;
            startIndicatorX = 0;
            endIndicatorX = columns - 1;
            endIndicatorY = columns % 2 ? 0 : rows - 1;
        } else if (startX === "right" && startY === "bottom") {
            startIndicatorY = rows - 1;
            startIndicatorX = columns - 1;
            endIndicatorX = 0;
            endIndicatorY = columns % 2 ? 0 : rows - 1;
        }

        // Draw horizontal turns between columns
        for (let c = 0; c < columns - 1; c++) {
            let turnOnBottom;
            if (startX === "left") {
                turnOnBottom = (startY === "top") ? (c % 2 === 0) : (c % 2 === 1);
            } else {
                const fromRight = columns - c - 2;
                turnOnBottom = (startY === "top") ? (fromRight % 2 === 0) : (fromRight % 2 === 1);
            }
            const turnY = turnOnBottom
                ? (rows - 1) * boxSize + boxSize / 2 + halfLineWidth
                : boxSize / 2 + halfLineWidth;
            const x1 = c * boxSize + boxSize / 2 + halfLineWidth;
            const x2 = (c + 1) * boxSize + boxSize / 2 + halfLineWidth;

            ctx.beginPath();
            ctx.moveTo(x1, turnY);
            ctx.lineTo(x2, turnY);
            ctx.stroke();
        }
    }

    // Draw circles in the middle of each grid square
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < columns; j++) {
            let circleCenterX = j * boxSize + boxSize / 2 + halfLineWidth;
            let circleCenterY = i * boxSize + boxSize / 2 + halfLineWidth;
            let circleRadius = Math.min(boxSize, boxSize) / 15;
            ctx.beginPath();
            ctx.arc(circleCenterX, circleCenterY, circleRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#ffc107';
            ctx.fill();

            // Draw the cell number

            if (theme === 'dark') {
                ctx.fillStyle = 'white'; // Set text color for dark theme
            } else {
                ctx.fillStyle = 'black'; // Set text color for light theme or other themes
            }
            ctx.font = `${boxSize / 5}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const cellNumber = calculateLedNumber(i, j, startX, startY, serpentineDirection, rows, columns);
            ctx.fillText(cellNumber.toString(), circleCenterX + boxSize/5, circleCenterY - boxSize/5);
        }
    }
    let indicatorCircleRadius = Math.min(boxSize, boxSize) / 8;
    let startCircleCenterX = startIndicatorX * boxSize + boxSize / 2 + halfLineWidth;
    let startCircleCenterY = startIndicatorY * boxSize + boxSize / 2 + halfLineWidth;
    ctx.beginPath();
    ctx.arc(startCircleCenterX, startCircleCenterY, indicatorCircleRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#198754';
    ctx.fill();
    let endCircleCenterX = endIndicatorX * boxSize + boxSize / 2 + halfLineWidth;
    let endCircleCenterY = endIndicatorY * boxSize + boxSize / 2 + halfLineWidth;
    ctx.beginPath();
    ctx.arc(endCircleCenterX, endCircleCenterY, indicatorCircleRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#dc3545';
    ctx.fill();

    if (mode === "item") {
        responsiveCanvas.onclick = function (event) {
            handleCellClick(event, "item");
        };
        redrawGrid(rows, columns, "item", startX, startY, serpentineDirection);
    }
    setupCanvasHoverTracking(mode);
}
function handleCellClick(event, mode) {
    const activeSections = getActiveSections(mode);
    if (activeSections) {
        const canvas = document.getElementById(mode + '-responsive-canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;

        const normalizedSections = activeSections.map(s => ({
            rows: Math.max(1, parseInt(s.rows) || 1),
            cols: Math.max(1, parseInt(s.cols) || 1),
            start_left: String(s.start_left || 'left').toLowerCase() === '1' ? 'right' : String(s.start_left || 'left').toLowerCase(),
            start_top: String(s.start_top || 'top').toLowerCase(),
            serpentine_direction: String(s.serpentine_direction || 'horizontal').toLowerCase() === '1' ? 'vertical' : String(s.serpentine_direction || 'horizontal').toLowerCase()
        }));
        const maxCols = Math.max(...normalizedSections.map(s => s.cols));
        let lineWidth = 2;
        let boxHeight = Math.max(50, Math.floor((canvas.width - lineWidth) / maxCols));

        let currentSecY = 0;
        let cumLedOffset = 0;

        for (const s of normalizedSections) {
            const secHeight = s.rows * boxHeight;
            if (y >= currentSecY && y < currentSecY + secHeight) {
                const r = Math.max(0, Math.min(s.rows - 1, Math.floor((y - currentSecY) / boxHeight)));
                const colWidth = (canvas.width - lineWidth) / s.cols;
                const c = Math.max(0, Math.min(s.cols - 1, Math.floor(x / colWidth)));
                const localLed = calculateLedNumber(r, c, s.start_left, s.start_top, s.serpentine_direction, s.rows, s.cols);
                const globalLed = cumLedOffset + localLed;

                const cellIndex = clickedCells.indexOf(globalLed);
                if (cellIndex === -1) {
                    clickedCells.push(globalLed);
                } else {
                    clickedCells.splice(cellIndex, 1);
                }

                localStorage.setItem('led_positions', JSON.stringify(clickedCells));
                redrawMultiSectionGrid(mode, normalizedSections);
                return;
            }
            currentSecY += secHeight;
            cumLedOffset += s.rows * s.cols;
        }
        return;
    }

    const selectEspDropdown = document.getElementById('item_esp_select');
    if (!selectEspDropdown || selectEspDropdown.selectedIndex < 0) return;
    const selectedOption = selectEspDropdown.options[selectEspDropdown.selectedIndex];
    if (!selectedOption) return;

    const rows = parseInt(selectedOption.getAttribute("data-esp-rows")) || 1;
    const columns = parseInt(selectedOption.getAttribute("data-esp-columns")) || 1;
    let startX = (selectedOption.getAttribute("data-esp-start-x") || "left").toLowerCase();
    const startY = (selectedOption.getAttribute("data-esp-start-y") || "top").toLowerCase();
    let serpentineDirection = (selectedOption.getAttribute("data-esp-serpentine") || "horizontal").toLowerCase();

    if (startX == 1) {
        startX = "right";
    }
    if (serpentineDirection == 1) {
        serpentineDirection = "vertical";
    }

    const canvas = document.getElementById(mode + '-responsive-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    let lineWidth = 2;
    let boxSize = (canvas.width - lineWidth) / columns;
    if (boxSize <= 60) {
        boxSize = 60;
    }

    let clickedRow = Math.min(rows - 1, Math.max(0, Math.floor(y / boxSize)));
    let clickedColumn = Math.min(columns - 1, Math.max(0, Math.floor(x / boxSize)));

    const ledNumber = calculateLedNumber(clickedRow, clickedColumn, startX, startY, serpentineDirection, rows, columns);

    let cellIndex = clickedCells.indexOf(ledNumber);
    if (cellIndex === -1) {
        clickedCells.push(ledNumber);
    } else {
        clickedCells.splice(cellIndex, 1);
    }

    localStorage.setItem('led_positions', JSON.stringify(clickedCells));
    redrawGrid(rows, columns, "item", startX, startY, serpentineDirection);
}


function calculateLedNumber(row, column, startX, startY, serpentineDirection, rows, columns) {
    if (startX === "right") {
        column = columns - column; // Ensure accurate column reversal
    }
        if (startY === "bottom") {
            row = rows - row;
        }

        if (serpentineDirection === "horizontal") {
            row = startY !== "bottom" ? row + 1 : row;
            column = startX !== "left" ? column - 1 : column;
            const isEvenRow = row % 2 === 0;
            return isEvenRow ? row * columns - (columns - (columns - column)) : row * columns - (columns - column) + 1;
        } else {
            column = startX !== "right" ? column + 1 : column;
            row = startY !== "top" ? row - 1 : row;

            const isEvenColumn = column % 2 === 0;
            return isEvenColumn ? column * rows - (rows - (rows - row)) : column * rows - (rows - row) + 1;
        }
}

function redrawGrid(rows, columns, mode, startX, startY, serpentineDirection) {
    const activeSections = getActiveSections(mode);
    if (activeSections) {
        redrawMultiSectionGrid(mode, activeSections);
        return;
    }

    canvas = document.getElementById(mode + '-responsive-canvas');

    let ctx = canvas.getContext('2d');
    let lineWidth = 2;
    let boxSize = (canvas.width - lineWidth) / columns;
    if(boxSize <= 60) {
        boxSize = 60;
    }
    ctx.lineWidth = lineWidth;
    let halfLineWidth = lineWidth / 2;
    let circleRadius = Math.min(boxSize, boxSize) / 15;
    let indicatorCircleRadius = Math.min(boxSize, boxSize) / 8;
    // Loop through rows and columns of the grid
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < columns; j++) {
            let cellNumber = calculateLedNumber(i, j, startX, startY, serpentineDirection, rows, columns);
            let isClicked = clickedCells.includes(cellNumber);
            let isOccupied = occupiedCells.includes(cellNumber);
            // Check if the current cell is the start or end point
            let isStartPoint = cellNumber === 1
            let isEndPoint = cellNumber === rows*columns ;
            // Calculate the center and radius of the circle to be drawn for each cell
            let circleCenterX = j * boxSize + boxSize / 2 + halfLineWidth;
            let circleCenterY = i * boxSize + boxSize / 2 + halfLineWidth;


            // Draw the cell with the number
            ctx.beginPath();

            // Change color based on the state
            if (isStartPoint && !isClicked) {
                ctx.arc(circleCenterX, circleCenterY, indicatorCircleRadius, 0, Math.PI * 2);
                ctx.fillStyle = '#198754'; // Change color for start point
            } else if (isEndPoint && !isClicked) {
                ctx.arc(circleCenterX, circleCenterY, indicatorCircleRadius, 0, Math.PI * 2);
                ctx.fillStyle = '#dc3545'; // Change color for end point
            } else if (isOccupied && !isClicked) {
                ctx.arc(circleCenterX, circleCenterY, Math.min(boxSize, boxSize) / 11, 0, Math.PI * 2);
                ctx.fillStyle = '#fd7e14'; // Orange: position occupied by another item
            } else {
                ctx.arc(circleCenterX, circleCenterY, circleRadius, 0, Math.PI * 2);
                ctx.fillStyle = isClicked ? '#003ef8' : '#ffc107';
            }
            ctx.fill();

        }
    }
}



function TestLights() {
    const selectedEspIndex = selectEspDropdown.selectedIndex;
    const selectedEsp = selectEspDropdown.options[selectedEspIndex];
    if (selectedEsp.disabled) {
        // Nothing is selected or "Please add an ESP device first..." is selected, so we can't proceed
        alert("Please select an ESP to Test.");
        return;
    }
    const ip = selectedEsp.dataset.espIp;
    const data = {};
    data[ip] = clickedCells;
    fetch('/test_lights', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    })
        .then(response => response.json())
        .then()
        .catch((error) => {
            console.error('Error:', error);
        });
}


function clearAll() {
    clickedCells.length = 0;
    selectedCells.length = 0;
    // Clear the stored data in the 'led_positions' key
    localStorage.removeItem('led_positions');

    const activeSections = getActiveSections("item");
    if (activeSections) {
        redrawMultiSectionGrid("item", activeSections);
        return;
    }

    const selectEspDropdown = document.getElementById('item_esp_select');
    if (!selectEspDropdown || selectEspDropdown.selectedIndex < 0) return;
    const selectedOption = selectEspDropdown.options[selectEspDropdown.selectedIndex];
    if (!selectedOption) return;

    const rows = parseInt(selectedOption.getAttribute("data-esp-rows")) || 1;
    const columns = parseInt(selectedOption.getAttribute("data-esp-columns")) || 1;
    let startX = (selectedOption.getAttribute("data-esp-start-x") || "left").toLowerCase();
    const startY = (selectedOption.getAttribute("data-esp-start-y") || "top").toLowerCase();
    let serpentineDirection = (selectedOption.getAttribute("data-esp-serpentine") || "horizontal").toLowerCase();
    if (startX == 1) {
        startX = "right";
    }
    if (serpentineDirection == 1) {
        serpentineDirection = "vertical";
    }
    redrawGrid(parseInt(rows), parseInt(columns), "item", startX, startY, serpentineDirection);
}

function submitLights() {
    const sortedCells = [...clickedCells].map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
    localStorage.setItem('led_positions', JSON.stringify(sortedCells));
}

document.getElementById('test_led_button').addEventListener('click',TestLights);
document.getElementById('clear_led_button').addEventListener('click',clearAll);


function convertLedNumber(ledNumber, startX, startY, serpentineDirection, rows, columns) {
    let row, column;

    // Convert LED number to zero-based index
    const index = ledNumber - 1;

    if (serpentineDirection === "horizontal") {
        // Handle horizontal serpentine direction
        row = Math.floor(index / columns);
        column = (row % 2 === 0) ? (index % columns) : (columns - 1 - (index % columns));
    } else { // serpentineDirection === "vertical"
        // Handle vertical serpentine direction
        column = Math.floor(index / rows);
        row = (column % 2 === 0) ? (index % rows) : (rows - 1 - (index % rows));
    }

    // Adjust for starting positions
    if (startX === "right") {
        column = columns - 1 - column;
    }
    if (startY === "bottom") {
        row = rows - 1 - row;
    }
    ledNumber = row * columns + column;

    return  ledNumber;
}

function hideHoverIndicators(mode) {
    const highlight = document.getElementById(`${mode}-cell-highlight`);
    const tooltip = document.getElementById(`${mode}-cell-tooltip`);
    if (highlight) highlight.classList.add('d-none');
    if (tooltip) tooltip.classList.add('d-none');
}

function getCellAtPointer(event, mode) {
    const canvas = document.getElementById(mode + '-responsive-canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const activeSections = getActiveSections(mode);
    if (activeSections) {
        const normalizedSections = activeSections.map(s => ({
            rows: Math.max(1, parseInt(s.rows) || 1),
            cols: Math.max(1, parseInt(s.cols) || 1),
            start_left: String(s.start_left || 'left').toLowerCase() === '1' ? 'right' : String(s.start_left || 'left').toLowerCase(),
            start_top: String(s.start_top || 'top').toLowerCase(),
            serpentine_direction: String(s.serpentine_direction || 'horizontal').toLowerCase() === '1' ? 'vertical' : String(s.serpentine_direction || 'horizontal').toLowerCase()
        }));
        const maxCols = Math.max(...normalizedSections.map(s => s.cols));
        let lineWidth = 2;
        let boxHeight = Math.max(50, Math.floor((canvas.width - lineWidth) / maxCols));
        let currentSecY = 0;
        let cumLedOffset = 0;

        for (let secIdx = 0; secIdx < normalizedSections.length; secIdx++) {
            const s = normalizedSections[secIdx];
            const secHeight = s.rows * boxHeight;
            if (y >= currentSecY && y < currentSecY + secHeight) {
                const r = Math.max(0, Math.min(s.rows - 1, Math.floor((y - currentSecY) / boxHeight)));
                const colWidth = (canvas.width - lineWidth) / s.cols;
                const c = Math.max(0, Math.min(s.cols - 1, Math.floor(x / colWidth)));
                const localLed = calculateLedNumber(r, c, s.start_left, s.start_top, s.serpentine_direction, s.rows, s.cols);
                const globalLed = cumLedOffset + localLed;

                const cellPixelX = (c * colWidth) / scaleX;
                const cellPixelY = (currentSecY + r * boxHeight) / scaleY;
                const cellPixelW = colWidth / scaleX;
                const cellPixelH = boxHeight / scaleY;

                return {
                    mode,
                    section: secIdx + 1,
                    totalSections: normalizedSections.length,
                    row: r + 1,
                    col: c + 1,
                    ledNumber: globalLed,
                    pixelX: cellPixelX,
                    pixelY: cellPixelY,
                    pixelW: cellPixelW,
                    pixelH: cellPixelH
                };
            }
            currentSecY += secHeight;
            cumLedOffset += s.rows * s.cols;
        }
        return null;
    }

    let rows, columns, startX, startY, serpentineDirection;
    if (mode === "esp") {
        rows = parseInt(document.getElementById('esp_rows')?.value) || 1;
        columns = parseInt(document.getElementById('esp_columns')?.value) || 1;
        const startXEl = document.getElementById('esp_startx');
        startX = (startXEl ? startXEl.options[startXEl.selectedIndex]?.getAttribute("data-startx") : "left")?.toLowerCase() || "left";
        const startYEl = document.getElementById('esp_starty');
        startY = (startYEl ? startYEl.options[startYEl.selectedIndex]?.getAttribute("data-starty") : "top")?.toLowerCase() || "top";
        const serpEl = document.getElementById('esp_serpentine');
        serpentineDirection = (serpEl ? serpEl.options[serpEl.selectedIndex]?.getAttribute("data-serpentine") : "horizontal")?.toLowerCase() || "horizontal";
    } else {
        const selectEspDropdown = document.getElementById('item_esp_select');
        if (!selectEspDropdown || selectEspDropdown.selectedIndex < 0) return null;
        const selectedOption = selectEspDropdown.options[selectEspDropdown.selectedIndex];
        if (!selectedOption) return null;

        rows = parseInt(selectedOption.getAttribute("data-esp-rows")) || 1;
        columns = parseInt(selectedOption.getAttribute("data-esp-columns")) || 1;
        startX = (selectedOption.getAttribute("data-esp-start-x") || "left").toLowerCase();
        startY = (selectedOption.getAttribute("data-esp-start-y") || "top").toLowerCase();
        serpentineDirection = (selectedOption.getAttribute("data-esp-serpentine") || "horizontal").toLowerCase();
        if (startX == '1') startX = "right";
        if (serpentineDirection == '1') serpentineDirection = "vertical";
    }

    let lineWidth = 2;
    let boxSize = (canvas.width - lineWidth) / columns;
    if (boxSize <= 60) boxSize = 60;

    const r = Math.min(rows - 1, Math.max(0, Math.floor(y / boxSize)));
    const c = Math.min(columns - 1, Math.max(0, Math.floor(x / boxSize)));
    const ledNumber = calculateLedNumber(r, c, startX, startY, serpentineDirection, rows, columns);

    const cellPixelX = (c * boxSize) / scaleX;
    const cellPixelY = (r * boxSize) / scaleY;
    const cellPixelW = boxSize / scaleX;
    const cellPixelH = boxSize / scaleY;

    return {
        mode,
        section: null,
        totalSections: 1,
        row: r + 1,
        col: c + 1,
        ledNumber,
        pixelX: cellPixelX,
        pixelY: cellPixelY,
        pixelW: cellPixelW,
        pixelH: cellPixelH,
        totalLeds: rows * columns
    };
}

function setupCanvasHoverTracking(mode) {
    const canvas = document.getElementById(`${mode}-responsive-canvas`);
    const container = document.getElementById(`${mode}-canvas-container`);
    const highlight = document.getElementById(`${mode}-cell-highlight`);
    const tooltip = document.getElementById(`${mode}-cell-tooltip`);

    if (!canvas || !container || !highlight || !tooltip) return;
    if (canvas.dataset.hoverInitialized === 'true') return;
    canvas.dataset.hoverInitialized = 'true';

    canvas.addEventListener('pointermove', function (e) {
        const cell = getCellAtPointer(e, mode);
        if (!cell) {
            highlight.classList.add('d-none');
            tooltip.classList.add('d-none');
            return;
        }

        // Highlight ring placement
        highlight.style.left = `${cell.pixelX}px`;
        highlight.style.top = `${cell.pixelY}px`;
        highlight.style.width = `${cell.pixelW}px`;
        highlight.style.height = `${cell.pixelH}px`;
        highlight.classList.remove('d-none');

        // Tooltip content
        let statusHtml = '';
        if (mode === 'item') {
            if (clickedCells.includes(cell.ledNumber)) {
                statusHtml = '<span class="badge bg-primary-subtle text-primary border border-primary-subtle px-1 py-0">Selected</span>';
            } else if (occupiedCells.includes(cell.ledNumber)) {
                statusHtml = '<span class="badge bg-warning-subtle text-warning border border-warning-subtle px-1 py-0">Occupied</span>';
            } else if (cell.ledNumber === 1) {
                statusHtml = '<span class="badge bg-success-subtle text-success border border-success-subtle px-1 py-0">Start LED #1</span>';
            } else {
                statusHtml = '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-1 py-0">Available</span>';
            }
        } else if (mode === 'esp') {
            if (cell.ledNumber === 1) {
                statusHtml = '<span class="badge bg-success-subtle text-success border border-success-subtle px-1 py-0">Start LED #1</span>';
            } else if (cell.totalLeds && cell.ledNumber === cell.totalLeds) {
                statusHtml = '<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-1 py-0">End LED</span>';
            }
        }

        const secInfo = cell.section ? `Sec ${cell.section} · ` : '';
        tooltip.innerHTML = `
            <div class="d-flex align-items-center gap-1.5 mb-0.5">
                <span class="fw-bold">Bin #${cell.ledNumber}</span>
                ${statusHtml}
            </div>
            <div class="text-body-secondary small">${secInfo}Row ${cell.row}, Col ${cell.col} (LED ${cell.ledNumber})</div>
        `;

        // Position tooltip centered horizontally above cell
        const tooltipX = cell.pixelX + cell.pixelW / 2;
        tooltip.style.left = `${tooltipX}px`;

        if (cell.pixelY < 50) {
            // Flip below if too close to top
            tooltip.style.top = `${cell.pixelY + cell.pixelH + 8}px`;
            tooltip.style.transform = 'translate(-50%, 0)';
        } else {
            tooltip.style.top = `${cell.pixelY}px`;
            tooltip.style.transform = 'translate(-50%, -100%)';
        }
        tooltip.classList.remove('d-none');
    });

    canvas.addEventListener('pointerleave', function () {
        hideHoverIndicators(mode);
    });
}

document.getElementById('item-modal')?.addEventListener('hidden.bs.modal', () => hideHoverIndicators('item'));
document.getElementById('esp-modal')?.addEventListener('hidden.bs.modal', () => hideHoverIndicators('esp'));




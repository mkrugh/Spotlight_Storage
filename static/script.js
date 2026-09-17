const selectEspDropdown = document.getElementById("item_esp_select");
let fetchedItems = []; // Define an array to store fetched items
let fetchedEsps = []; // Store fetched ESP devices

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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
    if (isEditingItem) {
        // Update existing item via PUT request
        fetch(`/api/items/${editingItemId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
        })
            .then((response) => response.json())
            .then((data) => {
                // Update the displayed item in the UI
                item.id = data.id;
                const idx = fetchedItems.findIndex(i => i.id == editingItemId);
                if (idx !== -1) {
                    fetchedItems[idx] = { ...fetchedItems[idx], ...item, id: data.id };
                }
                const col = document.getElementById('items-container-grid').querySelector(`div[data-id="${editingItemId}"]`);
                const updatedCol = createItem(item);
                document.getElementById('items-container-grid').replaceChild(updatedCol, col);
                if (typeof currentSortMethod !== 'undefined' && currentSortMethod) {
                    sortItems(currentSortMethod, currentSortDirection);
                }
                lucide.createIcons();
                fetchDataAndLoadTags();
                if (typeof mapModalVisible !== 'undefined' && mapModalVisible && currentMapEsp) {
                    drawMapCanvas(currentMapEsp);
                }
            })
            .catch((error) => console.error(error));
    } else {
        // Add a new item via POST request
        fetch("/api/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
        })
            .then((response) => response.json())
            .then((data) => {
                // Keep in-memory fetchedItems synchronized
                fetchedItems.push(data);
                // Create and append the new item to the UI
                const col = createItem(data);
                document.getElementById('items-container-grid').appendChild(col);
                if (typeof currentSortMethod !== 'undefined' && currentSortMethod) {
                    sortItems(currentSortMethod, currentSortDirection);
                }
                lucide.createIcons();
                fetchDataAndLoadTags();
                if (typeof mapModalVisible !== 'undefined' && mapModalVisible && currentMapEsp) {
                    drawMapCanvas(currentMapEsp);
                }
            })
            .catch((error) => console.error(error));
    }

    // Reset editing flag, remove local storage, and reset the modal
    isEditingItem = false;
    isCopyingItem = false;
    removeLocalStorage();
    resetModal();
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

            if (isEditingItem) {
                index = findIndexByIP(editingItemIP);
            }
            selectEspDropdown.selectedIndex = index;

        } else {
            // No devices found: Disable dropdown and display message
            selectEspDropdown.disabled = true;
            const messageOption = document.createElement("option");
            messageOption.textContent = "Please add an ESP device first...";
            messageOption.disabled = true;
            selectEspDropdown.appendChild(messageOption);
        }
        let rows = document.getElementById('item_esp_select').options[index].getAttribute("data-esp-rows");
        let columns = document.getElementById('item_esp_select').options[index].getAttribute("data-esp-columns");
        let startX = document.getElementById('item_esp_select').options[index].getAttribute("data-esp-start-x");
        let startY = document.getElementById('item_esp_select').options[index].getAttribute("data-esp-start-y");
        let serpentineDirection = document.getElementById('item_esp_select').options[index].getAttribute("data-esp-serpentine");
        const espIp = document.getElementById('item_esp_select').options[index].getAttribute("data-esp-ip");
        updateOccupiedCells(espIp);
        drawGrid("item", rows, columns, startX, startY, serpentineDirection);
    }).catch((error) => console.error(error));
}

document.getElementById('item-modal').addEventListener('show.bs.modal', function () {
    document.getElementById("item-error-alert").classList.add("d-none");
    document.getElementById("item-error-list").innerHTML = "";
    if (!isEditingItem && !isCopyingItem) {
        if (typeof updateItemImagePreview === 'function') {
            updateItemImagePreview('');
        }
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

function formatLocationBadge(positions) {
    if (!Array.isArray(positions) || positions.length === 0) return '';
    const count = positions.length;
    const allBinsText = positions.join(', ');
    let displayText = '';
    if (count === 1) {
        displayText = `Bin #${positions[0]}`;
    } else if (count === 2) {
        displayText = `Bins #${positions[0]}, #${positions[1]}`;
    } else {
        displayText = `Bins #${positions[0]}, #${positions[1]} (+${count - 2})`;
    }
    return `<span class="location-badge" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Bins: ${escapeHtml(allBinsText)}">${escapeHtml(displayText)}</span>`;
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
    const locationBadgeHtml = formatLocationBadge(item.position);
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
        ? `<img src="${safeUrl(item.image)}" class="dynamic-img" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.style.display='none'; this.parentElement.classList.add('placeholder-img-container'); const icon=document.createElement('i'); icon.setAttribute('data-lucide','package'); icon.className='placeholder-icon'; this.parentElement.appendChild(icon); if(window.lucide) lucide.createIcons();">`
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
            fetch(`/api/items/${item.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ action: "locate" }),
            }).catch((error) => console.error(error));
        });
    }

    col.querySelector('.locate-btn').addEventListener('click', () => {
        fetch(`/api/items/${item.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ action: "locate" }),
        }).catch((error) => console.error(error));
    });

    col.querySelector('.delete-btn').addEventListener('click', () => {
        const response = confirm(`Are you sure you want to delete ${item.name}?`);
        const id = item.id;
        const itemsContainer = document.getElementById('items-container-grid');
        if (response) {
            // Delete item from database
            fetch(`/api/items/${id}`, { method: "DELETE" })
                .then(() => {
                    const idx = fetchedItems.findIndex(i => i.id == id);
                    if (idx !== -1) {
                        fetchedItems.splice(idx, 1);
                    }
                    const col = itemsContainer.querySelector(`div[data-id="${id}"]`);
                    col.parentNode.removeChild(col);
                    const deleteTooltip = bootstrap.Tooltip.getInstance(col.querySelector('.delete-btn'));
                    if (deleteTooltip) {
                        deleteTooltip.hide();
                    }
                    fetchDataAndLoadTags();
                    if (typeof mapModalVisible !== 'undefined' && mapModalVisible && currentMapEsp) {
                        drawMapCanvas(currentMapEsp);
                    }
                })
                .catch((error) => console.error(error));
        }
    });

    col.querySelector('.copy-btn').addEventListener('click', () => {
        isCopyingItem = true;
        removeLocalStorage();
        $("#item-modal").modal("show");
        document.getElementById("item_name").value = item.name;
        document.getElementById("item_url").value = item.link;
        document.getElementById("item_image").value = item.image;
        document.getElementById("item_quantity").value = item.quantity;
        if (document.getElementById("item_min_quantity")) {
            document.getElementById("item_min_quantity").value = (item.min_quantity !== undefined && item.min_quantity !== null) ? item.min_quantity : 3;
        }
        if (typeof updateItemImagePreview === 'function') {
            updateItemImagePreview(item.image);
        }
        // Set LED positions for editing
        const parsedPos = parsePositionsArray(item.position);
        localStorage.setItem('led_positions', JSON.stringify(parsedPos));
        clickedCells = [...parsedPos];
        localStorage.setItem('edit_led_positions', JSON.stringify(parsedPos));
        localStorage.setItem('edit_image_path', JSON.stringify(item.image || ''));
        // Set item tags for editing
        if (item.tags) {
            const cleanedTags = item.tags.replace(/[\[\]'"`\\]/g, '');
            const itemTagsArray = cleanedTags.split(',');
            localStorage.setItem('item_tags', JSON.stringify(itemTagsArray))
            tags = itemTagsArray;
            loadTagsIntoTagify()
        }
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

                    $(cropImageModal).modal("show");
                })
                .catch(error => {
                    console.error('Error fetching image:', error);
                    alert('Unable to load image. Please try a different Image URL.');
                });
        } else {
            // Directly use the local image path
            imageElement.src = image;
            downloadButton.style.display = 'none'; // Hide the download button for local images
            $(cropImageModal).modal("show");
        }
    });




    col.querySelector('.edit-btn').addEventListener('click', () => {
        // Set flag for editing, remove local storage, and show the item modal
        isEditingItem = true;
        removeLocalStorage();
        $("#item-modal").modal("show");
        document.getElementById("item_name").value = item.name;
        document.getElementById("item_url").value = item.link;
        document.getElementById("item_image").value = item.image;
        document.getElementById("item_quantity").value = item.quantity;
        if (document.getElementById("item_min_quantity")) {
            document.getElementById("item_min_quantity").value = (item.min_quantity !== undefined && item.min_quantity !== null) ? item.min_quantity : 3;
        }
        if (typeof updateItemImagePreview === 'function') {
            updateItemImagePreview(item.image);
        }

        // Set LED positions for editing
        const parsedPos = parsePositionsArray(item.position);
        localStorage.setItem('led_positions', JSON.stringify(parsedPos));
        clickedCells = [...parsedPos];
        localStorage.setItem('edit_led_positions', JSON.stringify(parsedPos));
        localStorage.setItem('edit_image_path', JSON.stringify(item.image || ''));

        // Set item tags for editing
        if (item.tags) {
            const cleanedTags = item.tags.replace(/[\[\]'"`\\]/g, '');
            const itemTagsArray = cleanedTags.split(',');
            localStorage.setItem('item_tags', JSON.stringify(itemTagsArray))
            tags = itemTagsArray;
            loadTagsIntoTagify()
        }

        // Set editing item ID and IP
        editingItemId = item.id;
        editingItemIP = item.ip;
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
            <button type="button" class="btn btn-outline-primary btn-sm px-3" data-bs-toggle="modal" data-bs-target="#item-modal">
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
}
function findIndexByIP(ip) {
    if (!ip) return 0;
    const cleanIp = String(ip).trim().toLowerCase();
    const options = Array.from(selectEspDropdown.options);
    for (let i = 0; i < options.length; i++) {
        const optionIp = (options[i].dataset.espIp || '').trim().toLowerCase();
        const optionName = (options[i].dataset.espName || '').trim().toLowerCase();
        if (optionIp === cleanIp || optionName === cleanIp) {
            return i;
        }
    }
    return 0;
}



function initialiseTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

function resetModal() {
    document.getElementById("item_name").value = "";
    document.getElementById("item_url").value = "";
    document.getElementById("item_image").value = "";
    document.getElementById("item_quantity").value = "";
    if (document.getElementById("item_min_quantity")) {
        document.getElementById("item_min_quantity").value = "3";
    }
    document.getElementById("item_image_upload").value = "";
    if (typeof updateItemImagePreview === 'function') {
        updateItemImagePreview('');
    }
    document.getElementById("item_tags").value = "";
    document.getElementById("item-error-alert").classList.add("d-none");
    document.getElementById("item-error-list").innerHTML = "";
    removeLocalStorage();
    clearAll();
    const new_item_modal = document.querySelector('#item-modal');
    const modal = bootstrap.Modal.getInstance(new_item_modal);
    modal.hide();
    isEditingItem = false;
    isCopyingItem = false;

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

    // Clear and re-append in sorted order
    itemsContainer.innerHTML = '';
    sortedItems.forEach(item => {
        itemsContainer.appendChild(item);
    });

    updateSortUI();
}
const searchInput = document.getElementById("search");
const searchClearBtn = document.getElementById("search-clear-btn");

function filterItemsBySearch(text) {
    const itemsContainer = document.getElementById('items-container-grid');
    if (!itemsContainer) return;
    const searchText = (text || '').toLowerCase().trim();
    const items = Array.from(itemsContainer.children).filter(el => el.classList.contains('item-col') && !el.classList.contains('skeleton-col'));
    let visibleCount = 0;

    items.forEach((item) => {
        const itemName = (item.dataset["name"] || "").toLowerCase();
        const itemTags = (item.dataset["tags"] || "").toLowerCase();
        const itemEsp = (item.dataset["espName"] || "").toLowerCase();
        if (!searchText || itemName.indexOf(searchText) !== -1 || itemTags.indexOf(searchText) !== -1 || itemEsp.indexOf(searchText) !== -1) {
            item.style.display = "flex";
            visibleCount++;
        } else {
            item.style.display = "none";
        }
    });

    updateEmptyState(visibleCount, items.length);

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
let cropper = null;  // Store Cropper instance globally



async function uploadImage() {
    const fileInput = document.getElementById("item_image_upload");
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        console.log('no file uploaded');
        return null;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    try {
        const response = await fetch('/upload', { body: formData, method: 'POST' });
        if (!response.ok) {
            throw new Error(`Upload failed with status ${response.status}`);
        }
        const imageURL = await response.text();
        return new URL(imageURL, window.location.origin).href;
    } catch (error) {
        console.error('Error uploading file:', error);
        alert('Image upload failed. Only png, jpg, jpeg, gif and webp files are allowed.');
        return null;
    }
}



async function processCroppedImage(croppedImageFile, item) {
    const formData = new FormData();
    formData.append('file', croppedImageFile);

    try {
        const response = await fetch('/upload', { body: formData, method: 'POST' });
        if (!response.ok) {
            throw new Error(`Upload failed with status ${response.status}`);
        }
        const imageURL = await response.text();
        const fullImageUrl = new URL(imageURL, window.location.href).href;
        // Update the database with the new image URL
        document.getElementById("item_image").value = fullImageUrl;
        await handleImageChange(item, imageURL);
        // Update the item image in the UI with the new cropped image URL
        item.image = fullImageUrl;
        const col = document.getElementById('items-container-grid').querySelector(`div[data-id="${item.id}"]`);
        console.log(col);
        const updatedCol = createItem(item);
        document.getElementById('items-container-grid').replaceChild(updatedCol, col);
        lucide.createIcons();
        fetchDataAndLoadTags();


    } catch (error) {
        console.error('Error uploading cropped image:', error);
    }
}


// Function to initialize Cropper.js
function initializeCropper(imageElement) {
    if (cropper) {
        cropper.destroy(); // Destroy the existing Cropper instance if any
        cropper = null;
    }

    if (!imageElement || !imageElement.src || imageElement.src === window.location.href) {
        return;
    }

    const startCropper = () => {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        requestAnimationFrame(() => {
            cropper = new Cropper(imageElement, {
                aspectRatio: NaN,  // Free / unconstrained aspect ratio by default
                viewMode: 1,
                autoCropArea: 1,   // Encompass 100% of image initially so nothing is cut off
                responsive: true,
                movable: true,
                zoomable: true,
                rotatable: true,
                scalable: true,
            });
            updateCropPresetUI('free');
            if (window.lucide) {
                lucide.createIcons();
            }
        });
    };

    // Initialize Cropper only after the image has fully loaded
    if (imageElement.complete && imageElement.naturalWidth > 0) {
        startCropper();
    } else {
        imageElement.onload = () => {
            startCropper();
        };
    }
}

// Function to handle cropping and saving the image
function handleCropAndSave(item) {
    if (!cropper) return;

    // Preserve natural unconstrained aspect ratio without forcing 400x400 square distortion
    const croppedCanvas = cropper.getCroppedCanvas({
        maxWidth: 2048,
        maxHeight: 2048,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    });

    if (!croppedCanvas) {
        console.error('Cropped canvas could not be generated.');
        return;
    }

    croppedCanvas.toBlob(async (blob) => {
        if (!blob) {
            console.error('Failed to create Blob from cropped canvas.');
            return;
        }

        const croppedImageFile = new File([blob], 'cropped.jpg', { type: 'image/jpeg' });
        const formData = new FormData();
        formData.append('file', croppedImageFile);

        try {
            const response = await fetch('/upload', { body: formData, method: 'POST' });
            if (!response.ok) {
                throw new Error(`Upload failed with status ${response.status}`);
            }
            const imageURL = await response.text();
            const fullImageUrl = new URL(imageURL, window.location.origin).href;

            const itemModal = document.getElementById('item-modal');
            const isItemModalOpen = itemModal && itemModal.open;

            if (isItemModalOpen || !item || !item.id) {
                const itemImgInput = document.getElementById('item_image');
                if (itemImgInput) {
                    itemImgInput.value = imageURL;
                }
                updateItemImagePreview(imageURL);
                if (typeof markItemFormDirty === 'function') {
                    markItemFormDirty();
                } else if (typeof isItemFormDirty !== 'undefined') {
                    isItemFormDirty = true;
                }
            } else if (item && item.id) {
                await handleImageChange(item, imageURL);
                item.image = fullImageUrl;
                const col = document.getElementById('items-container-grid')?.querySelector(`div[data-id="${item.id}"]`);
                if (col && typeof createItem === 'function') {
                    const updatedCol = createItem(item);
                    document.getElementById('items-container-grid').replaceChild(updatedCol, col);
                    if (window.lucide) lucide.createIcons();
                }
            }
        } catch (error) {
            console.error('Error uploading cropped image:', error);
        } finally {
            const cropImageModal = document.getElementById('cropImageModal');
            if (cropImageModal) {
                resetModalAndCropper(cropImageModal);
            }
        }
    }, 'image/jpeg', 0.85);
}

// Function to handle crop and save button using dataset values
function onCropAndSave() {
    const cropImageModal = document.getElementById('cropImageModal');
    let item = null;
    if (cropImageModal && cropImageModal.dataset.item) {
        try {
            item = JSON.parse(cropImageModal.dataset.item);
        } catch (e) {
            item = null;
        }
    }
    handleCropAndSave(item);
}

// Function to handle image change in the database
function handleImageChange(item, url) {
    const itemId = item.id;
    console.log(url);

    const updatedItem = { image: url };

    return fetch(`/api/items/${itemId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Update-Image': 'true'
        },
        body: JSON.stringify(updatedItem),
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('Error updating image:', data.error);
            }
        })
        .catch(error => {
            console.error('Error updating image:', error);
        });
}

// Reset Cropper and close modal
function resetModalAndCropper(modalElement) {
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }

    // Clear the image source and pending load handler
    const imageElement = document.getElementById('imageToCrop');
    if (imageElement) {
        imageElement.onload = null;
        imageElement.src = '';
    }

    if (modalElement) {
        // Clear dataset attributes
        modalElement.dataset.itemName = '';
        modalElement.dataset.itemImage = '';
        delete modalElement.dataset.item;

        // Hide the modal if currently open
        if (typeof DialogManager !== 'undefined' && modalElement.open) {
            DialogManager.close(modalElement.id);
        } else if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            const modal = bootstrap.Modal.getInstance(modalElement);
            if (modal) {
                modal.hide();
            }
        }
    }
}

// Function to check if a string is a URL
function isValidUrl(str) {
    try {
        new URL(str);
        return true;
    } catch (e) {
        return false;
    }
}

// Function to check if a URL is external (http/https and not current origin)
function isExternalUrl(str) {
    if (!str || typeof str !== 'string') return false;
    try {
        const parsed = new URL(str, window.location.href);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin !== window.location.origin;
    } catch (e) {
        return false;
    }
}

// Initialize crop modal event listeners
function initCropModalEvents() {
    const cropModal = document.getElementById('cropImageModal');
    if (cropModal && !cropModal._cropModalEventsBound) {
        cropModal._cropModalEventsBound = true;
        cropModal.addEventListener('shown.bs.modal', function () {
            const imageElement = document.getElementById('imageToCrop');
            initializeCropper(imageElement);
        });
    }
}

// UI state helper for crop aspect ratio presets
function updateCropPresetUI(activePreset) {
    const btnFree = document.getElementById('crop-aspect-free');
    const btnSquare = document.getElementById('crop-aspect-square');
    const btnCard = document.getElementById('crop-aspect-card');
    const btnFull = document.getElementById('crop-full-btn');

    if (btnFree) btnFree.classList.toggle('active', activePreset === 'free');
    if (btnSquare) btnSquare.classList.toggle('active', activePreset === 'square');
    if (btnCard) btnCard.classList.toggle('active', activePreset === 'card');
    if (btnFull) {
        btnFull.classList.toggle('active', activePreset === 'full');
        const textSpan = btnFull.querySelector('span');
        if (textSpan) {
            textSpan.textContent = activePreset === 'full' ? 'Show Crop Box' : 'Full Image';
        }
    }
}

// Initialize rotation and crop control buttons for crop modal
function initCropControlsUI() {
    const rotateLeftBtn = document.getElementById('rotate-left-btn');
    const rotateRightBtn = document.getElementById('rotate-right-btn');
    const btnFree = document.getElementById('crop-aspect-free');
    const btnSquare = document.getElementById('crop-aspect-square');
    const btnCard = document.getElementById('crop-aspect-card');
    const btnFull = document.getElementById('crop-full-btn');
    const btnReset = document.getElementById('crop-reset-btn');

    if (rotateLeftBtn && !rotateLeftBtn._rotateBound) {
        rotateLeftBtn._rotateBound = true;
        rotateLeftBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (cropper) {
                cropper.rotate(-90);
            }
        });
    }
    if (rotateRightBtn && !rotateRightBtn._rotateBound) {
        rotateRightBtn._rotateBound = true;
        rotateRightBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (cropper) {
                cropper.rotate(90);
            }
        });
    }

    if (btnFree && !btnFree._aspectBound) {
        btnFree._aspectBound = true;
        btnFree.addEventListener('click', (e) => {
            e.preventDefault();
            if (cropper) {
                if (!cropper.cropped) cropper.crop();
                cropper.setAspectRatio(NaN);
                updateCropPresetUI('free');
            }
        });
    }

    if (btnSquare && !btnSquare._aspectBound) {
        btnSquare._aspectBound = true;
        btnSquare.addEventListener('click', (e) => {
            e.preventDefault();
            if (cropper) {
                if (!cropper.cropped) cropper.crop();
                cropper.setAspectRatio(1);
                updateCropPresetUI('square');
            }
        });
    }

    if (btnCard && !btnCard._aspectBound) {
        btnCard._aspectBound = true;
        btnCard.addEventListener('click', (e) => {
            e.preventDefault();
            if (cropper) {
                if (!cropper.cropped) cropper.crop();
                cropper.setAspectRatio(4 / 3);
                updateCropPresetUI('card');
            }
        });
    }

    if (btnFull && !btnFull._fullBound) {
        btnFull._fullBound = true;
        btnFull.addEventListener('click', (e) => {
            e.preventDefault();
            if (cropper) {
                if (cropper.cropped) {
                    cropper.clear();
                    updateCropPresetUI('full');
                } else {
                    cropper.crop();
                    cropper.setAspectRatio(NaN);
                    updateCropPresetUI('free');
                }
            }
        });
    }

    if (btnReset && !btnReset._resetBound) {
        btnReset._resetBound = true;
        btnReset.addEventListener('click', (e) => {
            e.preventDefault();
            if (cropper) {
                cropper.reset();
                cropper.setAspectRatio(NaN);
                updateCropPresetUI('free');
            }
        });
    }
}

// UI-09: Item Modal Segmented Image Input & Live Preview
function updateItemImagePreview(imageUrl) {
    const previewContainer = document.getElementById('item-img-preview-container');
    const previewTag = document.getElementById('item-img-preview-tag');
    const placeholder = document.getElementById('item-img-placeholder');
    const clearBtn = document.getElementById('btn-clear-item-image');
    const cropBtn = document.getElementById('btn-crop-item-image');

    if (!previewContainer || !previewTag || !placeholder) return;

    if (imageUrl && imageUrl.trim()) {
        const trimmed = imageUrl.trim();
        previewTag.onload = function() {
            previewTag.classList.remove('d-none');
            placeholder.classList.add('d-none');
            if (clearBtn) clearBtn.classList.remove('d-none');
            if (cropBtn) cropBtn.classList.remove('d-none');
        };
        previewTag.onerror = function() {
            previewTag.classList.add('d-none');
            placeholder.classList.remove('d-none');
            if (clearBtn) clearBtn.classList.remove('d-none');
            if (cropBtn) cropBtn.classList.add('d-none');
        };
        previewTag.src = trimmed;
    } else {
        previewTag.src = '';
        previewTag.classList.add('d-none');
        placeholder.classList.remove('d-none');
        if (clearBtn) clearBtn.classList.add('d-none');
        if (cropBtn) cropBtn.classList.add('d-none');
    }
}

function initItemImageUI() {
    const btnUrlMode = document.getElementById('btn-img-mode-url');
    const btnUploadMode = document.getElementById('btn-img-mode-upload');
    const urlGroup = document.getElementById('item-image-url-group');
    const uploadGroup = document.getElementById('item-image-upload-group');
    const urlInput = document.getElementById('item_image');
    const fileInput = document.getElementById('item_image_upload');
    const clearBtn = document.getElementById('btn-clear-item-image');
    const cropBtn = document.getElementById('btn-crop-item-image');

    if (btnUrlMode && btnUploadMode) {
        btnUrlMode.addEventListener('click', () => {
            btnUrlMode.classList.remove('btn-outline-secondary');
            btnUrlMode.classList.add('btn-primary');
            btnUploadMode.classList.remove('btn-primary');
            btnUploadMode.classList.add('btn-outline-secondary');

            if (urlGroup) urlGroup.classList.remove('d-none');
            if (uploadGroup) uploadGroup.classList.add('d-none');
        });

        btnUploadMode.addEventListener('click', () => {
            btnUploadMode.classList.remove('btn-outline-secondary');
            btnUploadMode.classList.add('btn-primary');
            btnUrlMode.classList.remove('btn-primary');
            btnUrlMode.classList.add('btn-outline-secondary');

            if (uploadGroup) uploadGroup.classList.remove('d-none');
            if (urlGroup) urlGroup.classList.add('d-none');
        });
    }

    if (urlInput) {
        urlInput.addEventListener('input', () => {
            updateItemImagePreview(urlInput.value);
        });
        urlInput.addEventListener('change', () => {
            updateItemImagePreview(urlInput.value);
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    updateItemImagePreview(e.target.result);
                };
                reader.readAsDataURL(fileInput.files[0]);
            }
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (urlInput) urlInput.value = '';
            if (fileInput) fileInput.value = '';
            updateItemImagePreview('');
        });
    }

    if (cropBtn) {
        cropBtn.addEventListener('click', () => {
            const previewTag = document.getElementById('item-img-preview-tag');
            const imageElement = document.getElementById('imageToCrop');
            const downloadButton = document.getElementById('download-image-btn');
            if (!previewTag || !previewTag.src || previewTag.classList.contains('d-none')) return;

            const cropImageModal = document.getElementById('cropImageModal');
            if (cropImageModal) {
                delete cropImageModal.dataset.item;
            }

            if (downloadButton) downloadButton.style.display = 'none';

            const rawSrc = previewTag.src;
            if (isExternalUrl(rawSrc)) {
                fetchWithTimeout(`/proxy-image?url=${encodeURIComponent(rawSrc)}`)
                    .then(response => {
                        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                        return response.blob();
                    })
                    .then(blob => {
                        imageElement.src = URL.createObjectURL(blob);
                        if (typeof DialogManager !== 'undefined') {
                            DialogManager.open('cropImageModal');
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching image for crop:', error);
                        imageElement.src = rawSrc;
                        if (typeof DialogManager !== 'undefined') {
                            DialogManager.open('cropImageModal');
                        }
                    });
            } else {
                imageElement.src = rawSrc;
                if (typeof DialogManager !== 'undefined') {
                    DialogManager.open('cropImageModal');
                }
            }
        });
    }
}

function initAllImageHandlers() {
    initCropModalEvents();
    initCropControlsUI();
    initItemImageUI();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllImageHandlers);
} else {
    initAllImageHandlers();
}
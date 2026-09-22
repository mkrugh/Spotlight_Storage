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
    }

    // Initialize Cropper only after the image has fully loaded
    if (imageElement.complete) {
        requestAnimationFrame(() => {
            cropper = new Cropper(imageElement, {
                aspectRatio: 1,  // 1:1 aspect ratio
                viewMode: 1,
                movable: true,
                zoomable: true,
                rotatable: true,
                scalable: true,
            });
        });
    }
}

// Function to handle cropping and saving the image
function handleCropAndSave(item) {
    if (!cropper) return;

    const croppedCanvas = cropper.getCroppedCanvas({
        width: 300,
        height: 300,
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

        const originalFileName = item.image.split('/').pop();
        let fileExtension = originalFileName.split('.').pop();
        const baseFileName = item.name.trim();
        // Check if the file extension is valid
        const validExtensions = ['png', 'jpeg', 'jpg','webp'];
        if (!validExtensions.includes(fileExtension)) {
            // If the extension is not valid, default to 'jpg'
            fileExtension = 'webp';
        }

        const croppedFileName = `${baseFileName}_cropped.${fileExtension}`;
        const croppedImageFile = new File([blob], croppedFileName, { type: blob.type });

        await processCroppedImage(croppedImageFile, item);
    });
}

// Function to handle crop and save button using dataset values
function onCropAndSave() {
    const cropImageModal = document.getElementById('cropImageModal');

    // Retrieve item details from modal dataset
    const item = JSON.parse(cropImageModal.dataset.item);

    console.log("saving image", item)
    handleCropAndSave(item);
    resetModalAndCropper(cropImageModal);
}

// Function to handle image change in the database
function handleImageChange(item, url) {
    const itemId = item.id;
    console.log(url);

    const updatedItem = { image: url };

    fetch(`/api/items/${itemId}`, {
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

    // Clear the image source
    document.getElementById('imageToCrop').src = '';

    // Clear dataset attributes
    modalElement.dataset.itemName = '';
    modalElement.dataset.itemImage = '';

    // Hide the modal
    if (typeof DialogManager !== 'undefined') {
        DialogManager.close(modalElement.id);
    } else {
        const modal = typeof bootstrap !== 'undefined' && bootstrap.Modal ? bootstrap.Modal.getInstance(modalElement) : null;
        if (modal) {
            modal.hide();
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

// Event listener to initialize cropper when the modal is fully shown
$('#cropImageModal').on('shown.bs.modal', function () {
    const imageElement = document.getElementById('imageToCrop');

    // Use requestAnimationFrame to ensure all rendering is complete
    requestAnimationFrame(() => {
        initializeCropper(imageElement);
    });
});

// UI-09: Item Modal Segmented Image Input & Live Preview
function updateItemImagePreview(imageUrl) {
    const previewContainer = document.getElementById('item-img-preview-container');
    const previewTag = document.getElementById('item-img-preview-tag');
    const placeholder = document.getElementById('item-img-placeholder');
    const clearBtn = document.getElementById('btn-clear-item-image');

    if (!previewContainer || !previewTag || !placeholder) return;

    if (imageUrl && imageUrl.trim()) {
        const trimmed = imageUrl.trim();
        previewTag.onload = function() {
            previewTag.classList.remove('d-none');
            placeholder.classList.add('d-none');
            if (clearBtn) clearBtn.classList.remove('d-none');
        };
        previewTag.onerror = function() {
            previewTag.classList.add('d-none');
            placeholder.classList.remove('d-none');
            if (clearBtn) clearBtn.classList.remove('d-none');
        };
        previewTag.src = trimmed;
    } else {
        previewTag.src = '';
        previewTag.classList.add('d-none');
        placeholder.classList.remove('d-none');
        if (clearBtn) clearBtn.classList.add('d-none');
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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initItemImageUI);
} else {
    initItemImageUI();
}
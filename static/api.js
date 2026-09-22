/**
 * Centralized API fetch wrapper for Spotlight Storage.
 * Validates response.ok before parsing JSON and provides structured error handling.
 */
async function apiFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            let errorMsg = `Request failed (${response.status})`;
            try {
                const errData = await response.json();
                if (errData && errData.error) {
                    errorMsg = errData.error;
                }
            } catch (_) {
                // Non-JSON error body fallback
            }
            if (typeof showToast === 'function') {
                showToast(errorMsg, 'danger');
            }
            const err = new Error(errorMsg);
            err.status = response.status;
            throw err;
        }
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return await response.json();
        }
        return await response.text();
    } catch (err) {
        if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
            if (typeof showToast === 'function') {
                showToast('Network error — check your connection', 'danger');
            }
        }
        throw err;
    }
}

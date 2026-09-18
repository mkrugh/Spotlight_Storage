/**
 * DialogManager - Centralized Controller for Native <dialog> Migration
 * 
 * Replaces Bootstrap Modals with native HTML5 <dialog> elements while providing:
 * 1. Legacy browser polyfills (Safari < 15.4 / iOS 12-14)
 * 2. Focus trapping and autofocus management (A11y)
 * 3. Body scroll locking (UX)
 * 4. Outside-click backdrop dismissal
 * 5. Backward compatibility with Bootstrap 'shown.bs.modal' and 'hidden.bs.modal' events.
 */

const DialogManager = (function() {
    let openDialogsCount = 0;
    
    // Check for native support
    const supportsNativeDialog = typeof HTMLDialogElement === 'function' && typeof document.createElement('dialog').showModal === 'function';

    const triggerEvent = (element, eventName) => {
        const event = new Event(eventName, { bubbles: true });
        element.dispatchEvent(event);
    };

    const handleBackdropClick = (event, dialogEl) => {
        if (!supportsNativeDialog && dialogEl.classList.contains('legacy-dialog-polyfill')) {
            return;
        }
        
        // With dialog covering the full screen (like Bootstrap .modal),
        // clicking outside .modal-dialog hits the <dialog> element directly.
        if (event.target === dialogEl) {
            closeDialog(dialogEl.id);
        }
    };

    const handleEscKey = (event, dialogEl) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeDialog(dialogEl.id);
        }
    };

    const openDialog = (id) => {
        const dialogEl = document.getElementById(id);
        if (!dialogEl) return;

        if (document.activeElement && !dialogEl.dataset.triggerElement) {
            dialogEl._triggerElement = document.activeElement;
        }

        if (supportsNativeDialog) {
            if (!dialogEl.open) {
                dialogEl.showModal();
            }
        } else {
            if (!dialogEl.classList.contains('legacy-dialog-polyfill')) {
                dialogEl.classList.add('legacy-dialog-polyfill');
                dialogEl.setAttribute('open', '');
                
                let backdrop = document.getElementById(`backdrop-${id}`);
                if (!backdrop) {
                    backdrop = document.createElement('div');
                    backdrop.id = `backdrop-${id}`;
                    backdrop.className = 'legacy-dialog-backdrop';
                    backdrop.addEventListener('click', () => closeDialog(id));
                    document.body.appendChild(backdrop);
                }
            }
        }

        openDialogsCount++;
        document.body.classList.add('dialog-open');

        if (!dialogEl._dialogManagerInitialized) {
            dialogEl.addEventListener('click', (e) => handleBackdropClick(e, dialogEl));
            dialogEl.addEventListener('keydown', (e) => handleEscKey(e, dialogEl));
            
            const dismissBtns = dialogEl.querySelectorAll('[data-dialog-dismiss], [data-bs-dismiss="modal"]');
            dismissBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    closeDialog(id);
                });
            });
            dialogEl._dialogManagerInitialized = true;
        }

        setTimeout(() => {
            const autofocusEl = dialogEl.querySelector('[autofocus]');
            if (autofocusEl) {
                autofocusEl.focus();
            } else {
                const firstInput = dialogEl.querySelector('input:not([type="hidden"]), select, textarea, button:not([data-dialog-dismiss])');
                if (firstInput) firstInput.focus();
            }
            triggerEvent(dialogEl, 'shown.bs.modal');
        }, 10);
    };

    const closeDialog = (id) => {
        const dialogEl = document.getElementById(id);
        if (!dialogEl) return;

        if (supportsNativeDialog) {
            if (dialogEl.open) {
                dialogEl.close();
            }
        } else {
            dialogEl.classList.remove('legacy-dialog-polyfill');
            dialogEl.removeAttribute('open');
            const backdrop = document.getElementById(`backdrop-${id}`);
            if (backdrop) backdrop.remove();
        }

        openDialogsCount = Math.max(0, openDialogsCount - 1);
        if (openDialogsCount === 0) {
            document.body.classList.remove('dialog-open');
        }

        if (dialogEl._triggerElement) {
            dialogEl._triggerElement.focus();
            dialogEl._triggerElement = null;
        }

        triggerEvent(dialogEl, 'hidden.bs.modal');
    };

    return { open: openDialog, close: closeDialog };
})();

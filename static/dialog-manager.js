/**
 * DialogManager - Centralized Controller for Native <dialog> Migration
 * 
 * Replaces Bootstrap Modals with native HTML5 <dialog> elements while providing:
 * 1. Legacy browser polyfills (Safari < 15.4 / iOS 12-14)
 * 2. Focus trapping and autofocus management (A11y)
 * 3. Body scroll locking (UX) with leak-proof Set tracking
 * 4. Outside-click backdrop dismissal and dismiss button delegation
 * 5. Full event lifecycle compatibility: 'show.bs.modal', 'shown.bs.modal', 'hide.bs.modal', 'hidden.bs.modal'
 * 6. Global event interception to prevent Bootstrap from injecting orphaned .modal-backdrop overlays
 */

window.DialogManager = (function() {
    const openDialogIds = new Set();
    
    // Check for native support
    const supportsNativeDialog = typeof HTMLDialogElement === 'function' && typeof document.createElement('dialog').showModal === 'function';

    const triggerEvent = (element, eventName, relatedTarget = null) => {
        const event = new Event(eventName, { bubbles: true, cancelable: true });
        event.relatedTarget = relatedTarget;
        return element.dispatchEvent(event);
    };

    const handleBackdropClick = (event, dialogEl) => {
        if (!supportsNativeDialog && dialogEl.classList.contains('legacy-dialog-polyfill')) {
            return;
        }
        
        // Only close if BOTH mousedown and click originated directly on dialogEl (the backdrop).
        // This prevents accidental dismissals when dragging (e.g. crop handles, sliders, selection)
        // starts inside the modal content but the mouse is released outside.
        const startedOnBackdrop = dialogEl._mouseDownTarget === dialogEl;
        dialogEl._mouseDownTarget = null;

        if (event.target === dialogEl && startedOnBackdrop) {
            closeDialog(dialogEl.id);
        }
    };

    const handleEscKey = (event, dialogEl) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeDialog(dialogEl.id);
        }
    };

    const openDialog = (id, triggerElement = null) => {
        const dialogEl = document.getElementById(id);
        if (!dialogEl) return;

        // Remember which element opened the dialog for A11y focus restoration & event relatedTarget
        dialogEl._triggerElement = triggerElement || document.activeElement;

        // Dispatch show.bs.modal BEFORE showing, passing the trigger element as relatedTarget
        triggerEvent(dialogEl, 'show.bs.modal', dialogEl._triggerElement);

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
                    let polyfillMouseDown = null;
                    backdrop.addEventListener('mousedown', (e) => { polyfillMouseDown = e.target; });
                    backdrop.addEventListener('click', (e) => {
                        if (e.target === backdrop && polyfillMouseDown === backdrop) {
                            closeDialog(id);
                        }
                        polyfillMouseDown = null;
                    });
                    document.body.appendChild(backdrop);
                }
            }
        }

        openDialogIds.add(id);
        document.body.classList.add('dialog-open');

        if (!dialogEl._dialogManagerInitialized) {
            dialogEl._mouseDownTarget = null;
            dialogEl.addEventListener('cancel', (e) => {
                e.preventDefault();
                closeDialog(id);
            });
            dialogEl.addEventListener('mousedown', (e) => {
                dialogEl._mouseDownTarget = e.target;
            });
            dialogEl.addEventListener('click', (e) => {
                const dismissBtn = e.target.closest('[data-dialog-dismiss], [data-bs-dismiss="modal"]');
                if (dismissBtn) {
                    e.preventDefault();
                    closeDialog(id);
                    return;
                }
                handleBackdropClick(e, dialogEl);
            });
            dialogEl.addEventListener('keydown', (e) => handleEscKey(e, dialogEl));
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
            triggerEvent(dialogEl, 'shown.bs.modal', dialogEl._triggerElement);
        }, 10);
    };

    const closeDialog = (id) => {
        const dialogEl = document.getElementById(id);
        if (!dialogEl) return;

        const allowed = triggerEvent(dialogEl, 'hide.bs.modal');
        if (allowed === false) {
            return;
        }

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

        openDialogIds.delete(id);
        if (openDialogIds.size === 0) {
            document.body.classList.remove('dialog-open');
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('overflow');
            document.body.style.removeProperty('padding-right');
        }

        // Clean up or migrate any dialog-injected toasts
        const dialogToasts = dialogEl.querySelector('.dialog-toast-container');
        if (dialogToasts) {
            const mainContainer = document.getElementById('app-toast-container');
            if (mainContainer) {
                while (dialogToasts.firstChild) {
                    mainContainer.appendChild(dialogToasts.firstChild);
                }
            }
            dialogToasts.remove();
        }

        // Clean up any rogue Bootstrap backdrops that may have been injected
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());

        if (dialogEl._triggerElement && typeof dialogEl._triggerElement.focus === 'function') {
            dialogEl._triggerElement.focus();
            dialogEl._triggerElement = null;
        }

        triggerEvent(dialogEl, 'hidden.bs.modal');
    };

    // Global capturing listener: Prevents Bootstrap from intercepting clicks on modal triggers
    // and injecting orphaned backdrops into the DOM.
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-bs-toggle="modal"], [data-dialog-target]');
        if (!trigger) return;

        const targetSelector = trigger.getAttribute('data-bs-target') || trigger.getAttribute('data-dialog-target') || trigger.dataset.bsTarget;
        if (!targetSelector) return;

        const modalId = targetSelector.replace('#', '');
        const targetEl = document.getElementById(modalId);
        if (targetEl && targetEl.tagName && targetEl.tagName.toLowerCase() === 'dialog') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            openDialog(modalId, trigger);
        }
    }, true);

    const getActiveDialog = () => {
        if (openDialogIds.size === 0) return null;
        const lastId = Array.from(openDialogIds).pop();
        return document.getElementById(lastId);
    };

    return { open: openDialog, close: closeDialog, getActiveDialog };
})();


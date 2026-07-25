/**
 * @fileoverview Global UI State Store
 * Manages application-level interface states such as toast notifications,
 * loading overlays, and generic user feedback using Svelte 5 reactive runes.
 */

/**
 * Factory function to create the UI store singleton.
 * Encapsulates reactive Svelte 5 `$state` runes to safely manage global interface properties.
 * 
 * @returns {Object} The reactive UI store public interface.
 */
function createUIStore() {
    /** @type {Array<{id: string, message: string, type: string}>} Array of active toast notifications. */
    let toasts = $state([]);
    
    /** @type {boolean} Global loading overlay toggle. */
    let isLoading = $state(false);
    
    /** @type {string} Text displayed on the global loading overlay. */
    let loadingMessage = $state("");

    return {
        /** @returns {Array<Object>} The current list of active toasts. */
        get toasts() { return toasts; },
        
        /** @returns {boolean} True if the global loading overlay is active. */
        get isLoading() { return isLoading; },
        
        /** @returns {string} The current loading message. */
        get loadingMessage() { return loadingMessage; },

        /**
         * Pushes a new toast notification to the screen and automatically queues its dismissal.
         * 
         * @param {string} message - The text to display in the toast.
         * @param {string} [type='info'] - The semantic style variant (e.g., 'info', 'success', 'error', 'warning').
         * @param {number} [duration=4000] - Time in milliseconds before the toast auto-dismisses.
         */
        addToast(message, type = 'info', duration = 4000) {
            const id = crypto.randomUUID();
            toasts = [...toasts, { id, message, type }];
            
            // Auto-dismiss the toast after the specified duration expires
            setTimeout(() => {
                this.removeToast(id);
            }, duration);
        },

        /**
         * Manually removes a specific toast from the screen by its UUID.
         * 
         * @param {string} id - The cryptographic UUID of the toast to remove.
         */
        removeToast(id) {
            toasts = toasts.filter(t => t.id !== id);
        },

        /**
         * Toggles the global full-screen blocking loading overlay.
         * Useful during heavy I/O operations like secure exports or map parsing.
         * 
         * @param {boolean} loading - True to mount the overlay, false to destroy it.
         * @param {string} [message="Processing..."] - The context text to display while loading.
         */
        setLoading(loading, message = "Processing...") {
            isLoading = loading;
            loadingMessage = message;
        }
    };
}

/** 
 * @constant {Object} uiStore
 * The singleton instance of the UI store exported for application-wide use.
 */
export const uiStore = createUIStore();
/**
 * @fileoverview Local Persistence Engine (IndexedDB Wrapper)
 * Provides an asynchronous, non-blocking interface to the browser's IndexedDB.
 * This is primarily used to silently auto-save the active VTT state in the 
 * background so Game Masters don't lose their work if the browser crashes or refreshes.
 */

/** @constant {string} The internal name of the IndexedDB database. */
const DB_NAME = 'uvtt_db';

/** @constant {string} The specific object store used to hold project data. */
const STORE_NAME = 'project_store';

/**
 * Initializes and opens the IndexedDB connection.
 * Automatically creates the required object store if it doesn't exist (version 1).
 * 
 * @returns {Promise<IDBDatabase>} A promise that resolves with the active database instance.
 */
function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE_NAME);
        };
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Silently writes a data payload to the local database.
 * Designed as a "fire-and-forget" operation for the auto-save loop; 
 * it swallows errors to prevent crashing the main render thread.
 * 
 * @param {string} key - The lookup key (e.g., 'autosave').
 * @param {Object} data - The JSON-serializable state object to persist.
 */
export async function saveToDB(key, data) {
    try {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(data, key);
    } catch (e) {
        console.error("Auto-save failed:", e);
    }
}

/**
 * Retrieves a stored data payload from the local database.
 * Fails gracefully by returning null if the database is locked or empty.
 * 
 * @param {string} key - The lookup key to retrieve.
 * @returns {Promise<Object|null>} The parsed data object, or null if not found/error.
 */
export async function loadFromDB(key) {
    try {
        const db = await getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}
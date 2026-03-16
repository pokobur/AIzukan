// storage.js - Application Database using IndexedDB

const DB_NAME = 'ai_zukan_db';
const DB_VERSION = 1;
const STORE_NAME = 'items';

let db;

/**
 * Initialize IndexedDB
 */
export function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('date', 'date', { unique: false });
                store.createIndex('rarity', 'rarity', { unique: false });
            }
        };
    });
}

/**
 * Save an item to the database
 * @param {Object} item { id, name, rarity, description, imageBase64, date }
 */
export function saveItem(item) {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error("DB not initialized"));
        
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // Ensure ID and Date exist
        if (!item.id) item.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        if (!item.date) item.date = Date.now();
        
        const request = store.put(item);
        
        request.onsuccess = () => resolve(item);
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Get all items from the database
 * @returns {Promise<Array>} List of items
 */
export function getAllItems() {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error("DB not initialized"));
        
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => {
            // Sort by date descending (newest first)
            const items = request.result || [];
            items.sort((a, b) => b.date - a.date);
            resolve(items);
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Get a specific item by ID
 */
export function getItem(id) {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error("DB not initialized"));
        
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Delete an item from the database
 */
export function deleteItem(id) {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error("DB not initialized"));
        
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        
        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Clear the entire database
 */
export function clearDB() {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error("DB not initialized"));
        
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        
        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Export DB to JSON string
 */
export async function exportDB() {
    const items = await getAllItems();
    return JSON.stringify(items);
}

/**
 * Import JSON string to DB
 */
export async function importDB(jsonString) {
    try {
        const items = JSON.parse(jsonString);
        if (!Array.isArray(items)) throw new Error("Invalid format");
        
        let count = 0;
        for (const item of items) {
            if (item.id && item.name && item.imageBase64) {
                await saveItem(item);
                count++;
            }
        }
        return count;
    } catch (e) {
        throw new Error("Failed to import data: " + e.message);
    }
}

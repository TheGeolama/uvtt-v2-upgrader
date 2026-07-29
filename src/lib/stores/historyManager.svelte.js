export class HistoryManager {
    constructor(store) {
        this.store = store;
    }

    initHistory() {
        const activeMap = this.store.activeMap;
        if (!activeMap) return;
        if (!activeMap.history) {
            activeMap.history = [{
                actionName: "Initial Load",
                timestamp: Date.now(),
                snapshot: JSON.parse(JSON.stringify(activeMap.manifest))
            }];
            activeMap.historyIndex = 0;
        }
    }

    /**
     * Saves a full deep clone of the current manifest to the history stack.
     * Prevents deep-clone thrashing via a 1000ms debounce on "Rapid Updates".
     */
    pushHistory(actionName) {
        const activeMap = this.store.activeMap;
        if (!activeMap) return;
        this.initHistory();

        const now = Date.now();
        const lastAction = activeMap.history[activeMap.historyIndex];

        const isRapidUpdate = lastAction && lastAction.actionName === actionName && (now - lastAction.timestamp < 1000);

        // Truncate future history if branching from an undo
        if (!isRapidUpdate) {
            activeMap.history = activeMap.history.slice(0, activeMap.historyIndex + 1);
        }

        const snapshot = JSON.parse(JSON.stringify(activeMap.manifest));

        if (isRapidUpdate) {
            activeMap.history[activeMap.historyIndex].snapshot = snapshot;
            activeMap.history[activeMap.historyIndex].timestamp = now;
        } else {
            activeMap.history.push({ actionName, timestamp: now, snapshot });
            activeMap.historyIndex++;
            if (activeMap.history.length > 50) {  // Maximum 50 undo states per level
                activeMap.history.shift();
                activeMap.historyIndex--;
            }
        }
        this.store.updateSpatialIndex();
        this.store.updateTrigger++;
        this.store.triggerAutoSave();
    }

    undo() {
        const activeMap = this.store.activeMap;
        if (!activeMap || !activeMap.history || activeMap.historyIndex <= 0) return;
        activeMap.historyIndex--;
        const state = activeMap.history[activeMap.historyIndex];
        activeMap.manifest = JSON.parse(JSON.stringify(state.snapshot));
        this.store.selectedItemIds = [];
        this.store.updateSpatialIndex();
        this.store.updateTrigger++;
        this.store.triggerAutoSave();
    }

    redo() {
        const activeMap = this.store.activeMap;
        if (!activeMap || !activeMap.history || activeMap.historyIndex >= activeMap.history.length - 1) return;
        activeMap.historyIndex++;
        const state = activeMap.history[activeMap.historyIndex];
        activeMap.manifest = JSON.parse(JSON.stringify(state.snapshot));
        this.store.selectedItemIds = [];
        this.store.updateSpatialIndex();
        this.store.updateTrigger++;
        this.store.triggerAutoSave();
    }

    jumpToHistory(index) {
        const activeMap = this.store.activeMap;
        if (!activeMap || !activeMap.history || index < 0 || index >= activeMap.history.length) return;
        activeMap.historyIndex = index;
        const state = activeMap.history[index];
        activeMap.manifest = JSON.parse(JSON.stringify(state.snapshot));
        this.store.selectedItemIds = [];
        this.store.updateSpatialIndex();
        this.store.updateTrigger++;
        this.store.triggerAutoSave();
    }

    clearHistory() {
        const activeMap = this.store.activeMap;
        if (!activeMap) return;

        const currentState = JSON.parse(JSON.stringify(activeMap.manifest));
        
        activeMap.history = [{
            actionName: "History Cleared",
            timestamp: Date.now(),
            snapshot: currentState
        }];
        activeMap.historyIndex = 0;

        this.store.updateTrigger++;
        this.store.triggerAutoSave();
    }
}
export class GlobalAssetStore {
    // Svelte 5 Native State works cleanly inside class declarations
    mountedAssetDirectory = $state("");
    globalAssets = $state({ images: [], audio: [] });
    _wailsRetryCount = 0;

    constructor(store) {
        this.store = store;
    }

    async initGlobalAssets() {
        if (typeof window !== 'undefined' && window.go?.main?.App?.LoadSavedAssetDirectory) {
            try {
                const payload = await window.go.main.App.LoadSavedAssetDirectory();
                this.processAssetPayload(payload);
            } catch (err) {
                console.error("Auto-mount failed:", err);
            }
        } else if (this._wailsRetryCount < 10) {
            this._wailsRetryCount++;
            setTimeout(() => this.initGlobalAssets(), 200);
        }
    }

    async mountAssetLibrary() {
        if (typeof window !== 'undefined' && window.go?.main?.App?.SelectAssetDirectory) {
            try {
                const payload = await window.go.main.App.SelectAssetDirectory();
                this.processAssetPayload(payload);
            } catch (err) {
                console.error("Failed to load asset directory:", err);
            }
        } else {
            alert("Asset Library requires the native Wails Desktop build running.");
        }
    }

    async refreshAssetLibrary() {
        if (typeof window !== 'undefined' && window.go?.main?.App?.LoadSavedAssetDirectory) {
            try {
                const payload = await window.go.main.App.LoadSavedAssetDirectory();
                this.processAssetPayload(payload);
            } catch (err) {
                console.error("Failed to refresh asset directory:", err);
            }
        }
    }

    processAssetPayload(payload) {
        if (!payload || !payload.assets || payload.assets.length === 0) return;
        
        const images = payload.assets.filter(a => a.type === 'image');
        const audio = payload.assets.filter(a => a.type === 'audio');
        
        this.globalAssets = { images, audio };
        this.mountedAssetDirectory = payload.directory;

        const audioPromises = audio.map(async (a) => {
            try {
                const res = await fetch(a.data);
                const blob = await res.blob();
                this.store.audioBlobs[a.name] = blob;
            } catch (e) {
                console.error(`Failed to fetch local audio: ${a.name}`);
            }
        });
        
        Promise.all(audioPromises).then(() => {
            this.store.updateTrigger++;
        });
    }

    addProp(x, y, imageURL, name) {
        const activeMap = this.store.activeMap;
        if (!activeMap) return;
        const ds = this.store.defaultSettings.prop;
        const prop = {
            id: crypto.randomUUID(),
            name: name,
            image: imageURL,
            position: { x, y, z: ds.position.z },
            rotation: ds.rotation,
            scale: ds.scale,
            properties: JSON.parse(JSON.stringify(ds.properties))
        };
        if (!activeMap.manifest.entities.props) activeMap.manifest.entities.props = [];
        activeMap.manifest.entities.props.push(prop);
        
        this.store.activeMap.manifest = { ...activeMap.manifest };
        this.store.pushHistory("Added Prop Asset");
        this.store.updateSpatialIndex();
        this.store.updateTrigger++;
    }
}
import { exportAssetPackage, importAssetPackage } from '$lib/utils/projectIO.js';

export class AssetPackager {
    constructor(store) {
        this.store = store;
    }

    packCompoundAsset() {
        if (!this.store.activeMap || this.store.selectedItemIds.length !== 1) {
            alert("Please select exactly one Prop base to package as a Compound Asset.");
            return;
        }
        const propId = this.store.selectedItemIds[0];
        const prop = this.store.activeMap.manifest.entities.props?.find(p => p.id === propId);
        if (!prop) {
            alert("The selected base item must be a Prop graphic.");
            return;
        }

        const payload = {
            type: "asset_prop",
            name: prop.name || "Compound_Asset",
            image: prop.image,
            scale: prop.scale || 100,
            auto_emits: { lights: [], audio: [], emitters: [] }
        };

        const px = prop.position.x;
        const py = prop.position.y;
        // Scoop up any elements sitting within a 1.5-grid-unit radius of the prop
        const thresholdSq = 1.5 * 1.5; 
        const getDistSq = (x1, y1, x2, y2) => (x2 - x1)**2 + (y2 - y1)**2;

        (this.store.activeMap.manifest.entities.lights || []).forEach(l => {
            if (getDistSq(px, py, l.position.x, l.position.y) <= thresholdSq) {
                const cloned = JSON.parse(JSON.stringify(l));
                cloned.offset_x = cloned.position.x - px; 
                cloned.offset_y = cloned.position.y - py;
                delete cloned.id; delete cloned.position;
                payload.auto_emits.lights.push(cloned);
            }
        });

        (this.store.activeMap.manifest.entities.emitters || []).forEach(e => {
            if (getDistSq(px, py, e.position.x, e.position.y) <= thresholdSq) {
                const cloned = JSON.parse(JSON.stringify(e));
                cloned.offset_x = cloned.position.x - px;
                cloned.offset_y = cloned.position.y - py;
                delete cloned.id; delete cloned.position;
                payload.auto_emits.emitters.push(cloned);
            }
        });

        (this.store.activeMap.manifest.entities.audio?.zones || []).forEach(a => {
            if (getDistSq(px, py, a.center.x, a.center.y) <= thresholdSq) {
                const cloned = JSON.parse(JSON.stringify(a));
                cloned.offset_x = cloned.center.x - px;
                cloned.offset_y = cloned.center.y - py;
                delete cloned.id; delete cloned.center;
                payload.auto_emits.audio.push(cloned);
            }
        });

        exportAssetPackage(payload.name, payload, this.store.audioBlobs);
        this.store.closeContextMenu();
    }

    async loadCompoundAssetFromFile(file, x, y) {
        const data = await importAssetPackage(file);
        if (!data) return;
        this.spawnCompoundAsset(x, y, data.payload, data.extractedAudio);
    }

    spawnCompoundAsset(x, y, payload, extractedAudio = {}) {
        const activeMap = this.store.activeMap;
        if (!activeMap) return;

        for (const [track, blob] of Object.entries(extractedAudio)) {
            this.store.audioBlobs[track] = blob;
        }

        const propId = crypto.randomUUID();
        const prop = {
            id: propId,
            name: payload.name,
            image: payload.image,
            position: { x, y, z: 0 },
            rotation: 0,
            scale: payload.scale || 100,
            properties: { visibility: 'visible', z_index: 0, locked: false }
        };
        if (!activeMap.manifest.entities.props) activeMap.manifest.entities.props = [];
        activeMap.manifest.entities.props.push(prop);

        if (payload.auto_emits) {
            if (payload.auto_emits.lights) {
                if (!activeMap.manifest.entities.lights) activeMap.manifest.entities.lights = [];
                payload.auto_emits.lights.forEach(l => {
                    const newLight = { ...l, id: crypto.randomUUID(), position: { x: x + (l.offset_x || 0), y: y + (l.offset_y || 0), z: l.z || 0 } };
                    delete newLight.offset_x; delete newLight.offset_y; delete newLight.z;
                    activeMap.manifest.entities.lights.push(newLight);
                });
            }
            if (payload.auto_emits.emitters) {
                if (!activeMap.manifest.entities.emitters) activeMap.manifest.entities.emitters = [];
                payload.auto_emits.emitters.forEach(e => {
                    const newEmitter = { ...e, id: crypto.randomUUID(), position: { x: x + (e.offset_x || 0), y: y + (e.offset_y || 0), z: e.z || 0 } };
                    delete newEmitter.offset_x; delete newEmitter.offset_y; delete newEmitter.z;
                    activeMap.manifest.entities.emitters.push(newEmitter);
                });
            }
            if (payload.auto_emits.audio) {
                if (!activeMap.manifest.entities.audio) activeMap.manifest.entities.audio = { zones: [] };
                if (!activeMap.manifest.entities.audio.zones) activeMap.manifest.entities.audio.zones = [];
                payload.auto_emits.audio.forEach(a => {
                    const newAudio = { ...a, id: crypto.randomUUID(), center: { x: x + (a.offset_x || 0), y: y + (a.offset_y || 0) } };
                    delete newAudio.offset_x; delete newAudio.offset_y;
                    activeMap.manifest.entities.audio.zones.push(newAudio);
                });
            }
        }

        this.store.activeMap.manifest = { ...activeMap.manifest };
        this.store.selectedItemIds = [propId];
        this.store.setTool("select");
        this.store.pushHistory("Spawned Compound Asset");
        this.store.updateSpatialIndex();
        this.store.updateTrigger++;
    }
}
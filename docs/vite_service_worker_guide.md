# 🚀 UVTT v2 Service Worker Integration Guide

This guide details how to integrate the **Transparent Decryption Service Worker** (`decryption_service_worker.js`) into a Svelte/Vite compiler pipeline, and how to orchestrate keys securely between the main application thread and the background worker.

---

## 🏗️ How the Architecture Works Behind the Scenes

The service worker acts as a local proxy network layer. This provides two massive benefits:
1. **Unmodified Client Code:** Your Svelte components and rendering systems (WebGL/WebGPU) load assets natively using standard URL schemes (e.g., `<img src="/assets/premium_map.webp">`). They don't need custom stream decryption wrappers.
2. **True In-Memory Decryption (DRM Safe):** The service worker caches the *encrypted* file to disk persistently using `CacheStorage`. Decryption happens *entirely in volatile RAM* upon request. The decrypted bytes are fed to the viewport and never saved to the physical drive, preventing raw asset piracy.

---

## ⚙️ 1. Vite Compiler Configuration

To ensure the Service Worker compiles and bundles correctly under Vite without being mangled by standard tree-shaking, place `decryption_service_worker.js` inside your `/public/` directory so it is copied to the build root without modification:

```directory
uvtt-v2-upgrader/ (Root Directory)
├── public/
│   └── decryption_service_worker.js  <-- Place the Service Worker here
├── src/
│   └── main.js
└── vite.config.js
```

---

## 🛠️ 2. Registration & Key Handshake Middleware

Add this utility to `src/utils/drmOrchestrator.js` to manage Service Worker lifecycles and synchronize cryptographic keys immediately after performing your **ZKS Clearinghouse** API fetches.

```javascript
/**
 * UVTT v2 DRM Service Worker Orchestrator
 */

let swRegistration = null;

/**
 * Register the Service Worker during application bootstrap
 */
export async function registerDecryptionServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.warn("[-] Service Workers are not supported by this browser.");
    return;
  }

  try {
    // Register the SW at the root scope
    swRegistration = await navigator.serviceWorker.register("/decryption_service_worker.js", {
      scope: "/"
    });
    
    console.log("[+] UVTT v2 Decryption Service Worker registered with scope:", swRegistration.scope);
  } catch (err) {
    console.error("[-] Service Worker registration failed:", err);
  }
}

/**
 * Sync a key fetched from the ZKS Clearinghouse to the Service Worker
 * @param {string} assetPath - e.g., 'assets/premium_map.webp'
 * @param {string} keyRawHex - 256-bit Hexadecimal key string
 */
export function syncDecryptionKeyToWorker(assetPath, keyRawHex) {
  const activeWorker = navigator.serviceWorker.controller;
  
  if (!activeWorker) {
    console.warn("[-] Active Service Worker controller not found. Retrying in 100ms...");
    setTimeout(() => syncDecryptionKeyToWorker(assetPath, keyRawHex), 100);
    return;
  }

  // Stream the key over the message port channel
  activeWorker.postMessage({
    type: "SYNC_DECRYPTION_KEY",
    payload: { assetPath, keyRawHex }
  });
}

/**
 * Force the Service Worker to purge all stored keys (e.g. on logout or map swap)
 */
export function clearVolatileKeys() {
  const activeWorker = navigator.serviceWorker.controller;
  if (activeWorker) {
    activeWorker.postMessage({ type: "CLEAR_KEY_REGISTRY" });
  }
}
```

---

## 🔄 3. Putting It All Together: The User Workflow

When a player transitions to a new multi-level map floor, your application executes this lightning-fast sequence behind the scenes:

1. **Token Triggers Teleport:** A token steps onto an event trigger with a destination pointing to `relative://undermountain_lvl2.uvtt2z#lz_stairs`.
2. **Perform ZKS Fetch:** Your VTT client runs the `zks_key_retrieval.ts` script to authenticate with the Cloudflare Worker clearinghouse and retrieve the 256-bit symmetric hex key for `assets/undermountain_lvl2_map.webp`.
3. **Register the Key:** The client calls `syncDecryptionKeyToWorker("assets/undermountain_lvl2_map.webp", "ab04fe...3189")`.
4. **Trigger Viewport Load:** Svelte updates the DOM container:
   ```html
   <img src="/assets/undermountain_lvl2_map.webp" alt="Map Grid" />
   ```
5. **Transparent Interception:** The browser initiates the fetch. The Service Worker intercepts it, pulls the encrypted WebP from the local cache, decrypts it in-memory with the synchronized key, and returns the decrypted image stream instantly to the DOM.

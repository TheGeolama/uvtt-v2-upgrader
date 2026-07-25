/**
 * @fileoverview UVTT v2 - Offline-First Service Worker & Cryptographic Decryption Engine
 * 
 * This service worker combines two critical architectures:
 * 1. An Offline App Shell Caching System: Ensures the Svelte/PixiJS v8 Upgrader editor
 *    remains 100% functional without an internet connection[cite: 17].
 * 2. A Volatile RAM Decryption Pipeline: Intercepts requests for encrypted premium map assets, 
 *    caches only their safely encrypted forms to the hard drive, and decrypts them 
 *    on-the-fly entirely within volatile memory[cite: 17].
 */

const CACHE_VERSION = 'v2.0.0-rc1';
const SHELL_CACHE_NAME = `uvtt-upgrader-shell-${CACHE_VERSION}`;
const ENCRYPTED_ASSETS_CACHE_NAME = `uvtt-encrypted-assets-${CACHE_VERSION}`;

// Core static application shell files required to run the editor offline[cite: 17]
const STATIC_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest',
  // Note: Vite will compile and generate fingerprinted main bundles (e.g. assets/index-hash.js)[cite: 17].
  // In production setups utilizing Vite PWA plugins, those dynamic assets are auto-injected[cite: 17].
  // We include standard fallback paths here to demonstrate the manual caching structure[cite: 17].
];

/** 
 * Active in-memory cryptographic key database.
 * Stored in Volatile RAM - intentionally cleared the moment the browser/tab is closed 
 * to prevent DRM keys from being extracted from local storage[cite: 17].
 */
const volatileKeyRegistry = new Map();

/**
 * 1. Install Event: Establish the local offline cache boundary[cite: 17].
 */
self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Installing version ${CACHE_VERSION}...`);
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Precaching core application shell...');
        return cache.addAll(STATIC_SHELL_ASSETS);
      })
      .then(() => self.skipWaiting()) // Force immediate activation[cite: 17]
  );
});

/**
 * 2. Activate Event: Clean up outdated caches and claim active clients[cite: 17].
 */
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating and sweeping obsolete caches...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete any cache that doesn't match our current version strings[cite: 17]
          if (cacheName !== SHELL_CACHE_NAME && cacheName !== ENCRYPTED_ASSETS_CACHE_NAME) {
            console.log(`[Service Worker] Deleting deprecated cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

/**
 * 3. Message Event: Ingest symmetric decryption keys from the client workspace[cite: 17].
 * 
 * The main Svelte thread securely posts fetched keys to the service worker when a premium map is loaded[cite: 17].
 */
self.addEventListener('message', (event) => {
  const { type, mapId, decryptionKey } = event.data || {};
  
  if (type === 'REGISTER_DECRYPTION_KEY') {
    if (!mapId || !decryptionKey) {
      console.warn('[Service Worker] Invalid key registration payload received.');
      return;
    }
    
    // Store key in volatile Service Worker memory[cite: 17]
    volatileKeyRegistry.set(mapId, decryptionKey);
    console.log(`[Service Worker] Cryptographic key successfully registered for Map ID: ${mapId}`);
    event.ports[0]?.postMessage({ status: 'SUCCESS' });
  }
});

/**
 * Helper: Converts a hex string into a raw Uint8Array buffer for the Web Crypto API[cite: 17].
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Helper: Validates and decrypts an AES-256-GCM encrypted array buffer[cite: 17].
 */
async function decryptPayload(encryptedBuffer, rawHexKey) {
  if (encryptedBuffer.byteLength < 12 + 16) {
    throw new Error('Payload is too small to contain valid IV and GCM authentication tag.');
  }

  // 1. Extract prefix IV (First 12 bytes required for GCM mode)[cite: 17]
  const iv = encryptedBuffer.slice(0, 12);
  
  // 2. Extract ciphertext + tag (Remaining bytes)[cite: 17]
  const ciphertext = encryptedBuffer.slice(12);

  // 3. Import the raw hex key into a SubtleCrypto KeyObject[cite: 17]
  const cryptoKeyBytes = hexToBytes(rawHexKey);
  const cryptoKey = await self.crypto.subtle.importKey(
    'raw',
    cryptoKeyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // 4. Decrypt and authenticate the payload using hardware acceleration if available[cite: 17]
  return await self.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    cryptoKey,
    ciphertext
  );
}

/**
 * 4. Fetch Event: Intercept app requests and perform local routing[cite: 17].
 */
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Focus: Handle Premium Intercepts (/assets/ folder targeting media)[cite: 17]
  const isPremiumAsset = requestUrl.pathname.includes('/assets/') && 
                         (requestUrl.pathname.endsWith('.webp') || 
                          requestUrl.pathname.endsWith('.mp3') || 
                          requestUrl.pathname.endsWith('.ogg'));

  if (isPremiumAsset) {
    // Route premium assets through the secure decryption pipeline[cite: 17]
    event.respondWith(handlePremiumAssetFetch(event.request, requestUrl));
    return;
  }

  // Fallback: Apply Cache-First Strategy for Svelte/PixiJS App Shell[cite: 17]
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse; // Return fast cached UI[cite: 17]
      }

      // If missing from cache, fetch from network and dynamically cache[cite: 17]
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(SHELL_CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Safe offline placeholder fallback if totally disconnected and uncached[cite: 17]
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

/**
 * Orchestrates the secure retrieval, caching, and volatile decryption of premium assets[cite: 17].
 */
async function handlePremiumAssetFetch(request, requestUrl) {
  // Extract map identifier from request URL (assumed to be a query parameter or path segment)
  // Example: /assets/premium_map.webp?map_id=dungeon_level_1[cite: 17]
  const mapId = requestUrl.searchParams.get('map_id');
  const decryptionKey = mapId ? volatileKeyRegistry.get(mapId) : null;

  // 1. Check if the safely encrypted file is already cached on disk[cite: 17]
  const cachedEncryptedResponse = await caches.match(request);

  let rawFileBuffer;
  let headers;

  if (cachedEncryptedResponse) {
    console.log(`[Service Worker] Intercepted cache hit for ENCRYPTED asset: ${requestUrl.pathname}`);
    rawFileBuffer = await cachedEncryptedResponse.arrayBuffer();
    headers = cachedEncryptedResponse.headers;
  } else {
    // 2. Cache miss: fetch the ENCRYPTED asset from the network[cite: 17]
    console.log(`[Service Worker] Cache miss. Fetching ENCRYPTED asset from network: ${requestUrl.pathname}`);
    try {
      const networkResponse = await fetch(request);
      if (!networkResponse.ok) {
        throw new Error(`Network retrieval failed with status ${networkResponse.status}`);
      }

      // Clone response to safely store the raw ENCRYPTED bytes on disk.
      // We NEVER cache decrypted bytes to the hard drive[cite: 17].
      const responseToCache = networkResponse.clone();
      const cache = await caches.open(ENCRYPTED_ASSETS_CACHE_NAME);
      await cache.put(request, responseToCache);

      rawFileBuffer = await networkResponse.arrayBuffer();
      headers = networkResponse.headers;
    } catch (error) {
      console.error(`[Service Worker] Failed to fetch premium asset offline: ${requestUrl.pathname}`, error);
      return new Response('Network Offline and Asset Uncached', { status: 503 });
    }
  }

  // 3. Evaluate Decryption Requirements[cite: 17]
  // Check if file is flagged as encrypted (either via headers or assumed by default for premium directories)[cite: 17]
  const isEncrypted = headers.get('X-Asset-Encrypted') === 'true' || !!decryptionKey;

  if (!isEncrypted) {
    // Return standard plain file bypass if no cryptographic protection is applied[cite: 17]
    return new Response(rawFileBuffer, { headers });
  }

  if (!decryptionKey) {
    console.warn(`[Service Worker] Asset is encrypted but no active decryption key is registered for Map ID: ${mapId}`);
    return new Response('Asset Encrypted - Decryption Key Required', { 
      status: 401,
      headers: { 'X-Requires-Decryption': 'true' }
    });
  }

  // 4. Execute Volatile RAM Decryption[cite: 17]
  try {
    const decryptedBuffer = await decryptPayload(rawFileBuffer, decryptionKey);
    console.log(`[Service Worker] Successfully decrypted asset in volatile memory: ${requestUrl.pathname}`);

    // Return the clean unencrypted stream directly to the browser view[cite: 17]
    const decryptedResponseHeaders = new Headers(headers);
    decryptedResponseHeaders.set('Content-Type', getContentType(requestUrl.pathname));
    decryptedResponseHeaders.delete('X-Asset-Encrypted'); // Strip DRM flags so the rendering engine doesn't panic[cite: 17]

    return new Response(decryptedBuffer, {
      status: 200,
      headers: decryptedResponseHeaders
    });
  } catch (error) {
    console.error(`[Service Worker] Cryptographic decryption failed for ${requestUrl.pathname}:`, error);
    return new Response('Cryptographic Decryption Failure / Key Mismatch', { status: 403 });
  }
}

/**
 * Basic MIME type helper mapping[cite: 17].
 */
function getContentType(pathname) {
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.mp3')) return 'audio/mpeg';
  if (pathname.endsWith('.ogg')) return 'audio/ogg';
  return 'application/octet-stream';
}
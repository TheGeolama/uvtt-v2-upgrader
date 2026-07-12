/**
 * UVTT v2 - Offline-First Service Worker with Integrated Cryptographic Decryption (AES-GCM)
 * 
 * This service worker combines two critical architectures:
 * 1. An Offline App Shell Caching System (ensuring the Svelte/PixiJS v8 Upgrader editor
 *    remains 100% functional without an internet connection).
 * 2. A Volatile RAM Decryption Pipeline (intercepting encrypted premium map assets, 
 *    caching only their encrypted forms, and decrypting them in volatile memory on-the-fly).
 * 
 * Place this file as 'decryption_service_worker.js' inside your '/public' directory.
 */

const CACHE_VERSION = 'v2.0.0-rc1';
const SHELL_CACHE_NAME = `uvtt-upgrader-shell-${CACHE_VERSION}`;
const ENCRYPTED_ASSETS_CACHE_NAME = `uvtt-encrypted-assets-${CACHE_VERSION}`;

// Core static application shell files required to run the editor offline
const STATIC_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest',
  // Note: Vite will compile and generate fingerprinted main bundles (e.g. assets/index-hash.js).
  // In production setups utilizing Vite PWA plugins, those dynamic assets are auto-injected.
  // We include standard fallback paths here to demonstrate the manual caching structure.
];

// Active in-memory cryptographic key database (Volatile RAM - cleared on browser/tab close)
const volatileKeyRegistry = new Map();

/**
 * 1. Install Event: Establish the local offline cache boundary
 */
self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Installing version ${CACHE_VERSION}...`);
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Precaching core application shell...');
        return cache.addAll(STATIC_SHELL_ASSETS);
      })
      .then(() => self.skipWaiting()) // Force immediate activation
  );
});

/**
 * 2. Activate Event: Clean up outdated caches and claim active clients
 */
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating and sweeping obsolete caches...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
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
 * 3. Message Event: Ingest symmetric decryption keys from client workspace
 * 
 * The main Svelte thread securely posts fetched keys to the service worker when a map is loaded.
 */
self.addEventListener('message', (event) => {
  const { type, mapId, decryptionKey } = event.data || {};
  
  if (type === 'REGISTER_DECRYPTION_KEY') {
    if (!mapId || !decryptionKey) {
      console.warn('[Service Worker] Invalid key registration payload received.');
      return;
    }
    
    // Store key in volatile Service Worker memory
    volatileKeyRegistry.set(mapId, decryptionKey);
    console.log(`[Service Worker] Cryptographic key successfully registered for Map ID: ${mapId}`);
    event.ports[0]?.postMessage({ status: 'SUCCESS' });
  }
});

/**
 * Helper: Converts a hex string into a raw Uint8Array buffer
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Helper: Validates and decrypts an AES-256-GCM encrypted array buffer
 */
async function decryptPayload(encryptedBuffer, rawHexKey) {
  if (encryptedBuffer.byteLength < 12 + 16) {
    throw new Error('Payload is too small to contain valid IV and GCM authentication tag.');
  }

  // 1. Extract prefix IV (First 12 bytes)
  const iv = encryptedBuffer.slice(0, 12);
  
  // 2. Extract ciphertext + tag (Remaining bytes)
  const ciphertext = encryptedBuffer.slice(12);

  // 3. Import the raw hex key into a SubtleCrypto KeyObject
  const cryptoKeyBytes = hexToBytes(rawHexKey);
  const cryptoKey = await self.crypto.subtle.importKey(
    'raw',
    cryptoKeyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // 4. Decrypt and authenticate
  return await self.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    cryptoKey,
    ciphertext
  );
}

/**
 * 4. Fetch Event: Intercept app requests and perform local routing
 */
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Focus: Handle Premium Intercepts (/assets/ folder targeting media)
  const isPremiumAsset = requestUrl.pathname.includes('/assets/') && 
                         (requestUrl.pathname.endsWith('.webp') || 
                          requestUrl.pathname.endsWith('.mp3') || 
                          requestUrl.pathname.endsWith('.ogg'));

  if (isPremiumAsset) {
    event.respondWith(handlePremiumAssetFetch(event.request, requestUrl));
    return;
  }

  // Fallback: Apply Cache-First Strategy for Svelte/PixiJS App Shell
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse; // Return fast cached UI
      }

      // If missing from cache, fetch from network and dynamically cache
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
        // Safe offline placeholder fallback if totally disconnected and uncached
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

/**
 * Orchestrates the secure retrieval, caching, and volatile decryption of premium assets.
 */
async function handlePremiumAssetFetch(request, requestUrl) {
  // Extract map identifier from request URL (assumed to be a query parameter or path segment)
  // Example: /assets/premium_map.webp?map_id=dungeon_level_1
  const mapId = requestUrl.searchParams.get('map_id');
  const decryptionKey = mapId ? volatileKeyRegistry.get(mapId) : null;

  // 1. Check if the encrypted file is already cached on disk
  const cachedEncryptedResponse = await caches.match(request);

  let rawFileBuffer;
  let headers;

  if (cachedEncryptedResponse) {
    console.log(`[Service Worker] Intercepted cache hit for ENCRYPTED asset: ${requestUrl.pathname}`);
    rawFileBuffer = await cachedEncryptedResponse.arrayBuffer();
    headers = cachedEncryptedResponse.headers;
  } else {
    // 2. Cache miss: fetch the ENCRYPTED asset from the network
    console.log(`[Service Worker] Cache miss. Fetching ENCRYPTED asset from network: ${requestUrl.pathname}`);
    try {
      const networkResponse = await fetch(request);
      if (!networkResponse.ok) {
        throw new Error(`Network retrieval failed with status ${networkResponse.status}`);
      }

      // Clone response to safely store the raw encrypted bytes on disk
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

  // 3. Evaluate Decryption Requirements
  // Check if file is flagged as encrypted (either via headers or assumed by default for premium directories)
  const isEncrypted = headers.get('X-Asset-Encrypted') === 'true' || !!decryptionKey;

  if (!isEncrypted) {
    // Return standard plain file bypass if no cryptographic protection is applied
    return new Response(rawFileBuffer, { headers });
  }

  if (!decryptionKey) {
    console.warn(`[Service Worker] Asset is encrypted but no active decryption key is registered for Map ID: ${mapId}`);
    return new Response('Asset Encrypted - Decryption Key Required', { 
      status: 401,
      headers: { 'X-Requires-Decryption': 'true' }
    });
  }

  // 4. Execute Volatile RAM Decryption
  try {
    const decryptedBuffer = await decryptPayload(rawFileBuffer, decryptionKey);
    console.log(`[Service Worker] Successfully decrypted asset in volatile memory: ${requestUrl.pathname}`);

    // Return the clean unencrypted stream directly to the browser view
    const decryptedResponseHeaders = new Headers(headers);
    decryptedResponseHeaders.set('Content-Type', getContentType(requestUrl.pathname));
    decryptedResponseHeaders.delete('X-Asset-Encrypted'); // Strip DRM flags for rendering engines

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
 * Basic MIME type helper mapping
 */
function getContentType(pathname) {
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.mp3')) return 'audio/mpeg';
  if (pathname.endsWith('.ogg')) return 'audio/ogg';
  return 'application/octet-stream';
}

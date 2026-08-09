/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const CACHE = `innoserve-cache-v${version}`;

// Static assets produced by the build + any files in /static
const PRECACHE = [...build, ...files];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  // Activate immediately — no waiting for old tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      for (const key of keys) {
        if (key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept API / GraphQL / upload calls — always go to network
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/graphql' ||
    url.pathname === '/upload' ||
    url.pathname.startsWith('/file/')
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      // Cache-first for pre-cached static assets
      if (PRECACHE.includes(url.pathname)) {
        const cached = await cache.match(event.request);
        if (cached) return cached;
      }

      try {
        const response = await fetch(event.request);
        // Cache successful navigation responses for offline fallback
        if (response.ok && event.request.mode === 'navigate') {
          cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        // Network failed — serve the offline page for navigation requests
        if (event.request.mode === 'navigate') {
          const offline = await cache.match('/offline');
          if (offline) return offline;
        }
        return new Response('Service unavailable', { status: 503 });
      }
    })()
  );
});

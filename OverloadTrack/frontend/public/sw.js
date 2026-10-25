// Overloady service worker: opens the installed app without network, keeps the last answers of
// the API for the gym, and shows the notifications pushed by the server (end of the rest timer).
//
// BUILD is stamped at each production build (vite.config.ts): every deploy changes this file, so
// the browser installs the new worker, which drops the previous version's files. In dev the stamp
// is missing and nothing is cached: Vite serves fresh modules.
const BUILD = '__OVERLOADY_BUILD__';
const CACHING = !BUILD.startsWith('__');
const SHELL_CACHE = `overloady-shell-${BUILD}`;
const API_CACHE = 'overloady-api-v1';
const FONT_CACHE = 'overloady-fonts-v1';
// Marks an API answer served from the device, so the app knows it is offline
const OFFLINE_HEADER = 'x-overloady-offline';

const SHELL_FILES = ['/', '/manifest.json', '/favicon.svg', '/icons/icon-192.png', '/icons/apple-touch-icon.png'];
// A gym Wi-Fi that holds the connection but lets nothing through: past this, the kept copy shows
const PAGE_TIMEOUT_MS = 4000;
const API_TIMEOUT_MS = 8000;
// Answers that legitimately take long (Atlas writing the next session): only a failure falls back
const SLOW_API = /\/workout\/(next-recommendation|regenerate-recommendation)/;

// The page and the files it loads (hashed by Vite, so a new deploy means new names)
const shellAssets = (html) =>
  Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g), (match) => match[1]);

// The page and its scripts must all be kept, or the install fails and the previous version, which
// works offline, stays in charge until the next try
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      if (CACHING) {
        const cache = await caches.open(SHELL_CACHE);
        const page = await fetch('/', { cache: 'reload' });
        if (!page.ok) throw new Error(`Page unavailable (${page.status})`);
        const html = await page.clone().text();
        await cache.addAll(shellAssets(html));
        await cache.put('/', page);
        // Icons and manifest one by one: a missing one never blocks the update
        await Promise.all(SHELL_FILES.slice(1).map((file) => cache.add(file).catch(() => {})));
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Files of the previous versions: the new page never asks for them
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith('overloady-shell-') && name !== SHELL_CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// Logout: the athlete's data leaves the device
self.addEventListener('message', (event) => {
  if (event.data?.type === 'clear-api-cache') event.waitUntil(caches.delete(API_CACHE));
});

/** The athlete an API call belongs to, read from its token: cached answers never cross accounts. */
const accountOf = (request) => {
  const auth = request.headers.get('Authorization') || '';
  try {
    const payload = JSON.parse(atob(auth.split(' ')[1].split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
};

const delay = (ms) => new Promise((resolve) => setTimeout(() => resolve(null), ms));

/**
 * The network's answer, unless it fails or (with a timeout) takes too long while a kept copy
 * exists: then the copy. A late answer from the network still refreshes what is kept.
 */
const networkOrKept = async (event, network, kept, timeoutMs) => {
  const fresh = network.catch(() => null);
  event.waitUntil(fresh);
  const first = await Promise.race(timeoutMs ? [fresh, delay(timeoutMs)] : [fresh]);
  if (first) return first;
  const copy = await kept();
  if (copy) return copy;
  // Nothing kept: wait for the network after all, and let a failure show as one
  return (await fresh) || network;
};

/** Fresh from the network when it answers, else the last answer kept for this account. */
const apiNetworkFirst = (event, account) => {
  const { request } = event;
  const key = `${request.url}${request.url.includes('?') ? '&' : '?'}__account=${encodeURIComponent(account)}`;
  const network = fetch(request).then(async (response) => {
    if (response.ok) await (await caches.open(API_CACHE)).put(key, response.clone());
    return response;
  });
  const kept = async () => {
    const cached = await (await caches.open(API_CACHE)).match(key);
    if (!cached) return null;
    const headers = new Headers(cached.headers);
    headers.set(OFFLINE_HEADER, '1');
    return new Response(await cached.blob(), { status: cached.status, statusText: cached.statusText, headers });
  };
  return networkOrKept(event, network, kept, SLOW_API.test(request.url) ? 0 : API_TIMEOUT_MS);
};

/**
 * The page: the latest deploy when online. Offline, the one installed with this worker, whose
 * scripts are kept with it (a newer page would ask for scripts this version never kept).
 */
const pageNetworkFirst = (event) =>
  networkOrKept(
    event,
    fetch(event.request),
    async () => (await caches.open(SHELL_CACHE)).match('/'),
    PAGE_TIMEOUT_MS,
  );

const cacheFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!CACHING || request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(pageNetworkFirst(event));
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/assets/') || SHELL_FILES.includes(url.pathname) || url.pathname.startsWith('/icons/')) {
      event.respondWith(cacheFirst(request, SHELL_CACHE));
    }
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // The API: only the athlete's own reads (they carry the login), never the health check
  const account = accountOf(request);
  if (account && !url.pathname.startsWith('/health')) {
    event.respondWith(apiNetworkFirst(event, account));
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  // iOS revokes the subscription of a web app that receives a push without showing anything
  event.waitUntil(
    self.registration.showNotification(data.title || 'Overloady', {
      body: data.body || '',
      tag: data.tag,
      renotify: Boolean(data.tag),
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200],
    }),
  );
});

// A tap on the notification brings the app back, or opens it
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => 'focus' in client);
      return open ? open.focus() : self.clients.openWindow('/');
    }),
  );
});

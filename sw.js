/**
 * Service Worker – macht die App offline startfähig.
 *
 * Wichtig: Nach jeder Änderung an index.html, sw.js oder manifest.json
 * die Versionsnummer unten hochzählen. Sonst liefern Handys, auf denen
 * die App schon installiert ist, weiter die alte Fassung aus.
 */

const CACHE_VERSION = 'v2';

const CACHE_NAME = 'geraete-scanner-' + CACHE_VERSION;

/** Muss vorhanden sein, sonst schlägt die Installation fehl. */
const REQUIRED_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/** Darf fehlen. jsQR ist nur der QR-Fallback für Browser ohne BarcodeDetector. */
const OPTIONAL_FILES = [
  './jsQR.js'
];

const SHELL_URL = new URL('index.html', self.registration.scope).href;
/** const SHELL_URL = self.registration.scope; */

self.addEventListener('install', function (event) {

  event.waitUntil((async function () {

    const cache = await caches.open(CACHE_NAME);

    await cache.addAll(REQUIRED_FILES);

    await Promise.all(OPTIONAL_FILES.map(function (file) {
      return cache.add(file).catch(function () { return null; });
    }));

    await self.skipWaiting();

  })());
});


self.addEventListener('activate', function (event) {

  event.waitUntil((async function () {

    const names = await caches.keys();

    await Promise.all(names.map(function (name) {
      return name === CACHE_NAME ? null : caches.delete(name);
    }));

    await self.clients.claim();

  })());
});


self.addEventListener('fetch', function (event) {

  const request = event.request;

  // Uploads zur Apps-Script-API laufen immer direkt ins Netz.
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  // Seitenaufruf, auch mit ?id=… aus einem QR-Code.
  if (request.mode === 'navigate') {

    event.respondWith((async function () {

      const cache = await caches.open(CACHE_NAME);

      const cached = await cache.match(SHELL_URL) ||
        await cache.match('./', { ignoreSearch: true });

      // Im Hintergrund aktualisieren, damit eine neue Fassung
      // beim nächsten Start bereitsteht.
      const network = fetch(SHELL_URL)
        .then(function (response) {

          if (response && response.ok) {
            cache.put(SHELL_URL, response.clone());
          }

          return response;
        })
        .catch(function () { return null; });

      if (cached) {
        return cached;
      }

      const fresh = await network;

      return fresh || new Response(
        '<!DOCTYPE html><meta charset="utf-8">' +
        '<p style="font-family:Arial;padding:24px">Die App ist noch nicht ' +
        'für die Offline-Nutzung gespeichert. Bitte einmal mit Internet öffnen.</p>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );

    })());

    return;
  }

  // Übrige eigene Dateien: erst Cache, dann im Hintergrund erneuern.
  event.respondWith((async function () {

    const cache = await caches.open(CACHE_NAME);

    const cached = await cache.match(request);

    const network = fetch(request)
      .then(function (response) {

        if (response && response.ok) {
          cache.put(request, response.clone());
        }

        return response;
      })
      .catch(function () { return null; });

    if (cached) {
      return cached;
    }

    const fresh = await network;

    return fresh || new Response('', { status: 504 });

  })());
});

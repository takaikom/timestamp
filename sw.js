// sw.js — 作業記録 Service Worker
const CACHE_NAME = 'worktracker-v1';

// キャッシュするリソース
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&family=DM+Mono:wght@400;500&display=swap'
];

// インストール時にキャッシュ
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // フォントURLはno-corsで取得
      const requests = PRECACHE_URLS.map(url => {
        if (url.startsWith('https://fonts.')) {
          return new Request(url, { mode: 'no-cors' });
        }
        return url;
      });
      return cache.addAll(requests).catch(err => {
        console.warn('[SW] precache partial fail:', err);
      });
    })
  );
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// フェッチ戦略: Network First（失敗したらキャッシュ）
// GAS API は常にネットワークを使う
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // GAS API やその他の外部 API はキャッシュしない
  if (url.includes('script.google.com') || url.includes('googleapis.com/macros')) {
    return; // ブラウザのデフォルト動作に任せる
  }

  // フォントは Cache First
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request, { mode: 'no-cors' }).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // HTMLやアセットは Network First → Cache Fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 正常レスポンスをキャッシュに保存
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // HTMLへのフォールバック
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
  );
});

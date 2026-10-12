// 오프라인용 서비스워커 (index.html 과 같은 폴더에 올림)
// 1) 앱 파일(index.html·수심·해도·Leaflet)을 저장 → 인터넷이 없어도 앱이 열림
//    인터넷이 되면 항상 새로 확인해서 받음 (GitHub Pages 10분 캐시 때문에 예전 판이 보이던 것도 없어짐)
// 2) [오프라인 지도]로 받아 둔 위성지도 타일을 꺼내 줌
const APP = 'app-v1', LIB = 'lib-v1', TILES = 'tiles-v1';
const APP_FILES = ['./', 'chart_data.js', 'depth_data.js', 'depth_west.js', 'depth_east.js'];
const LIB_FILES = ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    await Promise.all(APP_FILES.map(u => c.add(new Request(u, {cache: 'reload'})).catch(() => {}))); // 하나 없어도 나머지는 저장
    const l = await caches.open(LIB);
    await Promise.all(LIB_FILES.map(u => l.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// 바다에서 LTE가 약하면 응답 없이 한참 기다리게 됨 → 5초 넘으면 저장본으로
function fetchWithin(req, ms, opt) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout')), ms);
    fetch(req, opt).then(r => { clearTimeout(t); res(r); }, er => { clearTimeout(t); rej(er); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  // 위성지도: 받아 둔 타일이 있으면 그것, 없으면 인터넷
  if (u.hostname === 'server.arcgisonline.com') {
    e.respondWith(caches.open(TILES).then(c => c.match(req.url)).then(r => r || fetch(req)));
    return;
  }
  // Leaflet (지도 프로그램): 저장본 먼저
  if (u.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.open(LIB).then(c => c.match(req).then(r => r || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  // 앱 파일: 인터넷 먼저(새 판 확인), 안 되면 저장본. 주소 뒤 ?v=… 는 무시하고 같은 파일로 저장
  if (u.origin === location.origin && !u.pathname.endsWith('sw.js')) {
    e.respondWith((async () => {
      const c = await caches.open(APP), key = u.origin + u.pathname;
      try {
        const res = await fetchWithin(req, 5000, {cache: 'no-cache'});
        if (res.ok) c.put(key, res.clone());
        return res;
      } catch (er) {
        const r = await c.match(key) || (req.mode === 'navigate' ? await c.match(new URL('./', location).href) : null);
        if (r) return r;
        throw er;
      }
    })());
  }
});

const CACHE='pecujeme-shell-2026-11-17-v1';
const ASSETS=['/','/offline.html','/style.css','/app.js','/reports.js','/manifest.json','/icon.svg','/icon-192.png','/icon-512.png','/apple-touch-icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('pecujeme-shell-')&&key!==CACHE)await caches.delete(key);await clients.claim()})()));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 // Never cache care records, authentication, write requests or third-party responses.
 if(e.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match('/offline.html')));return}
 if(ASSETS.includes(url.pathname))e.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(e.request,{ignoreSearch:true}))||fetch(e.request)));
});
self.addEventListener('push',e=>{let d={};try{d=e.data?.json()||{}}catch{d={body:'Nová událost v péči'}}e.waitUntil(self.registration.showNotification('Pečujeme',{body:d.body||'Nová událost',icon:'/icon-192.png',tag:d.id||String(Date.now()),data:{url:'/'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async ws=>{if(ws[0])return ws[0].focus();return clients.openWindow('/')}))});

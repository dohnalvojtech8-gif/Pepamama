import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('PWA service worker preloads install assets but never caches private APIs or write requests',async()=>{
 const handlers=new Map(),assets=[];let offline=false;
 const context={URL,clients:{claim:async()=>{}},self:{location:{origin:'https://example.com'},addEventListener:(name,fn)=>handlers.set(name,fn)},caches:{open:async()=>({addAll:async list=>assets.push(...list),match:async()=>null}),match:async()=> 'offline-screen',keys:async()=>[]},fetch:async()=>{if(offline)throw Error('offline');return 'network'}};
 vm.createContext(context);vm.runInContext(await readFile('public/sw.js','utf8'),context);
 let install;handlers.get('install')({waitUntil:p=>install=p});await install;assert.ok(assets.includes('/icon-192.png'));assert.ok(assets.includes('/icon-512.png'));assert.ok(assets.includes('/reports.js'));assert.ok(assets.includes('/offline.html'));assert.ok(!assets.some(a=>a.startsWith('/api/')));
 for(const request of [{url:'https://example.com/api/state',method:'GET'},{url:'https://example.com/api/login',method:'POST'},{url:'https://other.example/app.js',method:'GET'}]){let intercepted=false;handlers.get('fetch')({request,respondWith:()=>intercepted=true});assert.equal(intercepted,false)}
 offline=true;let response;handlers.get('fetch')({request:{url:'https://example.com/',method:'GET',mode:'navigate'},respondWith:p=>response=p});assert.equal(await response,'offline-screen');
});
test('manifest has installable raster icons, stable identity and standalone presentation',async()=>{
 const m=JSON.parse(await readFile('public/manifest.json','utf8'));assert.equal(m.display,'standalone');assert.equal(m.id,'/');assert.equal(m.start_url,'/');assert.ok(m.icons.some(i=>i.sizes==='192x192'&&i.type==='image/png'));assert.ok(m.icons.some(i=>i.sizes==='512x512'&&i.type==='image/png'));
 for(const icon of m.icons){const png=await readFile('public'+icon.src);assert.equal(png.subarray(1,4).toString(),'PNG');const size=Number(icon.sizes.split('x')[0]);assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size)}
 const html=await readFile('public/index.html','utf8');assert.match(html,/apple-touch-icon/);assert.match(html,/viewport-fit=cover/);
});

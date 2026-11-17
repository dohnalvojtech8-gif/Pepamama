import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHmac,timingSafeEqual,randomBytes,scryptSync,randomUUID} from 'node:crypto';
const env=process.env,live=Boolean(env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY);
if(Boolean(env.SUPABASE_URL)!==Boolean(env.SUPABASE_SERVICE_ROLE_KEY))throw Error('Set both Supabase environment variables.');
if(live&&(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<12||!env.TERMINAL_PASSWORD||env.TERMINAL_PASSWORD.length<12||env.ADMIN_PASSWORD===env.TERMINAL_PASSWORD||!env.SESSION_SECRET||env.SESSION_SECRET.length<32||!env.APP_URL))throw Error('Production requires separate 12+ character passwords, SESSION_SECRET (32+) and APP_URL.');
if(env.NODE_ENV==='production'&&!live)throw Error('Production requires Supabase. Demo is local only.');
let webpush;const push=Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_SUBJECT);if(push){webpush=(await import('web-push')).default;webpush.setVapidDetails(env.VAPID_SUBJECT,env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY)}
const secret=env.SESSION_SECRET||randomBytes(32).toString('hex'),streams=new Set(),attempts=new Map();
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
const sign=v=>createHmac('sha256',secret).update(v).digest('base64url');
async function credential(r){return (await db(`app_credentials?role=eq.${r}&select=*`))[0]||null}
function hashPassword(password){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,32).toString('hex')}
function verifyPassword(password,entry,r){if(!entry)return equal(password,r==='admin'?env.ADMIN_PASSWORD:env.TERMINAL_PASSWORD);const [salt,hash]=entry.password_hash.split(':');return equal(scryptSync(password,salt,32).toString('hex'),hash)}
function sessionCookie(r,version){const data=Buffer.from(JSON.stringify({role:r,v:version||'initial',exp:Date.now()+30*86400000})).toString('base64url');return `care_session=${data}.${sign(data)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${env.APP_URL.startsWith('https:')?'; Secure':''}`}
async function role(req){const cookie=(req.headers.cookie||'').split('; ').find(c=>c.startsWith('care_session='))?.slice(13);if(!cookie)return null;const [data,sig]=cookie.split('.');if(!sig||!equal(sign(data),sig))return null;let p;try{p=JSON.parse(Buffer.from(data,'base64url').toString())}catch{return null}if(p.exp<=Date.now()||!['admin','terminal'].includes(p.role))return null;const c=await credential(p.role);return (p.v||'initial')===(c?.version||'initial')?p.role:null}

function json(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data))}
async function body(req){let s='';for await(const chunk of req){s+=chunk;if(s.length>20000)throw Error('Požadavek je příliš velký')}return JSON.parse(s||'{}')}
async function db(path,method='GET',data){const r=await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`,{method,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,...(env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`}),'Content-Type':'application/json',Prefer:'return=representation,resolution=merge-duplicates'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});if(!r.ok){console.error('Database request failed:',r.status);throw Error('Databázová operace se nezdařila. Obnovte přehled a ověřte stav.')}return r.status===204?null:r.json()}
async function all(table,order='id'){let rows=[],offset=0;while(true){const part=await db(`${table}?select=*&order=${order}&limit=1000&offset=${offset}`);rows.push(...part);if(part.length<1000)break;offset+=1000}return rows}
async function notify(event){if(!push)return {failed:0};const subs=await all('push_subscriptions','endpoint');let failed=0;await Promise.all(subs.map(async s=>{try{await webpush.sendNotification(s.subscription,JSON.stringify({id:event.id,body:`${event.caregiver_name.split(' ').slice(-1).join(' ')} – ${event.label.toLowerCase()}`} ),{TTL:86400,timeout:10000})}catch(e){failed++;if([404,410].includes(e.statusCode))await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`,'DELETE');console.error('Push delivery failed:',e.statusCode||'network')}}));return {failed}}
const files={'/':['index.html','text/html; charset=utf-8'],'/offline.html':['offline.html','text/html; charset=utf-8'],'/reports.js':['reports.js','text/javascript'],'/icon-192.png':['icon-192.png','image/png'],'/icon-512.png':['icon-512.png','image/png'],'/apple-touch-icon.png':['apple-touch-icon.png','image/png'],'/style.css':['style.css','text/css'],'/app.js':['app.js','text/javascript'],'/sw.js':['sw.js','text/javascript'],'/manifest.json':['manifest.json','application/manifest+json'],'/icon.svg':['icon.svg','image/svg+xml']};
const server=http.createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');const url=new URL(req.url,'http://localhost'),path=url.pathname;try{
if(path==='/health')return json(res,200,{ok:true});
if(path==='/api/config')return json(res,200,{demo:!live,role:await role(req),push,vapid:push?env.VAPID_PUBLIC_KEY:null});
if(path.startsWith('/api/')){
 if(!live)return json(res,400,{error:'Toto je lokální demo.'});
 if(req.method==='POST'&&req.headers.origin!==new URL(env.APP_URL).origin)return json(res,403,{error:'Nepovolený původ požadavku.'});
 if(path==='/api/login'&&req.method==='POST'){const ip=req.socket.remoteAddress,key=ip;let a=attempts.get(key)||{count:0,until:Date.now()+900000};if(a.until<Date.now())a={count:0,until:Date.now()+900000};if(a.count>=10)return json(res,429,{error:'Příliš mnoho pokusů. Zkuste to za 15 minut.'});a.count++;attempts.set(key,a);const b=await body(req),r=b.role==='terminal'?'terminal':'admin';const c=await credential(r);if(!verifyPassword(String(b.password||''),c,r))return json(res,401,{error:'Nesprávné heslo.'});attempts.delete(key);return json(res,200,{ok:true},{'Set-Cookie':sessionCookie(r,c?.version)})}

 const r=await role(req);if(!r)return json(res,401,{error:'Přihlaste zařízení.'});
 if(path==='/api/logout'&&req.method==='POST')return json(res,200,{ok:true},{'Set-Cookie':'care_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
 if(path==='/api/state'&&req.method==='GET'){const [caregivers,tasks,visits,events]=await Promise.all([all('caregivers'),all('tasks'),all('visits'),all('events','created_at.desc,id')]);return json(res,200,{caregivers:r==='admin'?caregivers:caregivers.filter(p=>!p.deleted_at),tasks:r==='admin'?tasks:tasks.filter(t=>!t.deleted_at),visits:r==='admin'?visits:visits.filter(v=>!v.departed_at),events:r==='admin'?events:events.filter(e=>dayString(e.created_at)===dayString(new Date()))})}
 if(path==='/api/stream'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');streams.add(res);const t=setInterval(()=>res.write(': heartbeat\n\n'),25000);req.on('close',()=>{clearInterval(t);streams.delete(res)});return}
 if(path==='/api/event'&&req.method==='POST'){const b=await body(req),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;if(!uuid.test(b.caregiver_id)||!uuid.test(b.request_id)||!['arrival','task','departure'].includes(b.kind)||(b.kind==='task'&&!uuid.test(b.task_id)))return json(res,400,{error:'Neplatná událost.'});const event=await db('rpc/record_care_event','POST',{p_caregiver:b.caregiver_id,p_kind:b.kind,p_task:b.task_id||null,p_request:b.request_id});for(const s of streams)s.write('data: changed\n\n');let delivery={failed:0};if(!event.duplicate){try{delivery=await notify(event)}catch{delivery.failed=1;console.error('Push dispatch failed')}}return json(res,200,{event,notification_failures:delivery.failed})}
 if(r!=='admin')return json(res,403,{error:'Tuto akci může provést pouze správce.'});
 if(path==='/api/password'&&req.method==='POST'){
  const b=await body(req),target=b.role==='terminal'?'terminal':'admin',current=String(b.current_password||''),password=String(b.new_password||'');
  const key='password:'+req.socket.remoteAddress;let attempt=attempts.get(key)||{count:0,until:Date.now()+900000};if(attempt.until<Date.now())attempt={count:0,until:Date.now()+900000};if(attempt.count>=10)return json(res,429,{error:'Příliš mnoho pokusů. Zkuste to za 15 minut.'});attempt.count++;attempts.set(key,attempt);
  if(!verifyPassword(current,await credential('admin'),'admin'))return json(res,401,{error:'Současné heslo správce není správné.'});
  if(password.length<12||password.length>128)return json(res,400,{error:'Nové heslo musí mít 12 až 128 znaků.'});
  if(password!==b.confirm_password)return json(res,400,{error:'Nová hesla se neshodují.'});
  const other=target==='admin'?'terminal':'admin';if(verifyPassword(password,await credential(other),other))return json(res,400,{error:'Správce a terminál musí mít různá hesla.'});
  const version=randomUUID();await db('app_credentials','POST',{role:target,password_hash:hashPassword(password),version,updated_at:new Date().toISOString()});attempts.delete(key);
  for(const stream of streams)stream.end();
  return json(res,200,{ok:true},target==='admin'?{'Set-Cookie':sessionCookie('admin',version)}:{});
 }
 if(path==='/api/remove'&&req.method==='POST'){
  const b=await body(req);if(!['caregiver','task'].includes(b.type)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id))return json(res,400,{error:'Neplatný profil nebo úkon.'});
  const result=await db('rpc/remove_care_item','POST',{p_type:b.type,p_id:b.id});
  if(result.error)return json(res,409,{error:result.error});
  for(const stream of streams)stream.write('data: changed\n\n');return json(res,200,{ok:true});
 }
 if(path==='/api/reset-data'&&req.method==='POST'){
  const b=await body(req);if(b.confirmation!=='VYMAZAT'||!['history','all'].includes(b.scope))return json(res,400,{error:'Vyberte rozsah a potvrďte slovem VYMAZAT.'});
  const key='reset:'+req.socket.remoteAddress;let a=attempts.get(key)||{count:0,until:Date.now()+900000};if(a.until<Date.now())a={count:0,until:Date.now()+900000};if(a.count>=10)return json(res,429,{error:'Příliš mnoho pokusů. Zkuste to za 15 minut.'});a.count++;attempts.set(key,a);
  if(!verifyPassword(String(b.password||''),await credential('admin'),'admin'))return json(res,401,{error:'Heslo majitele není správné.'});
  await db('rpc/reset_care_data','POST',{p_scope:b.scope});attempts.delete(key);
  for(const stream of streams)stream.write('data: changed\n\n');return json(res,200,{ok:true});
 }
 if(path==='/api/manage'&&req.method==='POST'){const b=await body(req),name=String(b.name||'').trim();if(!name||name.length>80||!['caregiver','task'].includes(b.type))return json(res,400,{error:'Vyplňte platný název.'});const result=await db(b.type==='task'?'tasks':'caregivers','POST',b.type==='task'?{name,category:b.category==='Domácnost'?'Domácnost':'Péče',icon:'check'}:{name});for(const s of streams)s.write('data: changed\n\n');return json(res,200,{ok:true,result})}
 if(path==='/api/subscribe'&&req.method==='POST'){if(!push)return json(res,400,{error:'Push není nakonfigurovaný.'});const b=await body(req);let endpoint;try{endpoint=new URL(b.endpoint)}catch{}const host=endpoint?.hostname||'',allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host==='web.push.apple.com'||host.endsWith('.notify.windows.com');if(!endpoint||endpoint.protocol!=='https:'||!allowed||!b.keys?.auth||!b.keys?.p256dh)return json(res,400,{error:'Neplatný odběr oznámení.'});await db('push_subscriptions','POST',{endpoint:b.endpoint,subscription:b});return json(res,200,{ok:true})}
 return json(res,404,{error:'Nenalezeno.'});
}
const file=files[path];if(file&&req.method==='GET'){res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-cache'});res.end(await readFile(new URL('./public/'+file[0],import.meta.url)));return}json(res,404,{error:'Nenalezeno.'});
}catch(e){console.error('Request failed:',e.message);if(!res.headersSent)json(res,500,{error:'Operace se nezdařila. Zkontrolujte připojení a obnovte přehled.'});else res.end()}});
function dayString(d){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d))}
server.listen(env.PORT||3000,'0.0.0.0',()=>console.log(`Pečujeme running on port ${env.PORT||3000} (${live?'Supabase':'local demo'})`));
process.on('SIGTERM',()=>{for(const s of streams)s.end();server.close(()=>process.exit(0))});

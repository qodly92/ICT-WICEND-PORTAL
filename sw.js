const C='ictportal-v15';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||!e.request.url.startsWith(self.location.origin))return;
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));return r})
    .catch(()=>caches.match(e.request).then(r=>r||caches.match('./app.html'))));
});
// Notifikasi dorong (Web Push) dari fungsi notify-push
self.addEventListener('push',e=>{
  let d={};try{d=e.data.json()}catch(x){d={title:'ICT Portal',body:e.data?e.data.text():''}}
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
    cs.forEach(c=>c.postMessage({type:'push',d}));
    if(cs.some(c=>c.visibilityState==='visible'&&c.focused))return; // aplikasi sedang dibuka: cukup lonceng di dalam aplikasi
    return self.registration.showNotification(d.title||'ICT Portal',{body:d.body||'',icon:'icon-192.png',badge:'icon-192.png',tag:d.tag||'ictportal',data:{url:d.url||'./'}});
  }));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
    for(const c of cs){if('focus' in c){c.focus();c.postMessage({type:'go',id:'notif'});return}}
    return self.clients.openWindow('./');
  }));
});

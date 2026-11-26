(() => {
  const palettes={studio:['#6840b5','#ed8cae','#f8f4fd','#fffaff','#30204f','#685b7e','#e5daf4','#efe4fb'],ocean:['#185d91','#53bdce','#eef8fd','#fcfeff','#15334f','#506b81','#d3e7f3','#dceffd'],garden:['#21684e','#e7b853','#f1f9f1','#fbfffa','#173f31','#526e60','#d6e9dc','#e2f3e7']};
  const keys=['primary','accent','bg','surface','text','muted','border','soft'];
  const hex=(v,f)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v:f;
  function normalize(raw={}){
    raw=raw||{};
    const preset=Object.hasOwn(palettes,raw.preset)?raw.preset:'studio', p=palettes[preset];
    let image=''; try{const u=new URL(raw.image);if(u.protocol==='https:'&&!u.username&&!u.password&&u.href.length<=2048)image=u.href}catch{}
    return {preset,primary:hex(raw.primary,p[0]),accent:hex(raw.accent,p[1]),bg:hex(raw.bg,p[2]),image,art:raw.art!==false,ornament:raw.ornament!==false,depth:raw.depth!==false,radius:[12,20,28].includes(Number(raw.radius))?Number(raw.radius):20};
  }
  function apply(raw){
    const t=normalize(raw), root=document.documentElement, p=palettes[t.preset];
    keys.forEach((k,i)=>root.style.setProperty('--pt-'+k,t[k]||p[i]));
    root.style.setProperty('--pt-radius',t.radius+'px');
    root.style.setProperty('--pt-image',t.art&&t.image?`url(${JSON.stringify(t.image)})`:'normal');
    root.dataset.ptOrnament=t.ornament?'on':'off';root.dataset.ptDepth=t.depth?'on':'off';root.dataset.ptImage=t.art?'on':'off';root.dataset.ptCustom=t.art&&t.image?'on':'off';
    if(window.Chart){Chart.defaults.color=p[5];Chart.defaults.borderColor=p[6];for(const c of Object.values(Chart.instances||{}))c.draw()}
  }
  function fields(raw){const t=normalize(raw);return `<div class="cd"><p>Pilihan ini berlaku untuk seluruh menu internal ICT Portal. Gunakan <b>Simpan</b> untuk menerapkannya kepada pengguna portal.</p><div class="sg-fields"><div class="fl"><label for="pt_preset">Preset</label><select id="pt_preset" onchange="PortalTheme.pick(this.value)">${[['studio','Studio pastel'],['ocean','Laut biru'],['garden','Taman hijau']].map(([v,l])=>`<option value="${v}" ${v===t.preset?'selected':''}>${l}</option>`).join('')}</select></div>${[['primary','Warna utama'],['accent','Warna aksen'],['bg','Latar halaman']].map(([k,l])=>`<div class="fl"><label for="pt_${k}">${l}</label><input type="color" id="pt_${k}" value="${t[k]}"></div>`).join('')}<div class="fl"><label for="pt_radius">Sudut kartu</label><select id="pt_radius">${[12,20,28].map((n,i)=>`<option value="${n}" ${n===t.radius?'selected':''}>${['Ringkas','Membulat','Ekstra bulat'][i]}</option>`).join('')}</select></div><div class="fl"><label for="pt_image">URL gambar banner (HTTPS)</label><input id="pt_image" type="url" maxlength="2048" placeholder="Kosong untuk ilustrasi bawaan"><small class="mu">Gunakan tautan langsung ke file gambar yang dapat diakses pengguna portal.</small></div></div>${[['art','Tampilkan gambar banner'],['ornament','Tampilkan ornamen dekoratif'],['depth','Efek 3D ikon dan grafik']].map(([k,l])=>`<label class="sg-check"><input id="pt_${k}" type="checkbox" ${t[k]?'checked':''}> <span>${l}</span></label>`).join('')}<div class="tb"><button type="button" class="g" onclick="PortalTheme.preview()">Pratinjau tema</button><button type="button" class="g" onclick="PortalTheme.pick('studio',true)">Kembali ke bawaan</button></div><p id="pt_status" role="status" class="mu"></p></div>`}
  const get=k=>document.getElementById('pt_'+k);
  function read(){if(!get('preset'))return null;const raw=Object.fromEntries(['preset','primary','accent','bg','image','radius'].map(k=>[k,get(k).value.trim()]));for(const k of ['art','ornament','depth'])raw[k]=get(k).checked;const t=normalize(raw);if(raw.image&&!t.image)throw new Error('Masukkan URL gambar HTTPS yang valid.');return t}
  function pick(preset,reset=false){const t=normalize({preset});for(const k of ['preset','primary','accent','bg'])get(k).value=t[k];if(reset){for(const k of ['art','ornament','depth'])get(k).checked=t[k];for(const k of ['radius','image'])get(k).value=t[k];}}
  function preview(){try{apply(read());get('status').textContent='Pratinjau aktif. Pilih Simpan untuk menerapkan ke seluruh pengguna.'}catch(e){get('status').textContent=e.message}}
  function init(raw){queueMicrotask(()=>{if(get('image'))get('image').value=normalize(raw).image});return ''}
  window.PortalTheme={apply,fields,read,pick,preview,init,normalize};
})();

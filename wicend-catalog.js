(() => {
  const base = [{name:'Wicend Twibbon', description:'Buat twibbon gratis tanpa watermark tambahan.', url:'https://wicend-twibbon.pages.dev/', icon:'🖼️'}];
  const fields = [['name','Nama aplikasi',80], ['description','Deskripsi',300], ['url','Tautan HTTPS',2048], ['icon','Ikon (emoji atau teks pendek)',16], ['image','URL gambar HTTPS (opsional)',2048]];
  const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
  function https(value) {
    if (!/^https:\/\//i.test(value) || /[\s\\\x00-\x1f\x7f]/.test(value)) return '';
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && u.href.length <= 2048 ? u.href : ''; } catch { return ''; }
  }
  function normalize(row) {
    const card = Object.fromEntries(fields.map(([key,,max]) => [key,clean(row?.[key],max)]));
    card.url = https(card.url);
    card.image = https(card.image);
    return card;
  }
  function el(tag,text,cls) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function action(text, fn) {
    const button = el('button',text);
    button.type = 'button';
    button.onclick = fn;
    return button;
  }
  function render(root, options = {}) {
    const cards = (Array.isArray(options.cards) ? options.cards : base).map(normalize).filter(c => c.name && c.description && c.url);
    const panel = el('section','','wc-catalog'), grid = el('div','','wc-grid'), editor = el('div'), status = el('p',options.message);
    status.setAttribute('role','status');
    panel.append(el(options.publicPage ? 'h1' : 'h2','Aplikasi Wicend'));
    let busy = false;
    async function save(next, message) {
      if (busy) return;
      busy = true;
      const controls = [...panel.querySelectorAll('button,input,textarea')];
      controls.forEach(control => { control.disabled = true; });
      status.textContent = 'Menyimpan…';
      try {
        await options.save(next);
        if (panel.isConnected) {
          render(root, {...options,cards:next,message});
          root.querySelector('button').focus();
        }
      } catch (error) {
        status.textContent = `Perubahan tidak tersimpan: ${error?.message || 'silakan coba lagi.'}`;
      } finally {
        busy = false;
        controls.forEach(control => { control.disabled = false; });
      }
    }
    function edit(index, trigger) {
      const form = el('form','','wc-editor'), inputs = {};
      status.textContent = '';
      form.append(el('h3',index < 0 ? 'Tambah aplikasi' : 'Edit aplikasi'));
      fields.forEach(([key,label,max]) => {
        const wrapper = el('label',label), input = el(key === 'description' ? 'textarea' : 'input');
        if (key === 'url' || key === 'image') input.type = 'url';
        input.maxLength = max;
        input.required = ['name','description','url'].includes(key);
        input.value = cards[index]?.[key] || '';
        input.oninput = () => input.setCustomValidity('');
        wrapper.append(input);
        form.append(wrapper);
        inputs[key] = input;
      });
      const actions = el('div','','wc-actions');
      actions.append(el('button','Simpan'),action('Batal',() => { editor.replaceChildren(); trigger.focus(); }));
      form.append(actions);
      form.onsubmit = event => {
        event.preventDefault();
        const card = normalize(Object.fromEntries(fields.map(([key]) => [key,inputs[key].value])));
        for (const key of ['name','description','url','image']) {
          if (!card[key] && (key !== 'image' || inputs.image.value.trim())) {
            inputs[key].setCustomValidity(key === 'name' || key === 'description' ? 'Bagian ini wajib diisi.' : 'Gunakan URL HTTPS tanpa nama pengguna atau kata sandi.');
            inputs[key].reportValidity();
            return;
          }
        }
        const next = cards.slice();
        if (index < 0) next.push(card); else next[index] = card;
        save(next,'Aplikasi disimpan.');
      };
      editor.replaceChildren(form);
      inputs.name.focus();
    }
    if (options.save) panel.append(action('+ Tambah aplikasi',e => edit(-1,e.currentTarget)),status,editor);
    if (!cards.length) grid.append(el('p','Belum ada aplikasi.'));
    cards.forEach((card,index) => {
      const item = el('article','','wc-card'), icon = el('span',card.icon || '🧩','wc-icon');
      icon.setAttribute('aria-hidden','true');
      if (card.image) {
        const img = el('img');
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => { icon.textContent = card.icon || '🧩'; };
        icon.replaceChildren(img);
        img.src = card.image;
      }
      const link = el('a','Buka aplikasi ↗');
      link.href = card.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      item.append(icon,el('h3',card.name),el('p',card.description),link);
      if (options.save) {
        const actions = el('div','','wc-actions');
        actions.append(action('Edit',e => edit(index,e.currentTarget)),action('Hapus',() => {
          if (window.confirm(`Hapus ${card.name}?`)) save(cards.filter((_,i) => i !== index),'Aplikasi dihapus.');
        }));
        item.append(actions);
      }
      grid.append(item);
    });
    panel.append(grid);
    root.replaceChildren(panel);
  }
  window.WicendCatalog = {render};
})();

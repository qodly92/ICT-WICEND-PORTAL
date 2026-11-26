(() => {
  const root = document.getElementById('root');
  const mobile = matchMedia('(max-width:800px)');
  const selector = '.app .tw,.app .pkw,.app .bd2';
  const regions = new Map();
  let frame;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(sync);
  };
  const sizes = new ResizeObserver(schedule);

  function sync() {
    frame = 0;
    for (const [region, {bar, content}] of regions) {
      if (root.contains(region) && region.firstElementChild === content) continue;
      sizes.unobserve(region);
      if (content) sizes.unobserve(content);
      bar.remove();
      regions.delete(region);
    }
    for (const region of root.querySelectorAll(selector)) {
      if (!regions.has(region)) {
        const bar = document.createElement('div');
        bar.className = 'rs-scroll';
        bar.innerHTML = '<span>Geser horizontal</span><button type="button" class="g s" aria-label="Geser ke kiri">←</button><button type="button" class="g s" aria-label="Geser ke kanan">→</button>';
        const [left, right] = bar.querySelectorAll('button');
        const move = direction => region.scrollBy({left: direction * Math.max(80, region.clientWidth * .8), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
        left.onclick = () => move(-1);
        right.onclick = () => move(1);
        region.before(bar);
        const content = region.firstElementChild;
        regions.set(region, {bar, content, left, right});
        sizes.observe(region);
        if (content) sizes.observe(content);
      }
      const {bar, left, right} = regions.get(region);
      const limit = region.scrollWidth - region.clientWidth;
      bar.hidden = limit <= 1;
      left.disabled = region.scrollLeft <= 1;
      right.disabled = region.scrollLeft >= limit - 1;
      region.tabIndex = bar.hidden ? -1 : 0;
      if (!region.hasAttribute('aria-label')) {
        region.setAttribute('role', 'region');
        region.setAttribute('aria-label', region.matches('.bd2') ? 'Papan tugas' : 'Tabel data');
      }
    }
    const drawer = root.querySelector('#sd');
    if (!drawer) return;
    const trigger = root.querySelector('.hb');
    const main = root.querySelector('.app .main');
    const open = mobile.matches && drawer.classList.contains('op');
    const wasOpen = trigger.getAttribute('aria-expanded') === 'true';
    drawer.inert = mobile.matches && !open;
    main.inert = open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open && !wasOpen) drawer.querySelector('.rs-close')?.focus();
    if (!open && wasOpen && mobile.matches) trigger.focus({preventScroll:true});
  }

  root.addEventListener('scroll', event => {
    if (regions.has(event.target)) schedule();
  }, true);
  root.addEventListener('keydown', event => {
    const drawer = root.querySelector('#sd.op');
    if (!drawer || !mobile.matches || event.key !== 'Escape') return;
    event.preventDefault();
    drawer.classList.remove('op');
  });
  new MutationObserver(schedule).observe(root, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
  mobile.addEventListener('change', () => {
    if (!mobile.matches) root.querySelector('#sd')?.classList.remove('op');
    schedule();
  });
  schedule();
})();

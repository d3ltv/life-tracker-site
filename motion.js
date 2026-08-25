/* Scroll : révélage des blocs + nav active. Respecte prefers-reduced-motion. */
(() => {
  const SELECTOR = '.topbar, .hero-grid, .section-block, .fold, .telegram-callout, .business-intro, .os-tabs, .architecture-note, footer';
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let observer = null;

  function getObserver() {
    if (observer) return observer;
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -10% 0px' });
    return observer;
  }

  function refresh() {
    const nodes = document.querySelectorAll(SELECTOR);
    if (reduced()) {
      nodes.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = getObserver();
    const vh = window.innerHeight || 800;
    nodes.forEach((el) => {
      if (el.closest('[hidden]')) {
        el.classList.add('reveal');
        el.classList.remove('is-visible');
        io.unobserve(el);
        return;
      }
      if (el.classList.contains('is-visible')) return;
      el.classList.add('reveal');
      if (el.getBoundingClientRect().top < vh * 0.92) {
        el.classList.add('is-visible');
        return;
      }
      io.observe(el);
    });
  }

  function bindNavSpy() {
    const items = [...document.querySelectorAll('.nav a[href^="#"]')]
      .map((link) => {
        const href = link.getAttribute('href');
        const el = href && href.length > 1 ? document.querySelector(href) : null;
        return el ? { link, el } : null;
      })
      .filter(Boolean);
    if (!items.length) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const line = 160;
      let current = items[0];
      for (const item of items) {
        if (item.el.getBoundingClientRect().top <= line) current = item;
      }
      items.forEach(({ link }) => link.classList.toggle('active', link === current.link));
    };
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  function init() {
    refresh();
    bindNavSpy();
    document.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => requestAnimationFrame(refresh));
    });
  }

  window.lifeosMotion = { refresh };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

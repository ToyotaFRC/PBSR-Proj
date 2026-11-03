/* PBSR project page: pseudo-burst player, comparison sliders, result viewer, BibTeX copy, analytics hooks. */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sentEvents = new Set();

  /** Count a GoatCounter event once per page view. No-op when GoatCounter is absent or blocked. */
  function track(name) {
    if (sentEvents.has(name)) return;
    sentEvents.add(name);
    const gc = window.goatcounter;
    if (gc && typeof gc.count === 'function') {
      try {
        gc.count({ path: name, title: name, event: true });
      } catch (err) {
        /* analytics must never break the page */
      }
    }
  }

  /** True for a deferred image that still shows its data: URI placeholder. */
  function isPlaceholder(img) {
    return img.hasAttribute('data-src') || (img.getAttribute('src') || '').startsWith('data:');
  }

  function markBroken(cmp, img) {
    if (isPlaceholder(img)) return;
    if (img.getAttribute('src') && img.complete && img.naturalWidth === 0) cmp.classList.add('c-error');
  }

  /** Resolves once `img` shows its real (non-placeholder) image. */
  function realImageLoaded(img) {
    return new Promise((resolve) => {
      const check = () => {
        if (isPlaceholder(img) || !img.complete || img.naturalWidth === 0) return;
        img.removeEventListener('load', check);
        resolve();
      };
      img.addEventListener('load', check);
      check();
    });
  }

  const TOUCH_SLOP_PX = 6;

  function initCompare(cmp, eventName) {
    const range = cmp.querySelector('.c-range');
    let dragging = false;
    let used = false;
    const set = (p) => {
      const v = Math.min(100, Math.max(0, p));
      cmp.style.setProperty('--pos', `${v}%`);
      range.value = String(v);
    };
    const fromPointer = (e) => {
      const r = cmp.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100);
    };
    const markUsed = () => {
      used = true;
      track(eventName);
    };
    // Touch: wait until the gesture is clearly horizontal, so a vertical page scroll
    // (handed to the browser by touch-action: pan-y) never moves the divider.
    let touchStart = null;
    const startDrag = (e) => {
      dragging = true;
      cmp.setPointerCapture(e.pointerId);
      fromPointer(e);
      markUsed();
    };
    cmp.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.pointerType === 'touch') {
        touchStart = { x: e.clientX, y: e.clientY };
        return;
      }
      startDrag(e);
    });
    cmp.addEventListener('pointermove', (e) => {
      if (dragging) {
        fromPointer(e);
        return;
      }
      if (!touchStart) return;
      const dx = Math.abs(e.clientX - touchStart.x);
      const dy = Math.abs(e.clientY - touchStart.y);
      if (dx > TOUCH_SLOP_PX && dx > dy) {
        touchStart = null;
        startDrag(e);
      }
    });
    cmp.addEventListener('pointerup', (e) => {
      if (touchStart && !dragging) {
        fromPointer(e); // a tap jumps the divider to the finger
        markUsed();
      }
      touchStart = null;
      dragging = false;
    });
    cmp.addEventListener('pointercancel', () => {
      touchStart = null;
      dragging = false;
    });
    range.addEventListener('input', () => {
      set(parseFloat(range.value));
      markUsed();
    });
    for (const img of cmp.querySelectorAll('img')) {
      img.addEventListener('error', () => cmp.classList.add('c-error'));
      markBroken(cmp, img);
    }
    if (!reduceMotion) {
      // One-time hint: sweep the divider so readers notice it can be dragged.
      const sweep = () => {
        const t0 = performance.now();
        const step = (t) => {
          if (used) return;
          const k = Math.min(1, (t - t0) / 1400);
          set(50 + 18 * Math.sin(k * Math.PI * 2));
          if (k < 1) requestAnimationFrame(step);
          else set(50);
        };
        requestAnimationFrame(step);
      };
      const io = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        // Sweep only over the real images, not over placeholders still loading.
        Promise.all([...cmp.querySelectorAll('img')].map(realImageLoaded)).then(() => {
          if (!used) sweep();
        });
      }, { threshold: 0.6 });
      io.observe(cmp);
    }
  }

  function initViewer(root) {
    const base = root.dataset.root;
    const cmp = root.querySelector('.compare');
    const top = cmp.querySelector('.c-top');
    const under = cmp.querySelector('.c-base');
    const rightLabel = cmp.querySelector('.c-label-r');
    const sceneBtns = [...root.querySelectorAll('[data-scene]')];
    const oppBtns = [...root.querySelectorAll('[data-opp]')];
    if (!sceneBtns.length || !oppBtns.length) return;
    let scene = (sceneBtns.find((b) => b.getAttribute('aria-pressed') === 'true') || sceneBtns[0]).dataset.scene;
    let opp = (oppBtns.find((b) => b.getAttribute('aria-pressed') === 'true') || oppBtns[0]).dataset.opp;
    let request = 0;
    const fetchImage = (url) => {
      const im = new Image();
      im.src = url;
      return im.decode();
    };
    // Swap both images and the label only when both new images are ready, so the
    // labels never describe a picture that is still the previous one.
    const render = () => {
      const mine = ++request;
      const oppBtn = oppBtns.find((b) => b.dataset.opp === opp);
      const topUrl = `${base}/${scene}/pbsr14.webp`;
      const underUrl = `${base}/${scene}/${opp}.webp`;
      for (const b of sceneBtns) b.setAttribute('aria-pressed', String(b.dataset.scene === scene));
      for (const b of oppBtns) b.setAttribute('aria-pressed', String(b.dataset.opp === opp));
      cmp.classList.remove('c-error');
      cmp.classList.add('c-loading');
      Promise.allSettled([fetchImage(topUrl), fetchImage(underUrl)]).then((results) => {
        if (mine !== request) return; // a newer selection superseded this one
        top.removeAttribute('data-src');
        under.removeAttribute('data-src');
        top.src = topUrl;
        under.src = underUrl;
        rightLabel.textContent = oppBtn.dataset.label;
        cmp.classList.remove('c-loading');
        if (results.some((r) => r.status === 'rejected')) cmp.classList.add('c-error');
      });
    };
    for (const b of sceneBtns) {
      b.addEventListener('click', () => {
        scene = b.dataset.scene;
        render();
        track('viewer-scene');
      });
    }
    for (const b of oppBtns) {
      b.addEventListener('click', () => {
        opp = b.dataset.opp;
        render();
        track('viewer-opponent');
      });
    }
    initCompare(cmp, 'viewer-slide');
  }

  function initBurst(box) {
    const frames = box.dataset.frames.split(',').map((s) => s.trim()).filter(Boolean);
    const fps = Number(box.dataset.fps) || 6;
    const img = box.querySelector('img');
    const badge = box.querySelector('.badge');
    const fig = box.closest('figure');
    const scrub = fig.querySelector('.scrub');
    const toggle = fig.querySelector('.play');
    let k = 0;
    let timer = null;
    let visible = false;
    let ready = false;
    let paused = reduceMotion;
    const show = (i) => {
      k = (i + frames.length) % frames.length;
      img.src = frames[k];
      badge.textContent = `${k + 1} / ${frames.length}`;
      scrub.value = String(k + 1);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const play = () => {
      if (timer || paused || !visible || !ready) return;
      timer = setInterval(() => show(k + 1), 1000 / fps);
    };
    const syncToggle = () => { toggle.textContent = paused ? 'Play' : 'Pause'; };
    toggle.addEventListener('click', () => {
      paused = !paused;
      syncToggle();
      if (paused) stop();
      else play();
    });
    scrub.addEventListener('input', () => {
      paused = true;
      syncToggle();
      stop();
      show(Number(scrub.value) - 1);
      track('teaser-scrub');
    });
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) play();
      else stop();
    }).observe(box);
    syncToggle();
    // Preload the remaining frames well after load so they do not compete with first paint.
    const preload = () => Promise.all(frames.map((src) => {
      const im = new Image();
      im.src = src;
      return im.decode().catch(() => undefined);
    })).then(() => {
      ready = true;
      play();
    });
    const later = () => setTimeout(preload, 1500);
    if (document.readyState === 'complete') later();
    else window.addEventListener('load', later, { once: true });
  }

  /** Load below-the-fold images shortly before they scroll into view.
   *  Native loading="lazy" prefetches them on mobile, which delays the first paint. */
  function initDeferredImages() {
    const imgs = [...document.querySelectorAll('img[data-src]')];
    const load = (img) => {
      if (!img.hasAttribute('data-src')) return;
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    };
    if (!('IntersectionObserver' in window)) {
      imgs.forEach(load);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        load(entry.target);
        io.unobserve(entry.target);
      }
    }, { rootMargin: '300px 0px' });
    imgs.forEach((img) => io.observe(img));
  }

  function initCopy(btn) {
    const pre = document.getElementById(btn.dataset.target);
    if (!pre) return;
    const label = btn.textContent;
    let resetTimer = null;
    const flash = (text) => {
      btn.textContent = text;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { btn.textContent = label; }, 2000);
    };
    const selectAll = () => {
      const range = document.createRange();
      range.selectNodeContents(pre);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    };
    btn.addEventListener('click', async () => {
      try {
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
          throw new Error('Clipboard API unavailable');
        }
        await navigator.clipboard.writeText(pre.textContent.trim());
        flash('Copied');
        track('copy-bibtex');
      } catch (err) {
        selectAll();
        flash('Press Ctrl+C');
      }
    });
    pre.addEventListener('copy', () => track('copy-bibtex'));
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-track]');
    if (link) track(link.dataset.track);
  });

  const results = document.getElementById('results');
  if (results) {
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      track('reach-results');
      io.disconnect();
    }, { threshold: 0.25 });
    io.observe(results);
  }

  initDeferredImages();
  document.querySelectorAll('[data-burst]').forEach(initBurst);
  document.querySelectorAll('[data-compare="teaser"]').forEach((el) => initCompare(el, 'teaser-slide'));
  document.querySelectorAll('[data-viewer]').forEach(initViewer);
  document.querySelectorAll('[data-copy]').forEach(initCopy);
})();

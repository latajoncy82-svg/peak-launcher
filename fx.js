(() => {
  const prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let canvas = null;
  let ctx = null;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let theme = 'dark';
  let rafId = null;
  let isVisible = true;
  let pointerX = 0.5;
  let pointerY = 0.35;

  const stars = [];
  const snow = [];
  const ribbons = [
    { baseY: 0.22, amp: 40, freq: 0.002, speed: 0.25, color: 'rgba(16, 185, 129, 0.17)', offset: 0.3 },
    { baseY: 0.30, amp: 48, freq: 0.0016, speed: -0.2, color: 'rgba(56, 189, 248, 0.18)', offset: 2.0 },
    { baseY: 0.18, amp: 32, freq: 0.0024, speed: 0.16, color: 'rgba(37, 99, 235, 0.14)', offset: 3.8 }
  ];

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function seed() {
    stars.length = 0;
    snow.length = 0;
    for (let i = 0; i < 72; i++) {
      stars.push({
        x: Math.random(),
        y: rand(0.02, 0.65),
        r: rand(0.6, 1.6),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.8, 2.0)
      });
    }
    for (let i = 0; i < 52; i++) {
      const depth = rand(0.35, 1);
      snow.push({
        x: Math.random(),
        y: Math.random(),
        depth,
        r: rand(0.9, 2.1) * depth,
        vy: rand(0.00022, 0.00058) * depth,
        vx: rand(-0.00008, 0.00014) * depth,
        wobble: rand(0, Math.PI * 2),
        alpha: rand(0.18, 0.52) * depth
      });
    }
  }

  function resize() {
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawFrame(nowMs) {
    if (!ctx) return;
    const t = nowMs * 0.001;
    ctx.clearRect(0, 0, width, height);

    if (theme === 'dark') {
      for (const s of stars) {
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        ctx.globalAlpha = twinkle * 0.68;
        ctx.fillStyle = '#e0f2fe';
        ctx.beginPath();
        ctx.arc(s.x * width, s.y * height, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const mx = (pointerX - 0.5) * 28;
      for (const rib of ribbons) {
        const basePx = height * rib.baseY;
        const grad = ctx.createLinearGradient(0, basePx - 90, 0, basePx + 115);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.45, rib.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, basePx + 130);
        for (let x = 0; x <= width + 48; x += 48) {
          const wave =
            Math.sin((x + mx) * rib.freq + t * rib.speed + rib.offset) * rib.amp +
            Math.cos((x - mx) * rib.freq * 1.6 - t * rib.speed * 0.7) * (rib.amp * 0.4);
          ctx.lineTo(x, basePx + wave);
        }
        ctx.lineTo(width + 48, basePx + 135);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    for (const p of snow) {
      if (!prefersReducedMotion) {
        p.y += p.vy;
        p.x += p.vx + Math.sin(t * 0.8 + p.wobble) * 0.0001;
        if (p.y > 1.03) {
          p.y = -0.02;
          p.x = Math.random();
        }
      }
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (!isVisible || document.hidden) {
      rafId = null;
      return;
    }
    drawFrame(now);
    if (!prefersReducedMotion) {
      rafId = requestAnimationFrame(loop);
    }
  }

  function setupSpotlights() {
    let activeCard = null;
    document.addEventListener(
      'pointermove',
      (e) => {
        pointerX = e.clientX / Math.max(1, window.innerWidth);
        pointerY = e.clientY / Math.max(1, window.innerHeight);
        const card = e.target && e.target.closest ? e.target.closest('.spotlight-card') : null;
        if (activeCard && activeCard !== card) {
          activeCard.style.setProperty('--spot-opacity', '0');
        }
        if (card) {
          const rect = card.getBoundingClientRect();
          card.style.setProperty('--mx', `${(e.clientX - rect.left).toFixed(1)}px`);
          card.style.setProperty('--my', `${(e.clientY - rect.top).toFixed(1)}px`);
          card.style.setProperty('--spot-opacity', '1');
        }
        activeCard = card;
      },
      { passive: true }
    );
  }

  window.PeakSiteFX = {
    init(canvasId = 'website-fx-canvas') {
      canvas = document.getElementById(canvasId);
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
      seed();
      resize();
      setupSpotlights();

      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isVisible && !rafId) {
          rafId = requestAnimationFrame(loop);
        }
      });

      if ('IntersectionObserver' in window) {
        const obs = new IntersectionObserver((entries) => {
          isVisible = Boolean(entries[0]?.isIntersecting);
          if (isVisible && !rafId && !document.hidden) {
            rafId = requestAnimationFrame(loop);
          }
        });
        obs.observe(canvas);
      }

      if (prefersReducedMotion) {
        drawFrame(performance.now());
      } else {
        rafId = requestAnimationFrame(loop);
      }
    },
    setTheme(nextTheme) {
      theme = nextTheme === 'light' ? 'light' : 'dark';
      if (prefersReducedMotion) drawFrame(performance.now());
    }
  };
})();

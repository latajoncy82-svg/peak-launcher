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

  const stars = [];
  const snow = [];
  const ribbons = [
    { baseY: 0.22, amp: 32, freq: 0.0018, speed: 0.2, color: 'rgba(16, 185, 129, 0.08)', offset: 0.3 },
    { baseY: 0.28, amp: 38, freq: 0.0015, speed: -0.16, color: 'rgba(56, 189, 248, 0.09)', offset: 2.0 }
  ];

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function seed() {
    stars.length = 0;
    snow.length = 0;
    for (let i = 0; i < 64; i++) {
      stars.push({
        x: Math.random(),
        y: rand(0.02, 0.56),
        r: rand(0.55, 1.45),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.7, 1.8)
      });
    }
    for (let i = 0; i < 48; i++) {
      const depth = rand(0.35, 1);
      snow.push({
        x: Math.random(),
        y: Math.random(),
        depth,
        r: rand(0.85, 2.0) * depth,
        vy: rand(0.00018, 0.00048) * depth,
        vx: rand(-0.00007, 0.00012) * depth,
        wobble: rand(0, Math.PI * 2),
        alpha: rand(0.16, 0.5) * depth
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
        ctx.globalAlpha = twinkle * 0.6;
        ctx.fillStyle = '#e0f2fe';
        ctx.beginPath();
        ctx.arc(s.x * width, s.y * height, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const mx = (pointerX - 0.5) * 24;
      for (const rib of ribbons) {
        const basePx = height * rib.baseY;
        const grad = ctx.createLinearGradient(0, basePx - 80, 0, basePx + 100);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.45, rib.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, basePx + 115);
        for (let x = 0; x <= width + 48; x += 48) {
          const wave =
            Math.sin((x + mx) * rib.freq + t * rib.speed + rib.offset) * rib.amp +
            Math.cos((x - mx) * rib.freq * 1.6 - t * rib.speed * 0.7) * (rib.amp * 0.4);
          ctx.lineTo(x, basePx + wave);
        }
        ctx.lineTo(width + 48, basePx + 125);
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

  window.PeakSiteFX = {
    init(canvasId = 'website-fx-canvas') {
      canvas = document.getElementById(canvasId);
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      seed();
      resize();
      window.addEventListener('resize', resize);
      document.addEventListener(
        'pointermove',
        (e) => {
          pointerX = e.clientX / Math.max(1, window.innerWidth);
        },
        { passive: true }
      );
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isVisible && !rafId) {
          rafId = requestAnimationFrame(loop);
        }
      });
      if ('IntersectionObserver' in window) {
        const obs = new IntersectionObserver((entries) => {
          isVisible = Boolean(entries[0]?.isIntersecting);
          if (isVisible && !rafId && !document.hidden) rafId = requestAnimationFrame(loop);
        });
        obs.observe(canvas);
      }
      if (prefersReducedMotion) drawFrame(performance.now());
      else rafId = requestAnimationFrame(loop);
    },
    setTheme(nextTheme) {
      theme = nextTheme === 'light' ? 'light' : 'dark';
      if (prefersReducedMotion) drawFrame(performance.now());
    }
  };
})();

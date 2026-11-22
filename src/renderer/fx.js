(() => {
  const prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let canvas = null;
  let ctx = null;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let theme = 'alpine-dark';
  let rafId = null;
  let paused = false;
  let pointerX = 0.5;
  let pointerY = 0.35;
  let targetPointerX = 0.5;
  let targetPointerY = 0.35;

  const stars = [];
  const snow = [];
  const ribbons = [
    { baseY: 0.16, amp: 32, freq: 0.0020, speed: 0.22, color: 'rgba(16, 185, 129, 0.09)', offset: 0.4 },
    { baseY: 0.22, amp: 38, freq: 0.0016, speed: -0.18, color: 'rgba(56, 189, 248, 0.10)', offset: 2.1 }
  ];

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function seedParticles() {
    stars.length = 0;
    snow.length = 0;

    for (let i = 0; i < 64; i++) {
      stars.push({
        x: Math.random(),
        y: rand(0.02, 0.52),
        r: rand(0.55, 1.45),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.6, 1.8),
        tint: i % 4 === 0 ? '#bae6fd' : '#ffffff'
      });
    }

    for (let i = 0; i < 48; i++) {
      const depth = rand(0.35, 1);
      snow.push({
        x: Math.random(),
        y: Math.random(),
        depth,
        r: rand(0.85, 2.0) * depth,
        vy: rand(0.00016, 0.00046) * depth,
        vx: rand(-0.00007, 0.00012) * depth,
        wobble: rand(0, Math.PI * 2),
        alpha: rand(0.16, 0.52) * depth
      });
    }
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function drawAurora(timeSec) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const mx = (pointerX - 0.5) * 28;
    const my = (pointerY - 0.5) * 14;

    for (const rib of ribbons) {
      const basePx = height * rib.baseY + my * 0.35;
      const grad = ctx.createLinearGradient(0, basePx - 85, 0, basePx + 105);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(0.48, rib.color);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, basePx + 115);

      const step = 48;
      for (let x = 0; x <= width + step; x += step) {
        const wave =
          Math.sin((x + mx) * rib.freq + timeSec * rib.speed + rib.offset) * rib.amp +
          Math.cos((x - mx) * rib.freq * 1.65 - timeSec * rib.speed * 0.7) * (rib.amp * 0.4);
        ctx.lineTo(x, basePx + wave);
      }

      ctx.lineTo(width + step, basePx + 125);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function renderFrame(nowMs) {
    if (!ctx) return;
    const timeSec = nowMs * 0.001;
    pointerX += (targetPointerX - pointerX) * 0.05;
    pointerY += (targetPointerY - pointerY) * 0.05;

    ctx.clearRect(0, 0, width, height);

    if (theme === 'alpine-dark') {
      for (const s of stars) {
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(timeSec * s.speed + s.phase));
        const px = s.x * width + (pointerX - 0.5) * -8;
        const py = s.y * height + (pointerY - 0.5) * -5;
        ctx.globalAlpha = twinkle * 0.62;
        ctx.fillStyle = s.tint;
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      drawAurora(timeSec);
    }

    for (const p of snow) {
      if (!prefersReducedMotion) {
        p.y += p.vy;
        p.x += p.vx + Math.sin(timeSec * 0.8 + p.wobble) * 0.0001;
        if (p.y > 1.03) {
          p.y = -0.02;
          p.x = Math.random();
        }
        if (p.x > 1.03) p.x = -0.02;
        if (p.x < -0.03) p.x = 1.02;
      }

      const px = p.x * width + (pointerX - 0.5) * (p.depth * 20);
      const py = p.y * height + (pointerY - 0.5) * (p.depth * 10);

      ctx.globalAlpha = theme === 'alpine-dark' ? p.alpha : p.alpha * 0.9;
      ctx.fillStyle = theme === 'alpine-dark' ? '#e0f2fe' : '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (paused) return;
    renderFrame(now);
    if (!prefersReducedMotion) {
      rafId = requestAnimationFrame(loop);
    }
  }

  function setupPointer() {
    let activeCard = null;
    document.addEventListener(
      'pointermove',
      (e) => {
        targetPointerX = Math.max(0, Math.min(1, e.clientX / Math.max(1, window.innerWidth)));
        targetPointerY = Math.max(0, Math.min(1, e.clientY / Math.max(1, window.innerHeight)));

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

  window.PeakFX = {
    init(canvasId = 'alpine-fx-canvas') {
      canvas = document.getElementById(canvasId);
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      seedParticles();
      resize();
      setupPointer();

      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.pause();
        else this.resume();
      });

      this.resume();
    },
    setTheme(nextTheme) {
      theme = nextTheme === 'alpine-light' ? 'alpine-light' : 'alpine-dark';
      if (prefersReducedMotion) {
        renderFrame(performance.now());
      }
    },
    pause() {
      paused = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    resume() {
      if (!canvas) return;
      paused = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (prefersReducedMotion) renderFrame(performance.now());
      else rafId = requestAnimationFrame(loop);
    }
  };
})();

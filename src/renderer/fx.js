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
  let pointerY = 0.3;
  let targetPointerX = 0.5;
  let targetPointerY = 0.3;

  const stars = [];
  const snow = [];
  const ribbons = [
    { baseY: 0.16, amp: 36, freq: 0.0022, speed: 0.28, color: 'rgba(16, 185, 129, 0.16)', offset: 0.4 },
    { baseY: 0.23, amp: 44, freq: 0.0017, speed: -0.21, color: 'rgba(56, 189, 248, 0.17)', offset: 2.1 },
    { baseY: 0.12, amp: 28, freq: 0.0028, speed: 0.16, color: 'rgba(59, 130, 246, 0.14)', offset: 4.0 }
  ];

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function seedParticles() {
    stars.length = 0;
    snow.length = 0;

    for (let i = 0; i < 85; i++) {
      stars.push({
        x: Math.random(),
        y: rand(0.02, 0.56),
        r: rand(0.6, 1.7),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.7, 2.2),
        tint: i % 5 === 0 ? '#bae6fd' : '#ffffff'
      });
    }

    for (let i = 0; i < 64; i++) {
      const depth = rand(0.35, 1);
      snow.push({
        x: Math.random(),
        y: Math.random(),
        depth,
        r: rand(0.9, 2.3) * depth,
        vy: rand(0.00018, 0.00055) * depth,
        vx: rand(-0.00009, 0.00014) * depth,
        wobble: rand(0, Math.PI * 2),
        alpha: rand(0.18, 0.58) * depth
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
    const mx = (pointerX - 0.5) * 34;
    const my = (pointerY - 0.5) * 18;

    for (const rib of ribbons) {
      const basePx = height * rib.baseY + my * 0.4;
      const grad = ctx.createLinearGradient(0, basePx - 95, 0, basePx + 120);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(0.45, rib.color);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, basePx + 130);

      const step = 48;
      for (let x = 0; x <= width + step; x += step) {
        const wave =
          Math.sin((x + mx) * rib.freq + timeSec * rib.speed + rib.offset) * rib.amp +
          Math.cos((x - mx) * rib.freq * 1.7 - timeSec * rib.speed * 0.7) * (rib.amp * 0.42);
        ctx.lineTo(x, basePx + wave);
      }

      ctx.lineTo(width + step, basePx + 145);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDaylightGlow() {
    ctx.save();
    const glow = ctx.createRadialGradient(
      width * 0.82,
      height * 0.14,
      10,
      width * 0.82,
      height * 0.14,
      width * 0.48
    );
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    glow.addColorStop(0.45, 'rgba(56, 189, 248, 0.12)');
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function renderFrame(nowMs) {
    if (!ctx) return;
    const timeSec = nowMs * 0.001;
    pointerX += (targetPointerX - pointerX) * 0.05;
    pointerY += (targetPointerY - pointerY) * 0.05;

    ctx.clearRect(0, 0, width, height);

    if (theme === 'alpine-dark') {
      // Twinkling high-altitude stars
      for (const s of stars) {
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(timeSec * s.speed + s.phase));
        const px = s.x * width + (pointerX - 0.5) * -10;
        const py = s.y * height + (pointerY - 0.5) * -6;
        ctx.globalAlpha = twinkle * 0.72;
        ctx.fillStyle = s.tint;
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      drawAurora(timeSec);
    } else {
      drawDaylightGlow();
    }

    // Floating alpine snow / ice dust
    for (const p of snow) {
      if (!prefersReducedMotion) {
        p.y += p.vy;
        p.x += p.vx + Math.sin(timeSec * 0.8 + p.wobble) * 0.00012;
        if (p.y > 1.03) {
          p.y = -0.02;
          p.x = Math.random();
        }
        if (p.x > 1.03) p.x = -0.02;
        if (p.x < -0.03) p.x = 1.02;
      }

      const px = p.x * width + (pointerX - 0.5) * (p.depth * 22);
      const py = p.y * height + (pointerY - 0.5) * (p.depth * 12);

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

  function setupSpotlights() {
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

    document.addEventListener('pointerleave', () => {
      if (activeCard) {
        activeCard.style.setProperty('--spot-opacity', '0');
        activeCard = null;
      }
    });
  }

  window.PeakFX = {
    init(canvasId = 'alpine-fx-canvas') {
      canvas = document.getElementById(canvasId);
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      seedParticles();
      resize();
      setupSpotlights();

      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.pause();
        } else {
          this.resume();
        }
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
      if (prefersReducedMotion) {
        renderFrame(performance.now());
      } else {
        rafId = requestAnimationFrame(loop);
      }
    }
  };
})();

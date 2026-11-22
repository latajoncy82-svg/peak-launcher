(() => {
  const headCache = new Map();

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      if (!dataUrl) return reject(new Error('No skin URL'));
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load skin image'));
      img.src = dataUrl;
    });
  }

  async function extractHeadDataUrl(skinDataUrl) {
    if (!skinDataUrl) return null;
    if (headCache.has(skinDataUrl)) {
      return headCache.get(skinDataUrl);
    }

    const img = await loadImage(skinDataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const unit = img.width / 64;
    // Base head (8, 8, 8, 8)
    ctx.drawImage(img, 8 * unit, 8 * unit, 8 * unit, 8 * unit, 2, 2, 60, 60);
    // Hat overlay (40, 8, 8, 8)
    ctx.drawImage(img, 40 * unit, 8 * unit, 8 * unit, 8 * unit, 0, 0, 64, 64);

    const outUrl = canvas.toDataURL('image/png');
    if (headCache.size > 60) {
      const firstKey = headCache.keys().next().value;
      headCache.delete(firstKey);
    }
    headCache.set(skinDataUrl, outUrl);
    return outUrl;
  }

  function normalizeSkinToCanvas(img) {
    const w = img.width || 64;
    const h = img.height || 64;
    const isLegacy32 = h * 2 === w;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = isLegacy32 ? w : h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);

    if (isLegacy32) {
      const s = w / 64;
      const copyFlip = (sx, sy, sw, sh, dx, dy) => {
        ctx.save();
        ctx.translate((dx + sw) * s, dy * s);
        ctx.scale(-1, 1);
        ctx.drawImage(img, sx * s, sy * s, sw * s, sh * s, 0, 0, sw * s, sh * s);
        ctx.restore();
      };
      // Copy right leg (0,16,16,16) -> left leg (16,48)
      copyFlip(4, 16, 4, 4, 20, 48);
      copyFlip(8, 16, 4, 4, 24, 48);
      copyFlip(0, 20, 4, 12, 24, 52);
      copyFlip(4, 20, 4, 12, 20, 52);
      copyFlip(8, 20, 4, 12, 16, 52);
      copyFlip(12, 20, 4, 12, 28, 52);
      // Copy right arm (40,16,16,16) -> left arm (32,48)
      copyFlip(44, 16, 4, 4, 36, 48);
      copyFlip(48, 16, 4, 4, 40, 48);
      copyFlip(40, 20, 4, 12, 40, 52);
      copyFlip(44, 20, 4, 12, 36, 52);
      copyFlip(48, 20, 4, 12, 32, 52);
      copyFlip(52, 20, 4, 12, 44, 52);
    }
    return canvas;
  }

  // Minimal 4x4 column-major matrix math
  function mat4Identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  function mat4Multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  function mat4Perspective(fovRad, aspect, near, far) {
    const f = 1.0 / Math.tan(fovRad / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }

  function mat4Translate(tx, ty, tz) {
    const m = mat4Identity();
    m[12] = tx;
    m[13] = ty;
    m[14] = tz;
    return m;
  }

  function mat4RotateX(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const m = mat4Identity();
    m[5] = c;
    m[6] = s;
    m[9] = -s;
    m[10] = c;
    return m;
  }

  function mat4RotateY(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const m = mat4Identity();
    m[0] = c;
    m[2] = -s;
    m[8] = s;
    m[10] = c;
    return m;
  }

  // Build textured box centered at (cx, cy, cz) with size (w, h, d), inflated by `pad` on every side
  // UV origin (ox, oy) in 64x64 pixel coords, box uv dims (uw, uh, ud)
  function buildBoxGeometry({ cx, cy, cz, w, h, d, pad = 0, ox, oy, uw, uh, ud }) {
    const x0 = cx - w / 2 - pad;
    const x1 = cx + w / 2 + pad;
    const y0 = cy - h / 2 - pad;
    const y1 = cy + h / 2 + pad;
    const z0 = cz - d / 2 - pad;
    const z1 = cz + d / 2 + pad;

    const S = 64;
    const uvRect = (px, py, pw, ph) => [
      px / S,
      py / S,
      (px + pw) / S,
      (py + ph) / S
    ];

    const faces = [
      // Front (+Z)
      {
        n: [0, 0, 1],
        verts: [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]],
        uv: uvRect(ox + ud, oy + ud, uw, uh)
      },
      // Back (-Z)
      {
        n: [0, 0, -1],
        verts: [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]],
        uv: uvRect(ox + 2 * ud + uw, oy + ud, uw, uh)
      },
      // Right (-X: viewer left = character's right)
      {
        n: [-1, 0, 0],
        verts: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]],
        uv: uvRect(ox, oy + ud, ud, uh)
      },
      // Left (+X: viewer right = character's left)
      {
        n: [1, 0, 0],
        verts: [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]],
        uv: uvRect(ox + ud + uw, oy + ud, ud, uh)
      },
      // Top (+Y)
      {
        n: [0, 1, 0],
        verts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
        uv: uvRect(ox + ud, oy, uw, ud)
      },
      // Bottom (-Y)
      {
        n: [0, -1, 0],
        verts: [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]],
        uv: uvRect(ox + ud + uw, oy, uw, ud)
      }
    ];

    const data = [];
    for (const f of faces) {
      const [u0, v0, u1, v1] = f.uv;
      const tCoords = [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1]
      ];
      const pushV = (idx) => {
        const p = f.verts[idx];
        const uv = tCoords[idx];
        data.push(p[0], p[1], p[2], f.n[0], f.n[1], f.n[2], uv[0], uv[1]);
      };
      // Tri 1: 0, 3, 2 ; Tri 2: 0, 2, 1
      pushV(0);
      pushV(3);
      pushV(2);
      pushV(0);
      pushV(2);
      pushV(1);
    }
    return new Float32Array(data);
  }

  function createFallback2DViewer(canvas) {
    let curDataUrl = null;
    const render2d = async () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!curDataUrl) return;
      try {
        const headUrl = await extractHeadDataUrl(curDataUrl);
        const img = await loadImage(headUrl);
        ctx.imageSmoothingEnabled = false;
        const size = Math.min(canvas.width, canvas.height) * 0.55;
        ctx.drawImage(img, (canvas.width - size) / 2, (canvas.height - size) / 2, size, size);
      } catch {
        // Ignore
      }
    };
    return {
      setSkin(dataUrl) {
        curDataUrl = dataUrl;
        render2d();
      },
      setOptions() {},
      resetCamera() {},
      resize() {
        const w = canvas.clientWidth || 320;
        const h = canvas.clientHeight || 380;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          render2d();
        }
      },
      destroy() {}
    };
  }

  function createViewer(canvas) {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, preserveDrawingBuffer: true });
    if (!gl) {
      return createFallback2DViewer(canvas);
    }

    const vsSrc = `
      attribute vec3 aPos;
      attribute vec3 aNorm;
      attribute vec2 aUv;
      uniform mat4 uMvp;
      uniform mat4 uModel;
      varying vec3 vNorm;
      varying vec2 vUv;
      void main() {
        vUv = aUv;
        vNorm = mat3(uModel) * aNorm;
        gl_Position = uMvp * vec4(aPos, 1.0);
      }
    `;
    const fsSrc = `
      precision mediump float;
      uniform sampler2D uTex;
      varying vec3 vNorm;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(uTex, vUv);
        if (c.a < 0.08) discard;
        vec3 n = normalize(vNorm);
        vec3 lightDir = normalize(vec3(0.35, 0.72, 0.6));
        float diff = max(dot(n, lightDir), 0.0) * 0.34 + 0.72;
        gl_FragColor = vec4(c.rgb * min(diff, 1.05), c.a);
      }
    `;

    const compileShader = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };

    const prog = gl.createProgram();
    gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const aPos = gl.getAttribLocation(prog, 'aPos');
    const aNorm = gl.getAttribLocation(prog, 'aNorm');
    const aUv = gl.getAttribLocation(prog, 'aUv');
    const uMvp = gl.getUniformLocation(prog, 'uMvp');
    const uModel = gl.getUniformLocation(prog, 'uModel');
    const uTex = gl.getUniformLocation(prog, 'uTex');

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Default placeholder pixel until skin loads
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

    const createPartBuffer = (geo) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, geo, gl.STATIC_DRAW);
      return { buf, count: geo.length / 8 };
    };

    let currentModelType = 'classic';
    let hasTexture = false;
    let parts = null;

    const rebuildParts = (modelType) => {
      if (parts) {
        for (const p of Object.values(parts)) {
          gl.deleteBuffer(p.base.buf);
          if (p.overlay) gl.deleteBuffer(p.overlay.buf);
        }
      }
      const armW = modelType === 'slim' ? 3 : 4;
      const armOffset = modelType === 'slim' ? 5.5 : 6.0;

      // Center character vertically around y = 0 (total height 32: feet -16, crown +16)
      parts = {
        head: {
          pivot: [0, 8, 0],
          base: createPartBuffer(buildBoxGeometry({ cx: 0, cy: 4, cz: 0, w: 8, h: 8, d: 8, ox: 0, oy: 0, uw: 8, uh: 8, ud: 8 })),
          overlay: createPartBuffer(buildBoxGeometry({ cx: 0, cy: 4, cz: 0, w: 8, h: 8, d: 8, pad: 0.45, ox: 32, oy: 0, uw: 8, uh: 8, ud: 8 }))
        },
        torso: {
          pivot: [0, 2, 0],
          base: createPartBuffer(buildBoxGeometry({ cx: 0, cy: 0, cz: 0, w: 8, h: 12, d: 4, ox: 16, oy: 16, uw: 8, uh: 12, ud: 4 })),
          overlay: createPartBuffer(buildBoxGeometry({ cx: 0, cy: 0, cz: 0, w: 8, h: 12, d: 4, pad: 0.28, ox: 16, oy: 32, uw: 8, uh: 12, ud: 4 }))
        },
        rightArm: {
          pivot: [-armOffset, 6, 0],
          base: createPartBuffer(buildBoxGeometry({ cx: 0, cy: -4, cz: 0, w: armW, h: 12, d: 4, ox: 40, oy: 16, uw: armW, uh: 12, ud: 4 })),
          overlay: createPartBuffer(buildBoxGeometry({ cx: 0, cy: -4, cz: 0, w: armW, h: 12, d: 4, pad: 0.26, ox: 40, oy: 32, uw: armW, uh: 12, ud: 4 }))
        },
        leftArm: {
          pivot: [armOffset, 6, 0],
          base: createPartBuffer(buildBoxGeometry({ cx: 0, cy: -4, cz: 0, w: armW, h: 12, d: 4, ox: 32, oy: 48, uw: armW, uh: 12, ud: 4 })),
          overlay: createPartBuffer(buildBoxGeometry({ cx: 0, cy: -4, cz: 0, w: armW, h: 12, d: 4, pad: 0.26, ox: 48, oy: 48, uw: armW, uh: 12, ud: 4 }))
        },
        rightLeg: {
          pivot: [-2, -4, 0],
          base: createPartBuffer(buildBoxGeometry({ cx: 0, cy: -6, cz: 0, w: 4, h: 12, d: 4, ox: 0, oy: 16, uw: 4, uh: 12, ud: 4 })),
          overlay: createPartBuffer(buildBoxGeometry({ cx: 0, cy: -6, cz: 0, w: 4, h: 12, d: 4, pad: 0.26, ox: 0, oy: 32, uw: 4, uh: 12, ud: 4 }))
        },
        leftLeg: {
          pivot: [2, -4, 0],
          base: createPartBuffer(buildBoxGeometry({ cx: 0, cy: -6, cz: 0, w: 4, h: 12, d: 4, ox: 16, oy: 48, uw: 4, uh: 12, ud: 4 })),
          overlay: createPartBuffer(buildBoxGeometry({ cx: 0, cy: -6, cz: 0, w: 4, h: 12, d: 4, pad: 0.26, ox: 0, oy: 48, uw: 4, uh: 12, ud: 4 }))
        }
      };
    };

    rebuildParts(currentModelType);

    let yaw = 0.42;
    let pitch = 0.14;
    let autoRotate = true;
    let walk = true;
    let showOuterLayer = true;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let rafId = null;
    let destroyed = false;
    let walkTime = 0;
    let lastTs = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      const w = Math.round(cw * dpr);
      const h = Math.round(ch * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const drawPart = (partBuf, modelMat, vpMat) => {
      const mvp = mat4Multiply(vpMat, modelMat);
      gl.uniformMatrix4fv(uModel, false, modelMat);
      gl.uniformMatrix4fv(uMvp, false, mvp);
      gl.bindBuffer(gl.ARRAY_BUFFER, partBuf.buf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(aNorm);
      gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(aUv);
      gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 32, 24);
      gl.drawArrays(gl.TRIANGLES, 0, partBuf.count);
    };

    const renderFrame = (now) => {
      if (destroyed) return;
      const dt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      if (hasTexture && canvas.width > 0 && canvas.height > 0) {
        if (autoRotate && !dragging) {
          yaw += dt * 0.62;
        }
        if (walk) {
          walkTime += dt * 4.4;
        }
        const swing = walk ? Math.sin(walkTime) * 0.48 : 0;

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.disable(gl.CULL_FACE);

        const aspect = canvas.width / canvas.height;
        const proj = mat4Perspective((36 * Math.PI) / 180, aspect, 1, 200);
        const view = mat4Multiply(
          mat4Translate(0, 0, -62),
          mat4Multiply(mat4RotateX(pitch), mat4RotateY(yaw))
        );
        const vp = mat4Multiply(proj, view);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(uTex, 0);

        const rotations = {
          head: 0,
          torso: 0,
          rightArm: -swing,
          leftArm: swing,
          rightLeg: swing * 0.85,
          leftLeg: -swing * 0.85
        };

        for (const [key, part] of Object.entries(parts)) {
          const [px, py, pz] = part.pivot;
          const rot = rotations[key] || 0;
          const m = mat4Multiply(mat4Translate(px, py, pz), mat4RotateX(rot));
          drawPart(part.base, m, vp);
          if (showOuterLayer && part.overlay) {
            drawPart(part.overlay, m, vp);
          }
        }
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    const onPointerDown = (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      yaw += dx * 0.012;
      pitch = Math.max(-0.9, Math.min(0.9, pitch + dy * 0.01));
    };
    const onPointerUp = (e) => {
      dragging = false;
      canvas.releasePointerCapture?.(e.pointerId);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    rafId = requestAnimationFrame(renderFrame);

    return {
      async setSkin(dataUrl, model = 'classic') {
        const nextModel = model === 'slim' ? 'slim' : 'classic';
        if (nextModel !== currentModelType) {
          currentModelType = nextModel;
          rebuildParts(currentModelType);
        }
        if (!dataUrl) {
          hasTexture = false;
          return;
        }
        try {
          const img = await loadImage(dataUrl);
          if (destroyed) return;
          const normCanvas = normalizeSkinToCanvas(img);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, normCanvas);
          hasTexture = true;
        } catch {
          hasTexture = false;
        }
      },
      setOptions(opts = {}) {
        if (typeof opts.autoRotate === 'boolean') autoRotate = opts.autoRotate;
        if (typeof opts.walk === 'boolean') walk = opts.walk;
        if (typeof opts.showOuterLayer === 'boolean') showOuterLayer = opts.showOuterLayer;
      },
      resetCamera() {
        yaw = 0.42;
        pitch = 0.14;
      },
      resize,
      destroy() {
        destroyed = true;
        if (rafId) cancelAnimationFrame(rafId);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
      }
    };
  }

  window.PeakSkin3D = {
    extractHeadDataUrl,
    createViewer
  };
})();

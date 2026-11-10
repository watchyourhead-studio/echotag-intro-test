/* Gemeinsamer Ablauf fuer die Werk-Intros: Start-Tipp, Stimme, Untertitel Wort fuer Wort,
   Spuren (Kamera und Effekte) entlang der Sprechzeit, Neigung des Handys, Schlussbild.
   Die Szene selbst (WebGL) liefert jede Seite ueber cfg.scene. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var Q = new URLSearchParams(location.search);

  function ease(x) { return x * x * x * (x * (x * 6 - 15) + 10); }

  /* Spur: [[zeit, wert | [werte...]], ...] -> Wert zur Zeit t, weich zwischen den Punkten */
  function sample(track, t) {
    var n = track.length, a = track[0], b, i;
    if (t <= a[0]) return a[1];
    for (i = 1; i < n; i++) {
      b = track[i];
      if (t < b[0]) {
        var k = ease((t - a[0]) / (b[0] - a[0]));
        if (typeof a[1] === 'number') return a[1] + (b[1] - a[1]) * k;
        return a[1].map(function (v, j) { return v + (b[1][j] - v) * k; });
      }
      a = b;
    }
    return a[1];
  }

  /* --- WebGL-Helfer, von beiden Szenen genutzt --- */
  function program(gl, vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p: p, u: u };
  }
  function loadImage(src) {
    return new Promise(function (ok, no) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = no; im.src = src; });
  }
  function texture(gl, img, mips) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mips) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    return t;
  }
  /* Textur, die erst spaeter gebraucht wird (Raum, Schlussfoto): sofort ein grauer Platzhalter, das Bild laedt nach */
  function lazyTexture(gl, src, mips, after) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([120, 116, 110, 255]));
    after.then(function () { return loadImage(src); }).then(function (img) {
      gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (mips) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
      else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }).catch(function () {});
    return t;
  }
  /* Vollbild-Dreieck */
  var QUAD_VS = '#version 300 es\nout vec2 vP;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vP=p*2.-1.;gl_Position=vec4(vP,0.,1.);}';
  /* Gemeinsame Kamera: Bildhoehe = 1, Zoom 1 zeigt das ganze Werk mit Rand an der Wand */
  var CAM_GLSL =
    'uniform vec2 uRes;uniform vec3 uCam;uniform float uIA;\n' +
    'float viewH(){float sa=uRes.x/uRes.y;return max(.54,.54*uIA/sa)/uCam.z;}\n' +
    'vec2 world(vec2 p){float sa=uRes.x/uRes.y;return vec2(uCam.x*uIA,uCam.y)+vec2(p.x*sa,-p.y)*viewH();}\n';

  function start(cfg) {
    var root = document.documentElement, stage = $('.stage'), canvas = $('#gl');
    var startEl = $('.start'), subsEl = $('.subs'), barFill = $('.bar i'), audio = $('#voice');
    var render = Q.has('render') || Q.has('t');
    if (render) root.classList.add('render');
    var gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) { document.body.classList.add('nogl'); }

    /* --- Untertitel --- */
    var lines = [], curLine = -1, wordEls = [];
    function showLine(i) {
      curLine = i; subsEl.textContent = ''; wordEls = [];
      if (i < 0) { subsEl.classList.remove('on'); return; }
      lines[i].timestamps.forEach(function (w, j) {
        var s = document.createElement('span'); s.textContent = w[0];
        subsEl.appendChild(s); if (j < lines[i].timestamps.length - 1) subsEl.appendChild(document.createTextNode(' '));
        wordEls.push(s);
      });
      subsEl.classList.add('on');
    }
    function updateSubs(t) {
      var i = -1;
      for (var k = 0; k < lines.length; k++) {
        var next = k + 1 < lines.length ? lines[k + 1].start : lines[k].end + 1.2;
        if (t >= lines[k].start - 0.12 && t < Math.min(next - 0.05, lines[k].end + 1.2)) { i = k; break; }
      }
      if (i !== curLine) showLine(i);
      if (i >= 0) lines[i].timestamps.forEach(function (w, j) { wordEls[j].classList.toggle('said', t >= w[1] - 0.04); });
    }

    /* --- Neigung: Handy kippen (oder Maus) verschiebt die Ebenen --- */
    var tilt = { x: 0, y: 0, tx: 0, ty: 0, base: null };
    function onOrient(e) {
      if (e.gamma == null) return;
      if (!tilt.base) tilt.base = { g: e.gamma, b: e.beta };
      tilt.tx = Math.max(-1, Math.min(1, (e.gamma - tilt.base.g) / 22));
      tilt.ty = Math.max(-1, Math.min(1, (e.beta - tilt.base.b) / 22));
      tilt.base.g += (e.gamma - tilt.base.g) * 0.004; tilt.base.b += (e.beta - tilt.base.b) * 0.004; /* Ruhelage wandert langsam mit */
    }
    function askMotion() {
      try {
        if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
          DeviceOrientationEvent.requestPermission().then(function (r) { if (r === 'granted') addEventListener('deviceorientation', onOrient); }).catch(function () {});
        } else addEventListener('deviceorientation', onOrient);
      } catch (e) {}
    }
    addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      tilt.tx = (e.clientX / innerWidth) * 2 - 1; tilt.ty = (e.clientY / innerHeight) * 2 - 1;
    });

    /* --- Zeit: laeuft an der Stimme entlang --- */
    var phase = 'idle', t0 = performance.now(), fixedT = Q.has('t') ? parseFloat(Q.get('t')) : null;
    var aT = 0, aStamp = 0, dur = cfg.duration, endAt = cfg.endAt || 0; /* endAt: ab hier Schlussbild, der Ton darf laenger laufen */
    function voiceTime(now) {
      if (fixedT != null) return fixedT;
      if (phase === 'idle') return 0;
      if (phase === 'ended') return dur + (now - aStamp) / 1000;
      var ct = audio.currentTime;
      if (ct !== aT) { aT = ct; aStamp = now; }
      return audio.paused ? ct : Math.min(dur, ct + (now - aStamp) / 1000);
    }
    window.__seek = function (t) { fixedT = t; frame(performance.now()); };

    /* --- Pixelflaeche des Startbildschirms: lebt leicht, loest sich beim Tippen von der Mitte her auf --- */
    var pix = startEl.querySelector('.pix'), cells = null, pixT0 = 0, pixOpen = 0;
    function pixSetup() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2), W = Math.round(stage.clientWidth * dpr), H = Math.round(stage.clientHeight * dpr);
      if (!pix || (cells && pix.width === W && pix.height === H)) return;
      pix.width = W; pix.height = H;
      var c = Math.max(6, Math.round(W / 30)), nx = Math.ceil(W / c), ny = Math.ceil(H / c), seed = 7;
      function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
      cells = { c: c, nx: nx, ny: ny, a: [] };
      for (var y = 0; y < ny; y++) for (var x = 0; x < nx; x++) {
        var dx = (x + .5) / nx - .5, dy = ((y + .5) / ny - .5) * (H / W), d = Math.min(1, Math.hypot(dx, dy) / .75);
        /* schwarze Pixel wie auf dem Schild, zum Rand hin dichter, die Mitte bleibt frei fuer die Schrift */
        var edge = Math.abs(dx) * 2;
        cells.a.push({ d: d * .72 + rnd() * .28, k: rnd() < Math.pow(Math.max(0, edge - .66) / .34, 1.5) * .6, f: rnd() });
      }
    }
    function pixDraw(now) {
      if (!pix || startEl.classList.contains('gone')) return;
      pixSetup();
      var g = pix.getContext('2d'), c = cells.c, nx = cells.nx, a = cells.a, i, q;
      var open = pixOpen ? Math.min(1, (now - pixOpen) / 1500) : -1, tw = Math.floor((now - pixT0) / 420);
      g.clearRect(0, 0, pix.width, pix.height);
      for (i = 0; i < a.length; i++) {
        q = a[i];
        var x = (i % nx) * c, y = Math.floor(i / nx) * c;
        if (open < 0) { g.fillStyle = (q.k && ((q.f * 97 + tw * q.f * 13) % 7) > 1.2) ? '#0D0B0B' : '#C9E31D'; g.fillRect(x, y, c + 1, c + 1); continue; }
        var k = (open * 1.25 - q.d) / .16;          /* <0 noch da, 0..1 kippt schwarz, >1 weg */
        if (k < 0) { g.fillStyle = q.k ? '#0D0B0B' : '#C9E31D'; g.fillRect(x, y, c + 1, c + 1); }
        else if (k < 1) { g.fillStyle = k < .45 ? '#0D0B0B' : '#C9E31D'; var s2 = c * (1 - k * .75); g.fillRect(x + (c - s2) / 2, y + (c - s2) / 2, s2, s2); }
      }
      if (open >= 1) startEl.classList.add('gone');
    }

    var ready = false, wartet = false, bereit;
    var geladen = new Promise(function (ok) { bereit = ok; });
    function begin() {
      if (phase !== 'idle') return;
      if (!ready) {
        /* noch nicht alles da: Ton jetzt durch die Beruehrung freischalten, Start sobald geladen */
        if (!wartet) { wartet = true; startEl.classList.add('wartet'); askMotion(); var u = audio.play(); if (u && u.then) u.then(function () { if (!ready) audio.pause(); }).catch(function () {}); }
        return;
      }
      if (!startEl.classList.contains('gone')) { startEl.classList.add('open'); pixOpen = performance.now(); }
      phase = 'playing'; askMotion();
      audio.currentTime = 0; aT = 0; aStamp = performance.now();
      var p = audio.play(); if (p && p.catch) p.catch(function () {});
    }
    function toggle() {
      if (phase !== 'playing') return;
      if (audio.paused) { audio.play(); root.classList.remove('paused'); } else { audio.pause(); root.classList.add('paused'); }
    }
    startEl.addEventListener('click', begin);
    stage.addEventListener('click', function (e) { if (e.target.closest('.start,.end,.bar')) return; toggle(); });
    /* Zeitleiste: ziehen oder tippen springt an die Stelle; Bild und Untertitel folgen der Stimme */
    var bar = $('.bar'), dragging = false;
    function seekTo(e) {
      var r = bar.getBoundingClientRect(), k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      var ziel = k * (endAt || dur) * 0.999;
      try { audio.currentTime = ziel; } catch (x) {}
      aT = ziel; aStamp = performance.now(); barFill.style.width = (k * 100) + '%';
    }
    bar.addEventListener('pointerdown', function (e) {
      if (phase === 'idle') return;
      dragging = true; root.classList.add('scrub'); try { bar.setPointerCapture(e.pointerId); } catch (x) {}
      seekTo(e); e.preventDefault();
    });
    bar.addEventListener('pointermove', function (e) { if (dragging) { seekTo(e); e.preventDefault(); } });
    function endDrag() { dragging = false; root.classList.remove('scrub'); }
    bar.addEventListener('pointerup', endDrag); bar.addEventListener('pointercancel', endDrag);
    audio.addEventListener('ended', function () { if (phase !== 'playing') return; phase = 'ended'; aStamp = performance.now(); });
    audio.addEventListener('loadedmetadata', function () { if (isFinite(audio.duration)) dur = audio.duration; });
    document.addEventListener('visibilitychange', function () { if (document.hidden && phase === 'playing' && !audio.paused) toggle(); });
    /* Absender: Visitenkarte zum Speichern, wenn Kontaktdaten hinterlegt sind (marke/kontakt.js) */
    var K = window.WYH, kBtn = $('.wyh-k');
    if (kBtn && K && K.name) {
      var v = ['BEGIN:VCARD', 'VERSION:3.0', 'N:' + K.name.split(' ').reverse().join(';'), 'FN:' + K.name];
      if (K.firma) v.push('ORG:' + K.firma); if (K.rolle) v.push('TITLE:' + K.rolle);
      if (K.telefon) v.push('TEL;TYPE=CELL:' + K.telefon); if (K.email) v.push('EMAIL:' + K.email); if (K.web) v.push('URL:' + K.web);
      v.push('END:VCARD');
      kBtn.href = 'data:text/vcard;charset=utf-8,' + encodeURIComponent(v.join('\r\n'));
      kBtn.setAttribute('download', 'watchyourhead.vcf'); kBtn.hidden = false;
    }
    var rep = $('.end .again');
    if (rep) rep.addEventListener('click', function () {
      audio.pause(); root.classList.remove('ended', 'paused'); phase = 'idle'; begin();
    });

    /* --- Bild --- */
    var scene = null, last = performance.now();
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.round(stage.clientWidth * dpr), h = Math.round(stage.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    function frame(now) {
      if (!scene) return;
      resize();
      var t = voiceTime(now), dt = Math.min(0.05, (now - last) / 1000); last = now;
      var k = 1 - Math.pow(0.002, dt);
      tilt.x += (tilt.tx - tilt.x) * k; tilt.y += (tilt.ty - tilt.y) * k;
      var s = {};
      for (var name in cfg.tracks) s[name] = sample(cfg.tracks[name], t);
      scene.draw({ t: t, clock: fixedT != null ? fixedT + 3 : (now - t0) / 1000, tilt: tilt, s: s, w: canvas.width, h: canvas.height, idle: phase === 'idle' && fixedT == null });
      var fin = endAt || dur + 0.2, on = phase !== 'idle' || (fixedT != null && t > 0);
      root.classList.toggle('ended', on && t >= fin); root.classList.toggle('playing', on && t < fin);
      if (on) { updateSubs(Math.min(t, dur)); barFill.style.width = Math.min(100, t / fin * 100) + '%'; }
    }
    function loop(now) { frame(now); pixDraw(now); if (fixedT == null) requestAnimationFrame(loop); }

    Promise.all([
      fetch(cfg.subs).then(function (r) { return r.json(); }),
      gl ? cfg.scene(gl, { program: program, texture: texture, lazyTexture: function (g, src, m) { return lazyTexture(g, src, m, geladen); }, loadImage: loadImage, QUAD_VS: QUAD_VS, CAM_GLSL: CAM_GLSL }) : null
    ]).then(function (r) {
      lines = r[0]; scene = r[1]; pixT0 = performance.now(); if (!render) pixDraw(pixT0);
      startEl.classList.remove('loading'); ready = true; bereit();
      window.__ready = true;
      if (wartet) { audio.pause(); begin(); }
      requestAnimationFrame(loop);
    }).catch(function (e) { console.error(e); startEl.classList.remove('loading'); });
  }

  window.Echo = { start: start };
})();

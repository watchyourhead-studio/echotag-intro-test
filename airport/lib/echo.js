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
    var aT = 0, aStamp = 0, dur = cfg.duration;
    function voiceTime(now) {
      if (fixedT != null) return fixedT;
      if (phase === 'idle') return 0;
      if (phase === 'ended') return dur + (now - aStamp) / 1000;
      var ct = audio.currentTime;
      if (ct !== aT) { aT = ct; aStamp = now; }
      return audio.paused ? ct : Math.min(dur, ct + (now - aStamp) / 1000);
    }
    window.__seek = function (t) { fixedT = t; if (t > 0 && phase === 'idle') { phase = 'playing'; root.classList.add('playing'); } frame(performance.now()); };

    function begin() {
      if (phase !== 'idle') return;
      phase = 'playing'; root.classList.add('playing'); askMotion();
      audio.currentTime = 0; aT = 0; aStamp = performance.now();
      var p = audio.play(); if (p && p.catch) p.catch(function () {});
    }
    function toggle() {
      if (phase !== 'playing') return;
      if (audio.paused) { audio.play(); root.classList.remove('paused'); } else { audio.pause(); root.classList.add('paused'); }
    }
    startEl.addEventListener('click', begin);
    stage.addEventListener('click', function (e) { if (e.target.closest('.start,.end')) return; toggle(); });
    audio.addEventListener('ended', function () { phase = 'ended'; aStamp = performance.now(); root.classList.remove('playing'); root.classList.add('ended'); });
    audio.addEventListener('loadedmetadata', function () { if (isFinite(audio.duration)) dur = audio.duration; });
    document.addEventListener('visibilitychange', function () { if (document.hidden && phase === 'playing' && !audio.paused) toggle(); });
    var rep = $('.end .again');
    if (rep) rep.addEventListener('click', function () {
      root.classList.remove('ended'); phase = 'idle'; begin();
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
      if (fixedT != null) { root.classList.toggle('ended', t >= dur + 0.2); root.classList.toggle('playing', t > 0 && t < dur + 0.2); }
      if (phase !== 'idle') { updateSubs(Math.min(t, dur)); barFill.style.width = Math.min(100, t / dur * 100) + '%'; }
    }
    function loop(now) { frame(now); if (fixedT == null) requestAnimationFrame(loop); }

    Promise.all([
      fetch(cfg.subs).then(function (r) { return r.json(); }),
      gl ? cfg.scene(gl, { program: program, texture: texture, loadImage: loadImage, QUAD_VS: QUAD_VS, CAM_GLSL: CAM_GLSL }) : null,
      document.fonts && document.fonts.ready
    ]).then(function (r) {
      lines = r[0]; scene = r[1];
      startEl.classList.remove('loading');
      window.__ready = true;
      requestAnimationFrame(loop);
    }).catch(function (e) { console.error(e); startEl.classList.remove('loading'); });
  }

  window.Echo = { start: start };
})();

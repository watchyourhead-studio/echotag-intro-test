/* EchoTag Day & Night (v7)
 * Tag-Motiv -> Tippen -> Himmel dunkelt von oben ab -> Lichter gehen einzeln an
 * (Cafe, Fenster, dann Lichterkette und Baumlichter, die danach funkeln) -> Player.
 * Alles live im WebGL-Shader aus drei deckungsgleichen Bildern + Lichterkarte. */
(function () {
  'use strict';

  var T = {
    darkMs: 5200,      // Abdunkeln Tag -> Nacht
    lightAt: 3900,     // erste Lichter, noch waehrend es dunkel wird
    lightMs: 5600,     // bis alle Lichter brennen
    snowAt: 2000,
    cardAt: 10200,     // Player kommt, wenn die Szene lebt
    voiceAt: 11400
  };

  var qs = new URLSearchParams(location.search);
  var recipient = (qs.get('name') || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  document.getElementById('gName').textContent = recipient || 'Dich';

  var stage = document.getElementById('stage');
  var still = document.getElementById('still');
  var canvas = document.getElementById('gl');
  var snowCanvas = document.getElementById('snow');
  var greeting = document.getElementById('greeting');
  var taplayer = document.getElementById('taplayer');
  var dayNight = document.getElementById('dayNight');
  var card = document.getElementById('card');
  var cardWrap = document.getElementById('cardWrap');
  var voice = document.getElementById('voice');
  var playBtn = document.getElementById('playBtn');
  var iconPlay = document.getElementById('iconPlay');
  var iconPause = document.getElementById('iconPause');
  var track = document.getElementById('track');
  var fill = document.getElementById('fill');
  var tCur = document.getElementById('tCur');
  var replayBtn = document.getElementById('replayBtn');

  // Animierte Groessen: dark 0..1 (Tag -> Nacht), light 0..1 (Lichter an)
  var state = { dark: 0, light: 0, snow: 0 };
  var tweens = [];
  var timers = [];
  var phase = 'day';

  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function tween(key, to, ms, delay) {
    tweens = tweens.filter(function (tw) { return tw.key !== key; });
    tweens.push({ key: key, from: null, to: to, ms: ms, start: performance.now() + (delay || 0) });
  }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearLater() { timers.forEach(clearTimeout); timers = []; }

  // ---------- WebGL ----------
  var gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false });
  var prog, uni = {}, texReady = 0;

  var VS = 'attribute vec2 p; varying vec2 v; void main(){ v = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }';
  var FS = [
    'precision mediump float;',
    'varying vec2 v;',
    'uniform sampler2D tDay, tDark, tNight, tMap;',
    'uniform float uDark, uLight, uTime;',
    'uniform vec2 uScale;',
    'void main(){',
    '  vec2 uv = (v - .5) * uScale + .5; uv.y = 1. - uv.y;',
    '  vec3 day = texture2D(tDay, uv).rgb;',
    '  vec3 dark = texture2D(tDark, uv).rgb;',
    '  vec3 night = texture2D(tNight, uv).rgb;',
    '  vec3 m = texture2D(tMap, uv).rgb;',
    // Der Himmel dunkelt von oben nach unten ab, die Strasse folgt
    '  float d = clamp(uDark * 1.3 - uv.y * .3, 0., 1.);',
    '  d = d * d * (3. - 2. * d);',
    '  vec3 base = mix(day, dark, d);',
    // Lichtanteil nur dort, wo Nacht waermer/heller ist als Dunkel
    '  vec3 delta = night - dark;',
    '  float lift = dot(delta, vec3(.3, .59, .11)) + delta.r * .5;',
    '  float mask = smoothstep(.015, .09, lift);',
    '  float on = smoothstep(m.r, m.r + .05, uLight);',
    // Kurzes Flackern beim Einschalten, wie eine echte Gluehbirne
    '  float sw = clamp((uLight - m.r) / .05, 0., 1.);',
    '  float fl = sw > 0. && sw < 1. ? step(.35, fract(sin(m.b * 91.7 + uTime * 23.) * 4375.5)) : 1.;',
    // Lichterkette und Baumlichter funkeln danach ganz leise
    '  float tw = 1. - m.g * .45 * (.5 + .5 * sin(uTime * (1.6 + m.b * 1.8) + m.b * 6.2832));',
    '  gl_FragColor = vec4(base + delta * mask * on * fl * tw, 1.);',
    '}'
  ].join('\n');

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function texture(unit, src, done) {
    var img = new Image();
    img.onload = function () {
      var t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, unit === 3 ? gl.NEAREST : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      done();
    };
    img.src = src;
  }

  function initGL() {
    if (!gl) return false;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      gl.useProgram(prog);
    } catch (e) { return false; }
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['tDay', 'tDark', 'tNight', 'tMap', 'uDark', 'uLight', 'uTime', 'uScale'].forEach(function (n) {
      uni[n] = gl.getUniformLocation(prog, n);
    });
    gl.uniform1i(uni.tDay, 0); gl.uniform1i(uni.tDark, 1); gl.uniform1i(uni.tNight, 2); gl.uniform1i(uni.tMap, 3);
    var onTex = function () { texReady++; };
    texture(0, 'tag.jpg', onTex);
    texture(1, 'dunkel.jpg', onTex);
    texture(2, 'nacht.jpg', onTex);
    texture(3, 'lichter.png', onTex);
    return true;
  }
  var hasGL = initGL();

  // ---------- Schnee (leise, wenige Flocken, zwei Tiefen) ----------
  var sctx = snowCanvas.getContext('2d');
  var flakes = [];
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = stage.clientWidth, h = stage.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    snowCanvas.width = canvas.width; snowCanvas.height = canvas.height;
    if (hasGL) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      // object-fit: cover fuer ein 9:16-Bild
      var a = (w / h) / (1080 / 1920);
      gl.uniform2f(uni.uScale, a < 1 ? a : 1, a < 1 ? 1 : 1 / a);
    }
    flakes = [];
    var n = Math.round(w * h / 5200);
    for (var i = 0; i < n; i++) flakes.push(newFlake(true));
  }
  function newFlake(anywhere) {
    var near = Math.random() < .25;
    return {
      x: Math.random() * snowCanvas.width,
      y: anywhere ? Math.random() * snowCanvas.height : -10,
      r: (near ? 1.6 + Math.random() * 1.4 : .7 + Math.random() * .9) * Math.min(window.devicePixelRatio || 1, 2),
      vy: near ? .55 + Math.random() * .35 : .22 + Math.random() * .25,
      sway: Math.random() * 6.28, a: near ? .85 : .55
    };
  }
  function drawSnow(dt) {
    sctx.clearRect(0, 0, snowCanvas.width, snowCanvas.height);
    if (state.snow <= 0.001) return;
    sctx.fillStyle = '#fff';
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.y += f.vy * dt * .06 * Math.min(window.devicePixelRatio || 1, 2);
      f.sway += dt * .0012;
      if (f.y > snowCanvas.height + 10) flakes[i] = f = newFlake(false);
      sctx.globalAlpha = f.a * state.snow;
      sctx.beginPath();
      sctx.arc(f.x + Math.sin(f.sway) * 6, f.y, f.r, 0, 6.2832);
      sctx.fill();
    }
    sctx.globalAlpha = 1;
  }

  // ---------- Renderloop ----------
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(now - last, 50); last = now;
    tweens = tweens.filter(function (tw) {
      if (now < tw.start) return true;
      if (tw.from === null) tw.from = state[tw.key];
      var p = Math.min(1, (now - tw.start) / tw.ms);
      state[tw.key] = tw.from + (tw.to - tw.from) * ease(p);
      return p < 1;
    });
    if (hasGL && texReady === 4) {
      gl.uniform1f(uni.uDark, state.dark);
      gl.uniform1f(uni.uLight, state.light);
      gl.uniform1f(uni.uTime, now / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    drawSnow(dt);
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  // Ohne WebGL: einfache Ueberblendung auf das Nachtbild
  function fallbackNight(on, ms) {
    still.style.transition = 'opacity ' + ms + 'ms ease';
    if (!still.nextNight) {
      var n = document.createElement('img');
      n.src = 'nacht.jpg'; n.className = 'still'; n.style.opacity = 0; n.style.zIndex = 1;
      stage.insertBefore(n, canvas); still.nextNight = n;
    }
    still.nextNight.style.transition = 'opacity ' + ms + 'ms ease';
    still.nextNight.style.opacity = on ? 1 : 0;
  }

  // ---------- Ablauf ----------
  function toNight(fast) {
    var k = fast ? .55 : 1;
    phase = 'night';
    greeting.classList.add('is-night');
    stage.classList.remove('is-day');
    if (!hasGL) { fallbackNight(true, 3000 * k); return; }
    tween('dark', 1, T.darkMs * k);
    tween('light', 1.08, T.lightMs * k, (T.lightAt - (fast ? 900 : 0)) * k);
    tween('snow', 1, 2500, T.snowAt * k);
  }
  function toDay() {
    phase = 'day';
    greeting.classList.remove('is-night');
    stage.classList.add('is-day');
    if (!hasGL) { fallbackNight(false, 1800); return; }
    tween('light', 0, 700);
    tween('dark', 0, 2200, 350);
  }

  function unlockVoice() {
    // Im selben Tap entsperren (iOS), ohne hoerbar zu werden
    try {
      voice.muted = true;
      var p = voice.play();
      if (p && p.then) p.then(function () { voice.pause(); voice.currentTime = 0; voice.muted = false; }, function () { voice.muted = false; });
    } catch (e) { voice.muted = false; }
  }

  function open() {
    if (phase !== 'day' || !taplayer || taplayer.classList.contains('is-hidden')) return;
    taplayer.classList.add('is-hidden');
    unlockVoice();
    toNight(false);
    later(function () {
      cardWrap.setAttribute('aria-hidden', 'false');
      card.classList.add('is-in');
      dayNight.hidden = false;
      dayNight.classList.add('is-visible');
    }, T.cardAt);
    later(function () { voice.currentTime = 0; voice.play().catch(function () {}); }, T.voiceAt);
  }

  function replay() {
    clearLater();
    voice.pause(); voice.currentTime = 0;
    card.classList.remove('is-in');
    cardWrap.setAttribute('aria-hidden', 'true');
    dayNight.classList.remove('is-visible', 'is-day');
    tween('snow', 0, 900);
    toDay();
    later(function () { taplayer.classList.remove('is-hidden'); }, 2400);
  }

  taplayer.addEventListener('click', open);
  taplayer.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') open(); });
  replayBtn.addEventListener('click', replay);
  dayNight.addEventListener('click', function () {
    if (phase === 'night') { toDay(); dayNight.classList.add('is-day'); }
    else { toNight(true); dayNight.classList.remove('is-day'); }
  });

  // ---------- Player ----------
  function fmt(t) {
    if (!isFinite(t) || t < 0) return '0:00';
    return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  }
  playBtn.addEventListener('click', function () {
    if (voice.paused) voice.play().catch(function () {}); else voice.pause();
  });
  voice.addEventListener('play', function () {
    iconPlay.style.display = 'none'; iconPause.style.display = '';
    playBtn.classList.add('is-playing'); playBtn.setAttribute('aria-label', 'Pause');
  });
  voice.addEventListener('pause', function () {
    iconPlay.style.display = ''; iconPause.style.display = 'none';
    playBtn.classList.remove('is-playing'); playBtn.setAttribute('aria-label', 'Abspielen');
  });
  voice.addEventListener('ended', function () { voice.currentTime = 0; });
  voice.addEventListener('loadedmetadata', function () {
    track.setAttribute('aria-valuemax', String(Math.round(voice.duration)));
  });
  voice.addEventListener('timeupdate', function () {
    tCur.textContent = fmt(voice.currentTime);
    track.setAttribute('aria-valuenow', String(Math.round(voice.currentTime)));
    if (voice.duration > 0) fill.style.width = Math.min(100, voice.currentTime / voice.duration * 100) + '%';
  });
  function seek(e) {
    if (!voice.duration) return;
    var r = track.getBoundingClientRect();
    voice.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * voice.duration;
  }
  var seeking = false;
  track.addEventListener('pointerdown', function (e) { seeking = true; seek(e); try { track.setPointerCapture(e.pointerId); } catch (err) {} });
  track.addEventListener('pointermove', function (e) { if (seeking) seek(e); });
  track.addEventListener('pointerup', function () { seeking = false; });

  // Debug fuer Tests: ?t=night springt direkt in die fertige Nacht
  if (qs.get('t') === 'night') { state.dark = 1; state.light = 1.08; state.snow = 1; phase = 'night'; greeting.classList.add('is-night'); taplayer.classList.add('is-hidden'); }
})();

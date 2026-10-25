/* EchoTag Day & Night (v7)
 * Tag-Motiv -> Tippen -> Himmel dunkelt von oben ab -> Lichter gehen einzeln an
 * (Cafe, Fenster, dann Lichterkette und Baumlichter, die danach funkeln) ->
 * der Eiffelturm glitzert -> Player. Alles live im WebGL-Shader aus drei
 * deckungsgleichen Bildern + Lichterkarte; Musik und Effekte per Web Audio. */
(function () {
  'use strict';

  var CONFIG = {
    giftUrl: ''        // Ziel fuer "Selbst eine EchoTag-Karte verschenken" (leer = Platzhalter)
  };

  var T = {
    darkMs: 3000,      // Abdunkeln Tag -> Nacht
    lightAt: 1900,     // erste Lichter, noch waehrend es dunkel wird
    lightMs: 4000,     // bis alle Lichter brennen
    snowAt: 900,
    sparkleAt: 6100,   // Eiffelturm glitzert, wenn alle Lichter brennen
    sparkleMs: 6000,   // so lang wie der Glitzer-Sound
    sparkleEvery: 60000,
    cardAt: 7000,      // Player kommt, wenn die Szene lebt
    voiceAt: 8200
  };

  var VOL = { music: .45, musicDucked: .16, atmo: .8, atmoDucked: .4, klick: .5, kette: .45, turm: .4 };

  var qs = new URLSearchParams(location.search);
  var recipient = (qs.get('name') || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  document.getElementById('gName').textContent = recipient || 'Dich';

  var stage = document.getElementById('stage');
  var still = document.getElementById('still');
  var canvas = document.getElementById('gl');
  var fxCanvas = document.getElementById('fx');
  var greeting = document.getElementById('greeting');
  var taplayer = document.getElementById('taplayer');
  var dayNight = document.getElementById('dayNight');
  var soundBtn = document.getElementById('soundBtn');
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
  var giftLink = document.getElementById('giftLink');
  giftLink.href = CONFIG.giftUrl || '#';

  // Animierte Groessen: dark 0..1 (Tag -> Nacht), light 0..1 (Lichter an)
  var state = { dark: 0, light: 0, snow: 0, sparkle: 0 };
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
  // Zeitpunkt, an dem ein ge-easter Verlauf 0 -> 'to' den Wert 'level' erreicht
  function easeTime(level, ms, to) {
    var lo = 0, hi = 1, x = Math.min(1, level / to);
    for (var i = 0; i < 20; i++) { var mid = (lo + hi) / 2; if (ease(mid) < x) lo = mid; else hi = mid; }
    return lo * ms;
  }

  // ---------- WebGL ----------
  var gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false });
  var prog, uni = {}, texReady = 0;

  var VS = 'attribute vec2 p; varying vec2 v; void main(){ v = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }';
  var FS = [
    // highp, wo vorhanden: die Zufalls-Hashes zerfallen sonst auf Handy-GPUs
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec2 v;',
    'uniform sampler2D tDay, tDark, tNight, tMap;',
    'uniform float uDark, uLight, uTime;',
    'uniform vec2 uScale;',
    'float hash(float n){ return fract(sin(n) * 43758.5453); }',
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
    // Lichterkette und Baumlichter leben: jedes Licht atmet leise in eigenem
    // Takt, dimmt ab und zu einzeln ab und flackert minimal
    '  float sd = m.b * 255.;',
    '  float br = .5 + .5 * sin(uTime * (.6 + hash(sd) * 1.2) + sd);',
    '  float s = uTime * (.5 + hash(sd + 1.) * .5) + hash(sd + 2.) * 10.;',
    '  float ev = step(.72, hash(floor(s) * 13.1 + sd * 7.3));',
    '  float env = sin(3.14159 * fract(s)); env *= env;',
    '  float dim = ev * env * (.5 + .4 * hash(floor(s) + sd));',
    '  float jit = .05 * sin(uTime * 17. + sd * 3.) * sin(uTime * 11.3 + sd);',
    '  float tw = clamp(1. - m.g * (.2 * br + dim + jit), 0., 1.);',
    // Bewohnte Fenster: ab und zu geht eines fuer ein paar Sekunden aus,
    // als waere jemand im Zimmer unterwegs (nicht das Cafe)
    '  float isWin = (1. - step(.01, m.g)) * step(.03, m.r);',
    '  float s2 = uTime / (8. + hash(sd + 5.) * 7.) + hash(sd + 6.);',
    '  float f2 = fract(s2);',
    '  float off = step(.86, hash(floor(s2) * 7.7 + sd * 3.1)) * smoothstep(.3, .34, f2) * (1. - smoothstep(.72, .76, f2));',
    '  float life = 1. - isWin * off * smoothstep(1., 1.07, uLight);',
    '  gl_FragColor = vec4(base + delta * mask * on * fl * tw * life, 1.);',
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

  // ---------- Effekt-Ebene: Schnee + Eiffelturm-Glitzern ----------
  var fx = fxCanvas.getContext('2d');
  var flakes = [], sparks = [], towerPts = [];
  var view = { w: 1, h: 1, sx: 1, sy: 1, dpr: 1 };
  fetch('turm.json').then(function (r) { return r.json(); }).then(function (p) { towerPts = p; }).catch(function () {});

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = stage.clientWidth, h = stage.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    fxCanvas.width = canvas.width; fxCanvas.height = canvas.height;
    // object-fit: cover fuer ein 9:16-Bild
    var a = (w / h) / (1080 / 1920);
    view = { w: canvas.width, h: canvas.height, sx: a < 1 ? a : 1, sy: a < 1 ? 1 : 1 / a, dpr: dpr };
    if (hasGL) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uni.uScale, view.sx, view.sy);
    }
    flakes = [];
    var n = Math.round(w * h / 5200);
    for (var i = 0; i < n; i++) flakes.push(newFlake(true));
  }
  function newFlake(anywhere) {
    var near = Math.random() < .25;
    return {
      x: Math.random() * fxCanvas.width,
      y: anywhere ? Math.random() * fxCanvas.height : -10,
      r: (near ? 1.6 + Math.random() * 1.4 : .7 + Math.random() * .9) * view.dpr,
      vy: near ? .55 + Math.random() * .35 : .22 + Math.random() * .25,
      sway: Math.random() * 6.28, a: near ? .85 : .55
    };
  }
  function drawSnow(dt) {
    if (state.snow <= 0.001) return;
    fx.fillStyle = '#fff';
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.y += f.vy * dt * .06 * view.dpr;
      f.sway += dt * .0012;
      if (f.y > fxCanvas.height + 10) flakes[i] = f = newFlake(false);
      fx.globalAlpha = f.a * state.snow;
      fx.beginPath();
      fx.arc(f.x + Math.sin(f.sway) * 6, f.y, f.r, 0, 6.2832);
      fx.fill();
    }
    fx.globalAlpha = 1;
  }
  // Wie das echte stuendliche Funkeln: viele kurze weissgoldene Blitze auf dem Turm
  function drawSparkle(dt) {
    if (state.sparkle > 0.01 && towerPts.length) {
      var n = state.sparkle * dt * .22;
      while (n > 0) {
        if (Math.random() < n) {
          var p = towerPts[(Math.random() * towerPts.length) | 0];
          sparks.push({
            x: ((p[0] - .5) / view.sx + .5) * view.w,
            y: ((p[1] - .5) / view.sy + .5) * view.h,
            life: 0, max: 90 + Math.random() * 170, r: (.7 + Math.random() * .9) * view.dpr
          });
        }
        n -= 1;
      }
    }
    if (!sparks.length) return;
    fx.globalCompositeOperation = 'lighter';
    sparks = sparks.filter(function (s) {
      s.life += dt;
      var k = Math.sin(Math.PI * Math.min(1, s.life / s.max));
      var g = fx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
      g.addColorStop(0, 'rgba(255,252,240,' + k + ')');
      g.addColorStop(.18, 'rgba(255,236,190,' + (.7 * k) + ')');
      g.addColorStop(.45, 'rgba(255,210,140,' + (.18 * k) + ')');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      fx.fillStyle = g;
      fx.fillRect(s.x - s.r * 4, s.y - s.r * 4, s.r * 8, s.r * 8);
      return s.life < s.max;
    });
    fx.globalCompositeOperation = 'source-over';
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
    fx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    drawSparkle(dt);
    drawSnow(dt);
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  // ---------- Ton: Musik, Winteratmosphaere, Effekte (Web Audio) ----------
  var AC = window.AudioContext || window.webkitAudioContext;
  var actx = AC ? new AC() : null;
  var bus = {}, buffers = {}, loops = {};
  var muted = false;
  var wantAmbience = false;   // getippt, aber Musik evtl. noch nicht fertig geladen
  // iOS 17+: Web Audio auch bei Lautlos-Schalter hoerbar, wie die Sprachnachricht
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  if (actx) {
    bus.master = actx.createGain(); bus.master.connect(actx.destination);
    ['music', 'atmo', 'sfx'].forEach(function (k) { bus[k] = actx.createGain(); bus[k].gain.value = 0; bus[k].connect(bus.master); });
    bus.sfx.gain.value = 1;
    ['musik', 'atmo', 'klick', 'kette', 'turm'].forEach(function (n) {
      fetch('audio/' + n + '.mp3').then(function (r) { return r.arrayBuffer(); }).then(function (data) {
        // Safari kennt nur die Callback-Form
        actx.decodeAudioData(data, function (b) {
          buffers[n] = b;
          // Wer schneller getippt hat, als die Musik geladen war, bekommt sie jetzt
          if (wantAmbience && (n === 'musik' || n === 'atmo') && !loops[n]) startAmbience();
        }, function () {});
      }).catch(function () {});
    });
  }
  function ramp(node, to, sec) {
    if (!actx) return;
    var t = actx.currentTime;
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(node.gain.value, t);
    node.gain.linearRampToValueAtTime(to, t + sec);
  }
  function sfx(name, vol, delayMs, rate) {
    if (!actx || !buffers[name]) return;
    var src = actx.createBufferSource(), g = actx.createGain();
    src.buffer = buffers[name];
    src.playbackRate.value = rate || 1;
    g.gain.value = vol;
    src.connect(g); g.connect(bus.sfx);
    src.start(actx.currentTime + (delayMs || 0) / 1000);
  }
  function startLoop(name, busName) {
    if (!actx || !buffers[name]) return;
    stopLoop(name);
    var src = actx.createBufferSource();
    src.buffer = buffers[name]; src.loop = true;
    src.connect(bus[busName]); src.start();
    loops[name] = src;
  }
  function stopLoop(name) {
    if (loops[name]) { try { loops[name].stop(); } catch (e) {} delete loops[name]; }
  }
  function voiceOn() { return !voice.paused && !voice.ended; }
  function startAmbience() {
    wantAmbience = true;
    if (!loops.musik) startLoop('musik', 'music');
    if (!loops.atmo) startLoop('atmo', 'atmo');
    ramp(bus.music, voiceOn() ? VOL.musicDucked : VOL.music, 6);
    ramp(bus.atmo, voiceOn() ? VOL.atmoDucked : VOL.atmo, 4);
  }
  function duck(on) {
    if (!actx || !loops.musik) return;
    ramp(bus.music, on ? VOL.musicDucked : VOL.music, on ? .8 : 2.5);
    ramp(bus.atmo, on ? VOL.atmoDucked : VOL.atmo, on ? .8 : 2.5);
  }
  // Klicks und Glitzern passend zu den Lichtern im Shader
  function lightSounds(delay, ms) {
    var at = function (level) { return delay + easeTime(level, ms, 1.08); };
    sfx('klick', VOL.klick, at(.03), 1);
    sfx('klick', VOL.klick * .6, at(.18), 1.08);
    sfx('klick', VOL.klick * .5, at(.31), .94);
    sfx('klick', VOL.klick * .45, at(.46), 1.04);
    sfx('kette', VOL.kette, at(.56));
  }

  soundBtn.addEventListener('click', function () {
    muted = !muted;
    soundBtn.classList.toggle('is-muted', muted);
    soundBtn.setAttribute('aria-label', muted ? 'Musik an' : 'Musik aus');
    if (bus.master) ramp(bus.master, muted ? 0 : 1, .4);
  });
  document.addEventListener('visibilitychange', function () {
    if (!actx) return;
    if (document.hidden) { actx.suspend(); voice.pause(); } else if (phase !== 'day' || loops.musik) actx.resume();
  });

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
  var sparkleTimer = null;
  function sparkle(delay) {
    later(function () {
      if (phase !== 'night') return;
      tween('sparkle', 1, 600);
      sfx('turm', voiceOn() ? VOL.turm * .45 : VOL.turm);
      later(function () { tween('sparkle', 0, 1400); }, T.sparkleMs - 1400);
    }, delay);
  }
  function sparkleLoop() {
    clearInterval(sparkleTimer);
    sparkleTimer = setInterval(function () { sparkle(0); }, T.sparkleEvery);
  }

  function toNight(fast) {
    var k = fast ? .55 : 1;
    phase = 'night';
    greeting.classList.add('is-night');
    stage.classList.remove('is-day');
    if (!hasGL) { fallbackNight(true, 3000 * k); return; }
    var lightDelay = (T.lightAt - (fast ? 900 : 0)) * k;
    tween('dark', 1, T.darkMs * k);
    tween('light', 1.08, T.lightMs * k, lightDelay);
    tween('snow', 1, 2500, T.snowAt * k);
    lightSounds(lightDelay, T.lightMs * k);
    sparkle(fast ? lightDelay + T.lightMs * k + 300 : T.sparkleAt);
    sparkleLoop();
  }
  function toDay() {
    phase = 'day';
    greeting.classList.remove('is-night');
    stage.classList.add('is-day');
    clearInterval(sparkleTimer);
    tween('sparkle', 0, 400);
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
    if (phase !== 'day' || taplayer.classList.contains('is-hidden')) return;
    taplayer.classList.add('is-hidden');
    unlockVoice();
    if (actx) { actx.resume(); startAmbience(); }
    soundBtn.hidden = false;
    soundBtn.classList.add('is-visible');
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
    giftLink.classList.remove('is-in', 'is-shown');
    cardWrap.setAttribute('aria-hidden', 'true');
    dayNight.classList.remove('is-visible', 'is-day');
    soundBtn.classList.remove('is-visible');
    wantAmbience = false;
    if (actx) { ramp(bus.music, 0, 2); ramp(bus.atmo, 0, 2); later(function () { stopLoop('musik'); stopLoop('atmo'); }, 2100); }
    tween('snow', 0, 900);
    toDay();
    stage.classList.remove('is-day');
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
  // Fortschritt als Aquarellstrich hinter einem Schnittfenster, das mit der
  // Wiedergabe breiter wird. Kein Strichmuster: Safari zeichnete dort an
  // beiden Enden kleine Linienkappen, auch bei 0.
  var fillRect = document.getElementById('fillRect');
  function setFill(pct) {
    pct = Math.max(0, Math.min(100, pct));
    fillRect.setAttribute('width', String(pct * 2.1));
    fill.style.visibility = pct > .5 ? 'visible' : 'hidden';
  }
  playBtn.addEventListener('click', function () {
    if (voice.paused) voice.play().catch(function () {}); else voice.pause();
  });
  voice.addEventListener('play', function () {
    if (voice.muted) return;   // stiller Entsperr-Start
    iconPlay.style.display = 'none'; iconPause.style.display = '';
    playBtn.classList.add('is-playing'); playBtn.setAttribute('aria-label', 'Pause');
    duck(true);
  });
  voice.addEventListener('pause', function () {
    iconPlay.style.display = ''; iconPause.style.display = 'none';
    playBtn.classList.remove('is-playing'); playBtn.setAttribute('aria-label', 'Abspielen');
    duck(false);
  });
  voice.addEventListener('ended', function () {
    voice.currentTime = 0;
    duck(false);
    // Nach der Nachricht: dezent einladen, selbst eine Karte zu verschenken
    giftLink.classList.add('is-shown');
    requestAnimationFrame(function () { requestAnimationFrame(function () { giftLink.classList.add('is-in'); }); });
  });
  voice.addEventListener('loadedmetadata', function () {
    track.setAttribute('aria-valuemax', String(Math.round(voice.duration)));
  });
  voice.addEventListener('timeupdate', function () {
    tCur.textContent = fmt(voice.currentTime);
    track.setAttribute('aria-valuenow', String(Math.round(voice.currentTime)));
    if (voice.duration > 0) setFill(voice.currentTime / voice.duration * 100);
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

  // Debug fuer Tests: ?t=night springt direkt in die fertige Nacht, ?t=end zeigt zusaetzlich Player und Verschenken
  if (qs.get('t') === 'night' || qs.get('t') === 'end') {
    state.dark = 1; state.light = 1.08; state.snow = 1; phase = 'night';
    greeting.classList.add('is-night'); taplayer.classList.add('is-hidden');
    sparkle(800); sparkleLoop();
    if (qs.get('t') === 'end') {
      card.classList.add('is-in'); giftLink.classList.add('is-shown', 'is-in');
      dayNight.hidden = false; dayNight.classList.add('is-visible');
      soundBtn.hidden = false; soundBtn.classList.add('is-visible');
      setFill(38);
    }
  }
})();

/* EchoTag Day & Night (v7b, mit Zeichnen-Intro)
 * Umschlag (zwei Papiertueren mit Siegel) -> Tippen -> die Tueren schwingen auf, dahinter steht der Name, die Feder zieht schon jede Tuschelinie entlang
 * ihres Strichs -> Aquarell blueht ein -> Himmel dunkelt von oben ab -> Lichter gehen einzeln an
 * (Cafe, Fenster, dann Lichterkette und Baumlichter, die danach funkeln) ->
 * der Eiffelturm glitzert -> Player. Alles live im WebGL-Shader aus drei
 * deckungsgleichen Bildern + Lichterkarte; Musik und Effekte per Web Audio. */
(function () {
  'use strict';

  var CONFIG = {
    giftUrl: ''        // Ziel fuer "Selbst eine EchoTag-Karte verschenken" (leer = Platzhalter)
  };

  var T = {
    drawAt: 1100,      // die Feder setzt an, wenn der Name frei ist und die Tueren noch aufgehen
    drawMs: 4000,      // bis alle Linien gezogen sind
    paintAt: 3850,     // Aquarell laeuft ein, waehrend die letzten Linien entstehen
    paintMs: 2400,
    nightAt: 5450,     // ab hier wie v7, Zeiten unten relativ dazu
    darkMs: 3000,      // Abdunkeln Tag -> Nacht
    lightAt: 1500,     // erste Lichter, noch waehrend es dunkel wird
    lightMs: 4000,     // bis alle Lichter brennen
    snowAt: 400,
    sparkleAt: 5700,   // Eiffelturm glitzert, wenn alle Lichter brennen
    sparkleMs: 6000,   // so lang wie der Glitzer-Sound
    sparkleEvery: 60000,
    cardAt: 12050,     // Player kommt, wenn die Szene lebt (ab Tippen)
    voiceAt: 13250
  };

  var VOL = { music: .45, musicDucked: .16, atmo: .45, atmoDucked: .22, klick: .5, kette: .45, turm: .4, papier: .8 };

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
  // ---------- Umschlag: zwei Papiertueren schwingen zur Kamera auf ----------
  // Die Tueren haengen an den Bildraendern; ab etwa 90 Grad sind sie aus dem Bild.
  var intro = document.getElementById('intro');
  var introShade = document.getElementById('introShade');
  var doors = ['doorL', 'doorR'].map(function (id, i) {
    var el = document.getElementById(id);
    return { el: el, dim: el.querySelector('.dim'), dir: i ? 1 : -1 };
  });
  var seal = document.getElementById('seal');
  var DOOR = { deg: 100, crack: [.07, .1], crackMs: 240, openMs: 2300, closeMs: 1700, lag: 160 };   // die rechte Tuer liegt oben und geht zuerst
  // Dickes Papier liegt nie ganz flach: in Ruhe stehen die Tueren an der Naht etwas hoch
  var REST = [.03, .05], TEASE = [.09, .13];
  var doorRaf = 0, doorBusy = false, doorAt = [0, 0];
  function fitIntro() { intro.style.perspective = Math.round(stage.clientWidth * 1.7) + 'px'; }
  fitIntro();
  window.addEventListener('resize', fitIntro);
  function easeDoor(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function setDoor(d, p) {
    var deg = DOOR.deg * p, rad = deg * Math.PI / 180;
    d.el.style.transform = 'rotateY(' + (d.dir * deg).toFixed(2) + 'deg)';
    // Licht von vorn: je steiler die Tuer steht, desto dunkler ihre Flaeche
    var dim = Math.sin(rad) * .38 + (1 - Math.cos(rad)) * .2;
    d.dim.style.opacity = dim.toFixed(3);
    d.el.style.setProperty('--edge', Math.min(1, Math.sin(rad) * 3).toFixed(3));
    if (d.dir > 0) seal.style.setProperty('--lit', (1 - dim * .7).toFixed(3));
  }
  function setDoors(pl, pr) {
    doorAt = [pl, pr];
    setDoor(doors[0], pl); setDoor(doors[1], pr);
    // Die rechte Kante wirft ihren Schatten auf die linke Tuer: je hoeher sie steht, desto breiter
    // und weicher; schwingt sie weit auf, verschwindet er
    var zr = stage.clientWidth / 2 * Math.sin(DOOR.deg * pr * Math.PI / 180);
    doors[0].el.style.setProperty('--seamW', (6 + zr * .9).toFixed(1) + 'px');
    doors[0].el.style.setProperty('--seam', ((.75 + Math.min(.5, zr * .03)) * Math.max(0, 1 - Math.max(0, pr - .12) * 5)).toFixed(3));
    // Schatten der Tuerkanten auf dem Papier: wo die Kante im Bild steht (mit Perspektive),
    // dunkel direkt daneben, weicher und heller, je hoeher die Tuer steht
    var w = stage.clientWidth, P = w * 1.7, half = w / 2;
    var edge = function (p) {
      var rad = DOOR.deg * p * Math.PI / 180, x = half * Math.cos(rad), z = half * Math.sin(rad);
      return half - (half - x) * P / (P - z);   // Abstand der Kante vom eigenen Bildrand
    };
    var xl = edge(pl), xr = w - edge(pr), p = Math.min(pl, pr);
    var a = .5 * Math.pow(1 - Math.min(1, p * 1.15), 1.3), spread = 14 + 150 * p;
    var c = 'rgba(58, 34, 22, ';
    introShade.style.background = 'linear-gradient(90deg, ' + c + a.toFixed(3) + ') ' + xl.toFixed(1) + 'px, ' + c + '0) ' + (xl + spread).toFixed(1) + 'px, ' +
      c + '0) ' + (xr - spread).toFixed(1) + 'px, ' + c + a.toFixed(3) + ') ' + xr.toFixed(1) + 'px)';
  }
  // Beide Tueren vom jetzigen Stand nach 'to'; beim Oeffnen fuehrt die rechte, beim Schliessen die linke
  function swingDoors(to, ms, lag, done) {
    cancelAnimationFrame(doorRaf);
    doorBusy = true;
    if (typeof to === 'number') to = [to, to];
    var from = doorAt.slice(), opening = to[1] > from[1], t0 = performance.now();
    var lags = opening ? [lag, 0] : [0, lag];
    (function step(now) {
      var k = function (i) { var t = Math.min(1, Math.max(0, (now - t0 - lags[i]) / ms)); return from[i] + (to[i] - from[i]) * easeDoor(t); };
      setDoors(k(0), k(1));
      if (now - t0 < ms + lag) doorRaf = requestAnimationFrame(step);
      else { doorBusy = false; if (done) done(); }
    })(t0);
  }
  setDoors(REST[0], REST[1]);
  function playIntro() {
    intro.style.visibility = '';
    stage.classList.add('is-opened');
    var hide = function () { cancelAnimationFrame(doorRaf); doorBusy = false; setDoors(1, 1); intro.style.visibility = 'hidden'; };
    // Erst loest sich das Papier einen Spalt, dann schwingen die Tueren auf
    swingDoors(DOOR.crack, DOOR.crackMs, 40, function () { swingDoors(1, DOOR.openMs, DOOR.lag, hide); });
    sfx('papier', VOL.papier, DOOR.crackMs);
    // Notbremse, falls der Browser keine Animationsbilder liefert
    later(hide, DOOR.crackMs + DOOR.openMs + DOOR.lag + 500);
  }
  function resetIntro() {
    intro.style.visibility = '';
    swingDoors(REST, DOOR.closeMs, DOOR.lag, function () { stage.classList.remove('is-opened'); });
  }
  // Im Ruhezustand heben sich die Tueren ab und zu ein wenig: "ich gehe auf" - das erste Mal gleich nach dem Laden
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var teaseAt = 0;
  function tease() {
    if (calm || !load.open || doorBusy || phase !== 'day' || taplayer.classList.contains('is-hidden') || stage.classList.contains('is-pressed')) return;
    teaseAt = performance.now();
    swingDoors(TEASE, 620, 110, function () { setTimeout(function () { if (!doorBusy && !stage.classList.contains('is-opened') && !stage.classList.contains('is-pressed')) swingDoors(REST, 900, 110); }, 140); });
  }
  setInterval(function () { if (performance.now() - teaseAt > 4300) tease(); }, 300);
  // Druckgefuehl: das Siegel gibt nach und drueckt beide Tueren flach, auf Android ein kurzer Impuls
  function press(on) {
    if (!load.open || stage.classList.contains('is-opened') || on === stage.classList.contains('is-pressed')) return;
    stage.classList.toggle('is-pressed', on);
    if (on) { teaseAt = performance.now(); swingDoors([0, 0], 110, 0); if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} } }
    else swingDoors(REST, 260, 0);
  }
  taplayer.addEventListener('pointerdown', function () { press(true); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { taplayer.addEventListener(ev, function () { setTimeout(function () { press(false); }, 90); }); });

  giftLink.href = CONFIG.giftUrl || '#';

  // Animierte Groessen: draw/paint 0..1 (Zeichnen, Malen), dark 0..1 (Tag -> Nacht), light 0..1 (Lichter an)
  var state = { draw: 0, paint: 0, dark: 0, light: 0, snow: 0, sparkle: 0 };
  var tweens = [];
  var timers = [];
  var phase = 'day';

  function easeOut(t) { return 1 - Math.pow(1 - t, 2.2); }
  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function tween(key, to, ms, delay, fn) {
    tweens = tweens.filter(function (tw) { return tw.key !== key; });
    tweens.push({ key: key, from: null, to: to, ms: ms, start: performance.now() + (delay || 0), fn: fn || ease });
  }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearLater() { timers.forEach(clearTimeout); timers = []; }

  // ---------- Laden: Knopf erst, wenn Bilder und Musik bereit sind ----------
  var load = { total: 0, done: 0, shown: 0, armed: false, ready: false, open: false };
  var startCues = document.querySelector('.start-cues');
  var loadRect = document.getElementById('loadRect');
  function trackLoad(weight) {
    var once = false;
    load.total += weight;
    return function () { if (once) return; once = true; load.done += weight; checkReady(); };
  }
  function checkReady() {
    if (!load.ready && load.armed && load.done >= load.total - 1e-6) setReady();
  }
  function setReady() {
    load.ready = true;
    // War alles sofort da, wurde die Linie nie gezeigt: Knopf gleich freigeben
    if (performance.now() < 350) load.shown = 1;
    // Falls die Animation gedrosselt laeuft (Energiesparmodus), trotzdem freigeben
    setTimeout(function () { if (!load.open) { load.shown = 1; drawLoad(16); } }, 900);
  }
  function drawLoad(dt) {
    if (load.open) return;
    var target = load.ready ? 1 : (load.total ? load.done / load.total : 0);
    load.shown += (target - load.shown) * Math.min(1, dt * (load.ready ? .012 : .006)) + (load.ready ? dt * .0004 : 0);
    load.shown = Math.min(1, load.shown);
    loadRect.setAttribute('width', String(load.shown * 165));
    // Knopf erst, wenn die Linie sichtbar am Ende angekommen ist
    if (load.ready && load.shown >= .995) {
      load.open = true;
      stage.classList.add('is-ready');   // Siegel erscheint
      teaseAt = performance.now() - 3300;  // erstes Anheben kurz danach
      if (load.wantOpen) { open(); return; }
      startCues.classList.add('is-ready');
    }
  }
  // Notbremse bei sehr langsamem Netz: nach 15 s trotzdem oeffnen lassen
  setTimeout(function () { if (!load.ready) setReady(); }, 15000);
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
    'uniform sampler2D tDay, tDark, tNight, tMap, tInk, tPaper, tDraw;',
    'uniform float uDraw, uPaint, uDark, uLight, uTime;',
    'uniform vec2 uScale;',
    'float hash(float n){ return fract(sin(n) * 43758.5453); }',
    'void main(){',
    '  vec2 uv = (v - .5) * uScale + .5; uv.y = 1. - uv.y;',
    '  vec3 day = texture2D(tDay, uv).rgb;',
    '  vec3 dark = texture2D(tDark, uv).rgb;',
    '  vec3 night = texture2D(tNight, uv).rgb;',
    '  vec3 m = texture2D(tMap, uv).rgb;',
    // Zeichnen: jede Linie waechst entlang ihres Strichs; an der Federspitze
    // ist die Tinte kurz dunkler, wie frisch und nass
    '  vec3 paper = texture2D(tPaper, uv).rgb;',
    '  vec3 ink = texture2D(tInk, uv).rgb;',
    '  vec2 dm = texture2D(tDraw, uv).rg;',
    '  float ia = clamp((.843 - dot(ink, vec3(.3, .59, .11))) / .47, 0., 1.);',
    '  float drawn = smoothstep(dm.r, dm.r + .012, uDraw) * step(dm.r, .99);',
    '  float wet = drawn * (1. - smoothstep(dm.r + .012, dm.r + .07, uDraw));',
    '  vec3 sketch = mix(paper, ink * (1. - .35 * wet), ia * drawn);',
    // Malen: das Aquarell blueht mit weichem, nassem Rand in die Flaechen
    '  float painted = smoothstep(dm.g, dm.g + .1, uPaint * 1.1);',
    '  vec3 dayCol = mix(sketch, day, painted);',
    // Der Himmel dunkelt von oben nach unten ab, die Strasse folgt
    '  float d = clamp(uDark * 1.3 - uv.y * .3, 0., 1.);',
    '  d = d * d * (3. - 2. * d);',
    '  vec3 base = mix(dayCol, dark, d);',
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
    var tick = trackLoad(1);
    img.onerror = tick;
    img.onload = function () {
      var t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, unit === 3 || unit === 6 ? gl.NEAREST : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      done();
      tick();
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
    ['tDay', 'tDark', 'tNight', 'tMap', 'tInk', 'tPaper', 'tDraw', 'uDraw', 'uPaint', 'uDark', 'uLight', 'uTime', 'uScale'].forEach(function (n) {
      uni[n] = gl.getUniformLocation(prog, n);
    });
    gl.uniform1i(uni.tDay, 0); gl.uniform1i(uni.tDark, 1); gl.uniform1i(uni.tNight, 2); gl.uniform1i(uni.tMap, 3);
    gl.uniform1i(uni.tInk, 4); gl.uniform1i(uni.tPaper, 5); gl.uniform1i(uni.tDraw, 6);
    var onTex = function () { texReady++; };
    texture(0, 'tag.jpg', onTex);
    texture(1, 'dunkel.jpg', onTex);
    texture(2, 'nacht.jpg', onTex);
    texture(3, 'lichter.png', onTex);
    texture(4, 'tusche.jpg', onTex);
    texture(5, 'papier.jpg', onTex);
    texture(6, 'zeichnen.png', onTex);
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
    snowCanvas.width = canvas.width; snowCanvas.height = canvas.height;
    css = { w: w, h: h, dpr: dpr };
    pile.geomAt = 0;
    flakes = [];
    var n = Math.round(w * h / 4200);
    for (var i = 0; i < n; i++) flakes.push(newFlake(true));
  }
  // ---------- Schnee: faellt vor allem, sammelt sich auf dem Player ----------
  // Rechnet in CSS-Pixeln. Flocken, die die Oberkante des Players treffen, bleiben
  // liegen; die Haube haelt einen natuerlichen Boeschungswinkel, und was ueber die
  // Ecken quillt, rutscht in kleinen Klumpen seitlich ab.
  var snowCanvas = document.getElementById('snow');
  var sc = snowCanvas.getContext('2d');
  var css = { w: 1, h: 1, dpr: 1 };
  var SIN_TILT = Math.sin(.6 * Math.PI / 180);     // Player liegt mit rotate(-.6deg)
  var BIN = 2, REPOSE = .6, EDGE_HOLD = 3, MAX_H = 16;
  var pile = { h: null, n: 0, fl: 0, fr: 0, top: 0, right: 0, on: false, spillL: 0, spillR: 0, geomAt: 0 };
  var chunks = [];

  function newFlake(anywhere) {
    var near = Math.random() < .25;
    return {
      x: Math.random() * css.w,
      y: anywhere ? Math.random() * css.h : -6,
      r: near ? 1.3 + Math.random() * 1.2 : .6 + Math.random() * .7,
      vy: near ? .033 + Math.random() * .02 : .014 + Math.random() * .015,
      sway: Math.random() * 6.28, a: near ? .85 : .55
    };
  }
  function cardGeometry(now) {
    if (now - pile.geomAt < 250) return;
    pile.geomAt = now;
    var visible = card.classList.contains('is-in') && parseFloat(getComputedStyle(card).opacity) > .95;
    if (!visible) { pile.on = false; return; }
    var r = card.getBoundingClientRect(), s = stage.getBoundingClientRect();
    var left = r.left - s.left, right = r.right - s.left;
    pile.top = r.top - s.top;
    pile.right = right;
    pile.fl = left + 13;                       // flacher Teil zwischen den runden Ecken
    pile.fr = right - 13;
    var n = Math.max(4, Math.round((pile.fr - pile.fl) / BIN));
    if (!pile.h || pile.n !== n) { pile.h = new Float32Array(n); pile.n = n; }
    pile.on = true;
  }
  function edgeY(x) { return pile.top + (pile.right - x) * SIN_TILT + 1.2; }
  function deposit(x, area, sigma) {
    var c = (x - pile.fl) / BIN, s2 = 2 * sigma * sigma / (BIN * BIN), sum = 0, i, w = [];
    for (i = 0; i < pile.n; i++) { w[i] = Math.exp(-(i - c) * (i - c) / s2); sum += w[i]; }
    for (i = 0; i < pile.n; i++) pile.h[i] = Math.min(MAX_H, pile.h[i] + area / BIN * w[i] / sum);
  }
  function spawnChunk(side, area) {
    var x = side < 0 ? pile.fl - 4 : pile.fr + 4;
    var k = Math.max(1, Math.round(area / 7));
    for (var j = 0; j < k; j++) {
      chunks.push({
        x: x + side * Math.random() * 3, y: edgeY(x) - 3 - Math.random() * 3,
        vx: side * (.012 + Math.random() * .03), vy: -.01 + Math.random() * .02,
        r: 1.1 + Math.random() * 1.6
      });
    }
  }
  function settlePile(dt) {
    var h = pile.h, n = pile.n, i, d, m;
    // Boeschungswinkel: zu steile Stufen rieseln zum Nachbarn
    for (var pass = 0; pass < 2; pass++) {
      for (i = 0; i < n - 1; i++) {
        d = h[i] - h[i + 1];
        if (d > REPOSE) { m = (d - REPOSE) * .25; h[i] -= m; h[i + 1] += m; }
        else if (d < -REPOSE) { m = (-d - REPOSE) * .25; h[i] += m; h[i + 1] -= m; }
      }
    }
    // Neuschnee setzt sich: weich ausgleichen, damit eine kissenartige Haube entsteht
    var k = Math.min(.06, dt * .0012), prev = h[0];
    for (i = 1; i < n - 1; i++) { var cur = h[i]; h[i] += k * (prev + h[i + 1] - 2 * cur); prev = cur; }
    // An den runden Ecken haelt nur wenig Schnee; der Rest quillt ueber und rutscht ab
    if (h[0] > EDGE_HOLD) { m = (h[0] - EDGE_HOLD) * .2; h[0] -= m; pile.spillL += m * BIN; }
    if (h[n - 1] > EDGE_HOLD) { m = (h[n - 1] - EDGE_HOLD) * .2; h[n - 1] -= m; pile.spillR += m * BIN; }
    if (pile.spillL > 9) { spawnChunk(-1, pile.spillL); pile.spillL = 0; }
    if (pile.spillR > 9) { spawnChunk(1, pile.spillR); pile.spillR = 0; }
    // Wird die Haube zu schwer, gleitet ab und zu ein Stueck an einer Seite ab
    var avg = 0; for (i = 0; i < n; i++) avg += h[i]; avg /= n;
    if (avg > 8 && Math.random() < dt * .00025) {
      var side = Math.random() < .5 ? -1 : 1, span = Math.round(n * (.12 + Math.random() * .12)), lost = 0;
      for (var j = 0; j < span; j++) {
        i = side < 0 ? j : n - 1 - j;
        m = h[i] * (.55 - j / span * .4); h[i] -= m; lost += m * BIN;
      }
      spawnChunk(side, lost);
    }
  }
  function drawPile() {
    var h = pile.h, n = pile.n, i, x, y, top = Infinity;
    for (i = 0; i < n; i++) if (h[i] > .15) { top = Math.min(top, edgeY(pile.fl + i * BIN) - h[i]); }
    if (top === Infinity) return;
    sc.beginPath();
    sc.moveTo(pile.fl - 3, edgeY(pile.fl - 3));
    var px = pile.fl, py = edgeY(px) - h[0];
    sc.lineTo(px, py);
    for (i = 1; i < n; i++) {
      x = pile.fl + i * BIN; y = edgeY(x) - h[i];
      sc.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
      px = x; py = y;
    }
    sc.lineTo(px, py);
    sc.lineTo(pile.fr + 3, edgeY(pile.fr + 3));
    // Unterkante: der Schnee haengt ueber die Kante des Players, aber nur so weit,
    // wie dort schon Schnee liegt - sonst erscheint am Anfang ein Streifen auf einmal
    var lip = function (k) { return Math.min(2.2, h[k] * 1.6); };
    sc.lineTo(pile.fr + 3, edgeY(pile.fr + 3) + lip(n - 1));
    for (i = n - 1; i >= 0; i--) { x = pile.fl + i * BIN; sc.lineTo(x, edgeY(x) + lip(i)); }
    sc.lineTo(pile.fl - 3, edgeY(pile.fl - 3) + lip(0));
    sc.closePath();
    var g = sc.createLinearGradient(0, top, 0, edgeY(pile.fl) + 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.55, '#f4f7fc'); g.addColorStop(1, '#d9e1ee');
    sc.save();
    sc.shadowColor = 'rgba(10, 18, 45, .28)'; sc.shadowBlur = 4; sc.shadowOffsetY = 1.5;
    sc.fillStyle = g; sc.fill();
    sc.restore();
  }
  function drawChunks(dt) {
    chunks = chunks.filter(function (c) {
      c.vy += .0009 * dt; c.x += c.vx * dt; c.y += c.vy * dt;
      sc.beginPath(); sc.arc(c.x, c.y, c.r, 0, 6.2832); sc.fill();
      return c.y < css.h + 10;
    });
  }
  function drawSnow(dt, now) {
    sc.setTransform(css.dpr, 0, 0, css.dpr, 0, 0);
    sc.clearRect(0, 0, css.w, css.h);
    cardGeometry(now);
    if (pile.on) {
      settlePile(dt);
      // feiner Schneegriesel zwischen den sichtbaren Flocken laesst die Haube stetig wachsen
      if (Math.random() < dt * .014) deposit(pile.fl + Math.random() * (pile.fr - pile.fl), 2.4, 6);
      drawPile();
    }
    sc.fillStyle = '#fff';
    drawChunks(dt);
    if (state.snow <= 0.001) return;
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i], y0 = f.y;
      f.y += f.vy * dt;
      f.sway += dt * .0012;
      var fx0 = f.x + Math.sin(f.sway) * 6;
      if (pile.on && fx0 >= pile.fl && fx0 <= pile.fr) {
        var bi = Math.min(pile.n - 1, Math.max(0, Math.floor((fx0 - pile.fl) / BIN)));
        var surf = edgeY(fx0) - pile.h[bi];
        if (f.y >= surf && y0 < surf + 3) {
          deposit(fx0, f.r * f.r * 8, 5 + f.r * 2);   // Flocke bleibt liegen
          flakes[i] = newFlake(false);
          continue;
        }
      }
      if (f.y > css.h + 10) flakes[i] = f = newFlake(false);
      sc.globalAlpha = f.a * state.snow;
      sc.beginPath();
      sc.arc(fx0, f.y, f.r, 0, 6.2832);
      sc.fill();
    }
    sc.globalAlpha = 1;
  }
  function clearPile() { if (pile.h) pile.h.fill(0); chunks = []; pile.spillL = pile.spillR = 0; }
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
      state[tw.key] = tw.from + (tw.to - tw.from) * tw.fn(p);
      return p < 1;
    });
    if (hasGL && texReady === 7) {
      gl.uniform1f(uni.uDraw, state.draw);
      gl.uniform1f(uni.uPaint, state.paint);
      gl.uniform1f(uni.uDark, state.dark);
      gl.uniform1f(uni.uLight, state.light);
      gl.uniform1f(uni.uTime, now / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    fx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    drawSparkle(dt);
    drawSnow(dt, now);
    drawLoad(dt);
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
    ['musik', 'atmo', 'klick', 'kette', 'turm', 'papier'].forEach(function (n) {
      var tick = trackLoad(n === 'musik' ? 4 : n === 'atmo' ? .6 : .2);
      fetch('audio/' + n + '.mp3').then(function (r) { return r.arrayBuffer(); }).then(function (data) {
        // Safari kennt nur die Callback-Form
        actx.decodeAudioData(data, function (b) {
          buffers[n] = b;
          // Wer schneller getippt hat, als die Musik geladen war, bekommt sie jetzt
          if (wantAmbience && (n === 'musik' || n === 'atmo') && !loops[n]) startAmbience();
          tick();
        }, tick);
      }).catch(tick);
    });
  }
  // Das Tuerpapier muss da sein, bevor jemand den Umschlag sieht
  (function () {
    var tick = trackLoad(.5), img = new Image();
    img.onload = img.onerror = tick;
    img.src = 'tuer.jpg';
  })();
  load.armed = true;
  checkReady();
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
    // Musik: Intro (11 s) laeuft einmal, danach loopt der Mittelteil nahtlos -
    // dessen Ende blendet in den eigenen Anfang ueber, auch bei langen Nachrichten
    if (name === 'musik') { src.loopStart = 11; src.loopEnd = buffers[name].duration; }
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

  function toNight(fast, delay) {
    var k = fast ? .55 : 1, D = delay || 0;
    phase = 'night';
    later(function () { greeting.classList.add('is-night'); stage.classList.remove('is-day'); }, D);
    if (!hasGL) { later(function () { fallbackNight(true, 3000 * k); }, D); return; }
    var lightDelay = D + (T.lightAt - (fast ? 900 : 0)) * k;
    tween('dark', 1, T.darkMs * k, D, easeOut);
    tween('light', 1.08, T.lightMs * k, lightDelay);
    tween('snow', 1, 2500, D + T.snowAt * k);
    lightSounds(lightDelay, T.lightMs * k);
    sparkle(fast ? lightDelay + T.lightMs * k + 300 : D + T.sparkleAt);
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
    // Im selben Tap fuer iOS freischalten: stumm anspielen und sofort wieder anhalten.
    // Stumm bleibt sie, bis playVoice() sie wirklich startet - so ist Helene nie zu frueh zu hoeren.
    try {
      voice.muted = true;
      var p = voice.play();
      if (p && p.catch) p.catch(function () {});
      voice.pause();
    } catch (e) {}
  }
  function playVoice() {
    voice.muted = false;
    var p = voice.play();
    if (p && p.catch) p.catch(function () {});
  }

  function open() {
    if (phase !== 'day' || taplayer.classList.contains('is-hidden')) return;
    if (!load.open) {
      // Frueh getippt: Ton jetzt im Tap freischalten (iOS), Karte startet von selbst, sobald alles geladen ist
      if (!load.wantOpen) { load.wantOpen = true; unlockVoice(); if (actx) actx.resume(); }
      return;
    }
    taplayer.classList.add('is-hidden');
    stage.classList.remove('is-pressed');
    unlockVoice();
    if (actx) { actx.resume(); startAmbience(); }
    soundBtn.hidden = false;
    soundBtn.classList.add('is-visible');
    // Die Tueren schwingen auf, dahinter setzt die Feder schon an
    playIntro();
    // Erst zeichnet die Feder, dann laeuft das Aquarell ein, dann wird es Nacht
    tween('draw', 1, T.drawMs, T.drawAt);
    tween('paint', 1, T.paintMs, T.paintAt);
    if (!hasGL) { still.style.transition = 'opacity 2s ease'; still.src = 'tag.jpg'; }
    toNight(false, T.nightAt);
    later(function () {
      cardWrap.setAttribute('aria-hidden', 'false');
      card.classList.add('is-in');
      dayNight.hidden = false;
      dayNight.classList.add('is-visible');
    }, T.cardAt);
    later(function () { voice.currentTime = 0; playVoice(); }, T.voiceAt);
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
    clearPile();
    toDay();
    stage.classList.remove('is-day');
    // zurueck aufs leere Papier: erst die Farbe, dann die Linien
    later(function () { tween('paint', 0, 1300); }, 2500);
    later(function () { tween('draw', 0, 1000); }, 3500);
    if (!hasGL) later(function () { still.src = 'papier.jpg'; }, 2500);
    // Umschlag wieder verschlossen hinlegen
    later(resetIntro, 4500);
    later(function () { taplayer.classList.remove('is-hidden'); }, 4500 + DOOR.closeMs + DOOR.lag);
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
    if (voice.paused) playVoice(); else voice.pause();
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
    state.draw = 1; state.paint = 1; state.dark = 1; state.light = 1.08; state.snow = 1; phase = 'night';
    intro.style.visibility = 'hidden'; stage.classList.add('is-opened');
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

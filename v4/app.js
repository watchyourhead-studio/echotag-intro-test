(function () {
  'use strict';

  // ============================================================
  //  CONFIG - Kartenfarbe und Palette hier zentral aenderbar
  // ============================================================
  var COLORS = {
    card:  '#22306E',  // Kartenfront: eine Farbe (Tiefblau)
    cream: '#F6F1E8',  // Innenseiten, Player-Karte, Szene-Papier
    blue:  '#22306E',  // Tiefblau: Schrift, UI
    pink:  '#EBC7D2',  // Akzent
    ink:   '#F6F1E8'   // Farbe des Empfaengernamens (Live-Textebene, CSS)
  };

  // ---------- Konstanten ----------
  var OPEN_MS = 1700;     // Dauer der Gatefold-Oeffnung
  var SCENE_MS = 6000;    // Dauer der Zeichen-Flugphase bis die Player-Karte einfliegt
  var STROKE_DUR = 0.15;  // Anteil: Strich-Phase pro Ebene
  var COLOR_DUR = 0.20;   // Anteil: Farb-Phase pro Ebene
  var CAM_Z = 80;         // Kamera-Dolly in px (Perspektive 1000), bewusst leicht
  var OPEN_ANGLE = 2.96;  // ~170 Grad
  var CARD_W = 905, CARD_H = 1600;
  var THICK = 0.055;      // Materialstaerke der Karte (dicke Kartonage)

  // ---------- URL-Parameter ----------
  var qs = new URLSearchParams(location.search);
  var recipient = (qs.get('name') || 'Julia').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Julia';
  var debugState = qs.get('state');
  var debugScene = qs.has('scene') ? parseFloat(qs.get('scene')) : null;
  var debugT = qs.has('t') ? parseFloat(qs.get('t')) : null;

  // ---------- DOM ----------
  var stage = document.getElementById('stage');
  var glCanvas = document.getElementById('gl');
  var fallback = document.getElementById('fallback');
  var sceneEl = document.getElementById('scene');
  var sceneCam = document.getElementById('sceneCam');
  var snowCv = document.getElementById('snow');
  var cardname = document.getElementById('cardname');
  var cardnameText = document.getElementById('cardnameText');
  var veil = document.getElementById('veil');
  var taplayer = document.getElementById('taplayer');
  var hint = document.getElementById('hint');
  var cardWrap = document.getElementById('cardWrap');
  var card = document.getElementById('card');
  var audio = document.getElementById('audio');
  var playBtn = document.getElementById('playBtn');
  var iconPlay = document.getElementById('iconPlay');
  var iconPause = document.getElementById('iconPause');
  var muteBtn = document.getElementById('muteBtn');
  var iconVol = document.getElementById('iconVol');
  var iconMute = document.getElementById('iconMute');
  var track = document.getElementById('track');
  var fill = document.getElementById('fill');
  var tCur = document.getElementById('tCur');
  var tDur = document.getElementById('tDur');
  var replayBtn = document.getElementById('replayBtn');

  var phase = 'boot'; // closed -> opening -> flight -> landing -> player
  var audioTimer = null;
  var flightTimer = null;
  var seeking = false;
  var HINT_DEFAULT = 'Tippen zum Öffnen';

  function fmt(t) {
    if (!isFinite(t) || t < 0) return '0:00';
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    return m + ':' + String(s).padStart(2, '0');
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function easeInOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  function setHint(text, loading) {
    hint.textContent = text;
    hint.classList.toggle('is-loading', !!loading);
  }

  // ============================================================
  //  Texturen: Motiv + Farben aus CONFIG, Name zur Laufzeit eingebrannt
  // ============================================================
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = rej;
      im.src = src;
    });
  }
  function loadFonts() {
    var f = new FontFace('Jost', 'url(fonts/jost-var.woff2)', { weight: '100 900' });
    document.fonts.add(f);
    return f.load();
  }

  // Gleichmaessiges Papierkorn, damit gebackener Text wie Druck wirkt
  var grainPat = null;
  function makeGrain(ctx) {
    var g = document.createElement('canvas');
    g.width = 128; g.height = 128;
    var gc = g.getContext('2d');
    var id = gc.createImageData(128, 128);
    for (var i = 0; i < id.data.length; i += 4) {
      var v = 118 + Math.random() * 20;
      id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v; id.data[i + 3] = 26;
    }
    gc.putImageData(id, 0, 0);
    grainPat = ctx.createPattern(g, 'repeat');
  }

  function drawSpaced(ctx, text, cx, y, spacing) {
    var chars = text.split('');
    var widths = chars.map(function (c) { return ctx.measureText(c).width; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + spacing * (chars.length - 1);
    var x = cx - total / 2;
    chars.forEach(function (c, i) {
      ctx.fillText(c, x, y);
      x += widths[i] + spacing;
    });
  }

  // Vorderseite: NUR eine Farbe, kein Motiv, kein eingebrannter Name.
  // Der Empfaengername ist eine Live-Textebene im DOM (Jost), damit dasselbe
  // Material fuer alle Empfaenger funktioniert.
  function bakeFront() {
    var S = 2;
    var cv = document.createElement('canvas');
    cv.width = CARD_W * S; cv.height = CARD_H * S;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = COLORS.card;
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (!grainPat) makeGrain(ctx);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = grainPat;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalAlpha = 1;
    return cv;
  }

  // Innenseiten: Creme-Papier mit Korn, ohne Aufdruck
  function bakeBack() {
    var S = 1;
    var cv = document.createElement('canvas');
    cv.width = CARD_W * S; cv.height = CARD_H * S;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = COLORS.cream;
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (!grainPat) makeGrain(ctx);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = grainPat;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalAlpha = 1;
    return cv;
  }

  // Streifen aus der gebackenen Vorderseite fuer die Kanten (Druck laeuft um die Ecke)
  function edgeStrip(cv, sx, sy, sw, sh, dw, dh) {
    var c = document.createElement('canvas');
    c.width = dw; c.height = dh;
    var x = c.getContext('2d');
    x.drawImage(cv, sx, sy, sw, sh, 0, 0, dw, dh);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = 'rgb(224,224,224)';
    x.fillRect(0, 0, dw, dh);
    x.globalCompositeOperation = 'source-over';
    if (grainPat) {
      x.globalAlpha = 0.7;
      x.fillStyle = grainPat;
      x.fillRect(0, 0, dw, dh);
      x.globalAlpha = 1;
    }
    return c;
  }

  // ============================================================
  //  3D-Gatefold
  // ============================================================
  var renderer = null, scene, camera, cardGroup, pivL, pivR, blobShadow;
  var halfW, cardH = 3.3, z0 = 8;
  var rafId = null, lastFrame = 0;
  var swayOn = true, swayT = 0;
  var openStart = 0, frozenP = null;

  function initGL(frontCanvas, backCanvas) {
    try {
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true });
    } catch (e) { return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);

    var hemi = new THREE.HemisphereLight(0xfff8f0, 0xdcc9c2, 0.42);
    scene.add(hemi);
    var key = new THREE.DirectionalLight(0xffffff, 0.6);
    key.position.set(-2.4, 3.4, 5.2);
    scene.add(key);
    var fillLight = new THREE.DirectionalLight(0xe8edff, 0.1);
    fillLight.position.set(3, -1.5, 4);
    scene.add(fillLight);

    // Weicher Ambient-Schatten hinter der Karte
    var shCv = document.createElement('canvas');
    shCv.width = 256; shCv.height = 256;
    var shCtx = shCv.getContext('2d');
    var grad = shCtx.createRadialGradient(128, 128, 10, 128, 128, 126);
    grad.addColorStop(0, 'rgba(10,16,44,0.34)');
    grad.addColorStop(0.55, 'rgba(10,16,44,0.16)');
    grad.addColorStop(1, 'rgba(10,16,44,0)');
    shCtx.fillStyle = grad;
    shCtx.fillRect(0, 0, 256, 256);
    var shTex = new THREE.CanvasTexture(shCv);
    blobShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false })
    );
    scene.add(blobShadow);

    cardGroup = new THREE.Group();
    scene.add(cardGroup);

    halfW = (cardH * (CARD_W / CARD_H)) / 2;

    var frontTex = new THREE.CanvasTexture(frontCanvas);
    frontTex.encoding = THREE.sRGBEncoding;
    frontTex.anisotropy = renderer.capabilities.getMaxAnisotropy ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
    var backTex = new THREE.CanvasTexture(backCanvas);
    backTex.encoding = THREE.sRGBEncoding;
    backTex.anisotropy = 4;

    var frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.95, metalness: 0 });
    var backMatL = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.9, metalness: 0 });
    var backMatR = backMatL.clone();

    // Kantenmaterialien: Druck (inkl. Name) laeuft um die Ecke wie bei dickem Karton
    var FCW = frontCanvas.width, FCH = frontCanvas.height, FH = FCW / 2;
    function edgeMat(c) {
      var t = new THREE.CanvasTexture(c);
      t.encoding = THREE.sRGBEncoding;
      t.anisotropy = 4;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 1.0, metalness: 0 });
    }
    var EW = 14;
    var mInL = edgeMat(edgeStrip(frontCanvas, FH - EW, 0, EW, FCH, 64, 1600));
    var mOutL = edgeMat(edgeStrip(frontCanvas, 0, 0, EW, FCH, 64, 1600));
    var mInR = edgeMat(edgeStrip(frontCanvas, FH, 0, EW, FCH, 64, 1600));
    var mOutR = edgeMat(edgeStrip(frontCanvas, FCW - EW, 0, EW, FCH, 64, 1600));
    var mTopL = edgeMat(edgeStrip(frontCanvas, 0, 0, FH, EW, 800, 64));
    var mBotL = edgeMat(edgeStrip(frontCanvas, 0, FCH - EW, FH, EW, 800, 64));
    var mTopR = edgeMat(edgeStrip(frontCanvas, FH, 0, FH, EW, 800, 64));
    var mBotR = edgeMat(edgeStrip(frontCanvas, FH, FCH - EW, FH, EW, 800, 64));

    function wing(side) {
      // Starrer, dicker Fluegel: Front z=0, Rueckseite z=-THICK, 4 bedruckte Kanten
      var L = side === 'L';
      var xOff = L ? halfW / 2 : -halfW / 2;
      var pivot = new THREE.Group();

      var g = new THREE.PlaneGeometry(halfW, cardH);
      var i, uv = g.attributes.uv;
      for (i = 0; i < uv.count; i++) uv.setX(i, L ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
      g.translate(xOff, 0, 0);
      pivot.add(new THREE.Mesh(g, frontMat));

      var gb = new THREE.PlaneGeometry(halfW, cardH);
      gb.rotateY(Math.PI);
      gb.translate(xOff, 0, -THICK);
      pivot.add(new THREE.Mesh(gb, L ? backMatL : backMatR));

      var xIn = L ? halfW : -halfW;
      var gi = new THREE.PlaneGeometry(THICK, cardH);
      gi.rotateY(L ? Math.PI / 2 : -Math.PI / 2);
      gi.translate(xIn, 0, -THICK / 2);
      pivot.add(new THREE.Mesh(gi, L ? mInL : mInR));

      var go = new THREE.PlaneGeometry(THICK, cardH);
      go.rotateY(L ? -Math.PI / 2 : Math.PI / 2);
      go.translate(0, 0, -THICK / 2);
      pivot.add(new THREE.Mesh(go, L ? mOutL : mOutR));

      var gt = new THREE.PlaneGeometry(halfW, THICK);
      gt.rotateX(-Math.PI / 2);
      gt.translate(xOff, cardH / 2, -THICK / 2);
      pivot.add(new THREE.Mesh(gt, L ? mTopL : mTopR));

      var gbo = new THREE.PlaneGeometry(halfW, THICK);
      gbo.rotateX(Math.PI / 2);
      gbo.translate(xOff, -cardH / 2, -THICK / 2);
      pivot.add(new THREE.Mesh(gbo, L ? mBotL : mBotR));

      return pivot;
    }

    pivL = wing('L'); pivL.position.x = -halfW;
    pivR = wing('R'); pivR.position.x = halfW;
    cardGroup.add(pivL); cardGroup.add(pivR);

    window.addEventListener('resize', fit);
    fit();
    return true;
  }

  function fit() {
    var w = stage.clientWidth || window.innerWidth, h = stage.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    var fovR = camera.fov * Math.PI / 360;
    // Cover-Fit wie bei v2/v3: Karte fuellt die Buehne randlos
    var distH = (cardH / 2) / Math.tan(fovR);
    var distW = halfW / (Math.tan(fovR) * camera.aspect);
    z0 = Math.min(distH, distW) * 0.97;
    camera.position.set(0, 0, z0);
    camera.lookAt(0, 0, 0);
    if (blobShadow) {
      blobShadow.scale.set(halfW * 2 * 1.42, cardH * 1.24, 1);
      blobShadow.position.set(0.1, -0.14, -0.5);
    }
  }

  function renderFrame(dt) {
    if (swayOn) {
      swayT += dt;
      cardGroup.rotation.y = Math.sin(swayT * 0.55) * 0.035;
      cardGroup.rotation.x = Math.sin(swayT * 0.8) * 0.013;
    }
    renderer.render(scene, camera);
  }

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;

    if (phase === 'flight' && frozenSceneT === null) {
      var st = clamp((now - sceneT0) / SCENE_MS, 0, 1);
      setScene(st);
      if (st >= 1) landCard();
    }
    if (phase === 'opening' || frozenP !== null) {
      var p = frozenP !== null ? frozenP : clamp((now - openStart) / OPEN_MS, 0, 1);
      var e = easeInOutCubic(p);
      var theta = e * OPEN_ANGLE;
      pivL.rotation.y = -theta;
      pivR.rotation.y = theta;
      // Kamera schiebt durch das Tor; Karte läuft dabei aus dem Fokus (Kamerafahrt)
      camera.position.z = z0 * (1 - 0.58 * smooth((p - 0.22) / 0.78));
      var blur = p > 0.2 ? Math.pow(smooth((p - 0.2) / 0.7), 1.1) * 10 : 0;
      glCanvas.style.filter = blur > 0.05 ? 'blur(' + blur.toFixed(1) + 'px)' : '';
      cardGroup.rotation.y *= 0.85; cardGroup.rotation.x *= 0.85;
      if (blobShadow) blobShadow.material.opacity = 1 - smooth(p * 1.7);
      // Name loest sich zu Beginn der Oeffnung auf (Live-Ebene, kein Einbrennen)
      var kn = 1 - smooth((p - 0.05) / 0.25);
      cardname.style.opacity = kn;
      cardname.style.filter = kn > 0.01 ? 'blur(' + ((1 - kn) * 14).toFixed(1) + 'px)' : '';
      cardname.style.visibility = kn > 0.01 ? 'visible' : 'hidden';
      // Welt dahinter blendet synchron zur Oeffnung ein
      sceneEl.style.opacity = smooth(p * 2.2);
      if (p > 0.8) glCanvas.style.opacity = Math.max(0, 1 - (p - 0.8) / 0.2);
      if (p >= 1 && frozenP === null) endOpening();
    }
    if (phase !== 'flight' && phase !== 'landing' && phase !== 'player') renderFrame(dt);
    drawSnow(now);
  }

  function startLoop() {
    if (rafId === null && renderer) {
      lastFrame = performance.now();
      rafId = requestAnimationFrame(loop);
    }
  }
  function stopLoop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // ============================================================
  //  Szenen-Flug: Straße wird waehrend des Flugs gezeichnet
  //  (Ebenen aus Max' Aquarell, Strich-Reveal -> Farb-Fade, Turm zuletzt)
  // ============================================================
  var LAYERS = [
    // z = Tiefe in px (Perspektive 1000), s = Strich-Start, c = Farb-Start (Anteile)
    { id: 'ground',      z: 750,  s: 0.04, c: 0.24 },
    { id: 'people',      z: 200,  s: 0.08, c: 0.28 },
    { id: 'awning',      z: 600,  s: 0.14, c: 0.34 },
    { id: 'trees',       z: 400,  s: 0.20, c: 0.40 },
    { id: 'buildings-l', z: 1000, s: 0.28, c: 0.48 },
    { id: 'buildings-r', z: 1000, s: 0.33, c: 0.52 },
    { id: 'sky',         z: 1500, s: 0.40, c: 0.58 },
    { id: 'tower',       z: 1350, s: 0.64, c: 0.84 }
  ];
  var sceneT0 = 0, frozenSceneT = null;
  var sceneDone = false, snowOn = false, snowP = [];

  // Ebenen einmalig mit Tiefe versetzt (Skalenausgleich fuer die Perspektive)
  LAYERS.forEach(function (l) {
    var el = document.getElementById('sl-' + l.id);
    l.el = el;
    l.stroke = el.querySelector('.sl-stroke');
    l.color = el.querySelector('.sl-color');
    var k = (1000 + l.z) / 1000;
    el.style.transform = 'translateZ(' + (-l.z) + 'px) scale(' + k.toFixed(4) + ')';
  });

  function setScene(t) {
    // t: 0..1 entlang SCENE_MS
    LAYERS.forEach(function (l) {
      var sp = clamp((t - l.s) / STROKE_DUR, 0, 1);   // Strich-Fortschritt
      var cp = clamp((t - l.c) / COLOR_DUR, 0, 1);    // Farb-Fortschritt
      l.stroke.style.setProperty('--p', sp.toFixed(4));
      l.stroke.style.opacity = sp > 0 ? 1 : 0;
      l.color.style.opacity = cp;
      l.color.style.filter = cp > 0 && cp < 1 ? 'blur(' + ((1 - cp) * 7).toFixed(1) + 'px)' : (cp >= 1 ? '' : 'blur(7px)');
    });
    // leichter Kamera-Flug durch die Strasse
    var cz = CAM_Z * easeInOutCubic(clamp(t, 0, 1));
    sceneCam.style.transform = 'translateZ(' + cz.toFixed(1) + 'px)';
    if (t >= 0.93) startSnow();
    if (t >= 1) sceneDone = true;
  }

  function resetScene() {
    LAYERS.forEach(function (l) {
      l.stroke.style.setProperty('--p', '0');
      l.stroke.style.opacity = 0;
      l.color.style.opacity = 0;
      l.color.style.filter = 'blur(7px)';
    });
    sceneCam.style.transform = 'translateZ(0px)';
    sceneEl.style.opacity = 0;
    sceneDone = false;
    stopSnow();
  }

  // Schnee erst in der fertigen Endszene
  function startSnow() {
    if (snowOn) return;
    snowOn = true;
    var w = stage.clientWidth, h = stage.clientHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    snowCv.width = w * dpr; snowCv.height = h * dpr;
    snowCv.style.width = w + 'px'; snowCv.style.height = h + 'px';
    snowP = [];
    for (var i = 0; i < 90; i++) {
      snowP.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 0.8 + Math.random() * 1.8,
        v: 14 + Math.random() * 22,
        drift: 6 + Math.random() * 10,
        ph: Math.random() * 6.28
      });
    }
  }
  function stopSnow() {
    snowOn = false;
    var c = snowCv.getContext('2d');
    if (c) c.clearRect(0, 0, snowCv.width, snowCv.height);
  }
  var snowLast = 0;
  function drawSnow(now) {
    if (!snowOn) return;
    var c = snowCv.getContext('2d');
    if (!c) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = snowCv.width / dpr, h = snowCv.height / dpr;
    var dt = Math.min(0.05, (now - snowLast) / 1000 || 0.016);
    snowLast = now;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,253,250,.85)';
    for (var i = 0; i < snowP.length; i++) {
      var f = snowP[i];
      f.y += f.v * dt;
      f.x += Math.sin(now / 1400 + f.ph) * f.drift * dt;
      if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
      c.beginPath();
      c.arc(f.x, f.y, f.r, 0, 6.283);
      c.fill();
    }
  }

  // ============================================================
  //  Ablauf
  // ============================================================
  function open() {
    if (phase !== 'closed') return;
    phase = 'opening';
    taplayer.classList.add('is-pass');
    taplayer.classList.add('is-hidden');

    // Sample-Audio im selben Gesture stumm entsperren (iOS)
    try {
      audio.muted = true;
      var ap = audio.play();
      if (ap && ap.then) ap.then(function () { audio.pause(); audio.currentTime = 0; audio.muted = false; }, function () { audio.muted = false; });
    } catch (e) { audio.muted = false; }

    if (renderer) {
      swayOn = false;
      glCanvas.style.opacity = 1;
      openStart = performance.now();
    } else {
      // Fallback ohne WebGL: statische Karte ausblenden, fertige Szene direkt zeigen
      fallback.style.transition = 'opacity .8s ease';
      fallback.style.opacity = 0;
      cardname.style.opacity = 0;
      cardname.style.visibility = 'hidden';
      sceneEl.style.opacity = 1;
      setScene(1);
      clearTimeout(flightTimer);
      flightTimer = setTimeout(landCard, 900);
    }
  }

  function endOpening() {
    phase = 'flight';
    glCanvas.style.opacity = 0;
    sceneEl.style.opacity = 1;
    sceneT0 = performance.now();
    // Loop laeuft weiter: sie treibt die Szenen-Zeitleiste
  }

  function landCard() {
    if (phase !== 'flight' && phase !== 'opening') return;
    phase = 'landing';
    veil.classList.add('is-on');
    cardWrap.setAttribute('aria-hidden', 'false');
    card.classList.add('is-in');
    clearTimeout(audioTimer);
    audioTimer = setTimeout(function () {
      audio.muted = false;
      audio.currentTime = 0;
      audio.play().catch(function () {});
      phase = 'player';
    }, 1300);
  }

  function replay() {
    clearTimeout(audioTimer);
    clearTimeout(flightTimer);
    audio.pause(); audio.currentTime = 0; audio.muted = false;
    resetScene();
    cardname.style.opacity = 1;
    cardname.style.filter = '';
    cardname.style.visibility = 'visible';
    veil.classList.remove('is-on');
    card.classList.remove('is-in');
    cardWrap.setAttribute('aria-hidden', 'true');
    if (renderer) {
      frozenP = null;
      pivL.rotation.y = 0; pivR.rotation.y = 0;
      glCanvas.style.filter = '';
      camera.position.set(0, 0, z0);
      cardGroup.rotation.set(0, 0, 0);
      if (blobShadow) blobShadow.material.opacity = 1;
      swayOn = true; swayT = 0;
      glCanvas.style.opacity = 1;
      startLoop();
    } else {
      fallback.style.opacity = 1;
    }
    taplayer.classList.remove('is-hidden');
    taplayer.classList.remove('is-pass');
    setHint(HINT_DEFAULT, false);
    phase = 'closed';
  }

  // Fallback: blockierte Audiowiedergabe beim naechsten echten Fingertipp holen
  stage.addEventListener('pointerdown', function () {
    if (card.classList.contains('is-in') && audio.paused && audio.currentTime === 0) {
      audio.muted = false;
      audio.play().catch(function () {});
    }
  });

  taplayer.addEventListener('click', open);
  taplayer.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  replayBtn.addEventListener('click', replay);

  // ---------- Player ----------
  playBtn.addEventListener('click', function () {
    if (audio.paused) audio.play().catch(function () {});
    else audio.pause();
  });
  muteBtn.addEventListener('click', function () {
    audio.muted = !audio.muted;
    iconVol.style.display = audio.muted ? 'none' : '';
    iconMute.style.display = audio.muted ? '' : 'none';
    muteBtn.setAttribute('aria-label', audio.muted ? 'Ton an' : 'Stumm');
  });
  audio.addEventListener('play', function () {
    iconPlay.style.display = 'none';
    iconPause.style.display = '';
    playBtn.setAttribute('aria-label', 'Pause');
  });
  audio.addEventListener('pause', function () {
    iconPlay.style.display = '';
    iconPause.style.display = 'none';
    audio.setAttribute('aria-label', 'Abspielen');
  });
  audio.addEventListener('ended', function () {
    iconPlay.style.display = '';
    iconPause.style.display = 'none';
    audio.currentTime = 0;
  });
  audio.addEventListener('loadedmetadata', function () {
    tDur.textContent = fmt(audio.duration);
    track.setAttribute('aria-valuemax', String(Math.round(audio.duration)));
  });
  audio.addEventListener('timeupdate', function () {
    if (seeking) return;
    tCur.textContent = fmt(audio.currentTime);
    track.setAttribute('aria-valuenow', String(Math.round(audio.currentTime)));
    if (audio.duration > 0) fill.style.width = Math.min(100, (audio.currentTime / audio.duration) * 100) + '%';
  });
  function seekTo(clientX) {
    if (!audio.duration) return;
    var r = track.getBoundingClientRect();
    var ratio = clamp((clientX - r.left) / r.width, 0, 1);
    audio.currentTime = ratio * audio.duration;
    tCur.textContent = fmt(audio.currentTime);
    fill.style.width = (ratio * 100) + '%';
  }
  track.addEventListener('pointerdown', function (e) {
    seeking = true;
    seekTo(e.clientX);
    try { track.setPointerCapture(e.pointerId); } catch (err) {}
  });
  track.addEventListener('pointermove', function (e) { if (seeking) seekTo(e.clientX); });
  track.addEventListener('pointerup', function () { seeking = false; });

  // ============================================================
  //  Start
  // ============================================================
  function ready(frontCanvas, backCanvas) {
    var ok = typeof THREE !== 'undefined' && initGL(frontCanvas, backCanvas);
    if (!ok) {
      glCanvas.style.display = 'none';
      fallback.hidden = false;
    }
    phase = 'closed';
    setHint(HINT_DEFAULT, false);

    // Empfaengername als Live-Textebene (wird nie ins Material eingebrannt)
    cardnameText.textContent = recipient.toUpperCase();

    // Debug-/Testzustaende fuer Screenshots
    if (renderer && debugT !== null && !isNaN(debugT)) {
      frozenP = clamp(debugT, 0, 1);
      swayOn = false;
    }
    if (renderer && debugState === 'open') {
      frozenP = 1;
      swayOn = false;
      cardname.style.opacity = 0;
      cardname.style.visibility = 'hidden';
      sceneEl.style.opacity = 1;
      setScene(1);
    }
    if (debugScene !== null && !isNaN(debugScene)) {
      // Szene eingefroren (Flugmitte/Endzustand), Karte weg
      if (renderer) { stopLoop(); glCanvas.style.opacity = 0; }
      else fallback.style.opacity = 0;
      cardname.style.opacity = 0;
      cardname.style.visibility = 'hidden';
      taplayer.classList.add('is-hidden');
      sceneEl.style.opacity = 1;
      phase = 'flight';
      frozenSceneT = clamp(debugScene, 0, 1);
      setScene(frozenSceneT);
    }
    if (debugState === 'player') {
      if (renderer) { stopLoop(); glCanvas.style.opacity = 0; }
      else fallback.style.opacity = 0;
      cardname.style.opacity = 0;
      cardname.style.visibility = 'hidden';
      sceneEl.style.opacity = 1;
      setScene(1);
      phase = 'flight';
      veil.style.transition = 'none';
      card.style.transition = 'none';
      taplayer.classList.add('is-hidden');
      var items = document.querySelectorAll('.anim-item');
      for (var ii = 0; ii < items.length; ii++) items[ii].style.transition = 'none';
      landCard();
      audio.pause();
    }
    startLoop();
    if (qs.has('auto')) setTimeout(open, 900);
  }

  if (audio.readyState >= 1) tDur.textContent = fmt(audio.duration);

  loadFonts()
    .then(function () { ready(bakeFront(), bakeBack()); })
    .catch(function () { ready(bakeFront(), bakeBack()); });
})();

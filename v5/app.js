(function () {
  'use strict';

  // ---------- Konstanten ----------
  var START_T = 0;        // EchoTag-Clip beginnt direkt in der Paris-Szene
  var LAND_AT = 7.6;      // absolute Videosekunde, ab der die Player-Karte einfliegt (Clip: 8.04s)
  var OPEN_MS = 1700;     // Dauer der Gatefold-Öffnung
  var OPEN_ANGLE = 2.96;  // ~170 Grad
  var CARD_W = 905, CARD_H = 1600;
  var THICK = 0.055;    // Materialstärke der Karte (dicke Kartonage)

  // ---------- URL-Parameter ----------
  var qs = new URLSearchParams(location.search);
  var recipient = (qs.get('name') || 'Julia').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Julia';
  var debugState = qs.get('state');
  var debugT = qs.has('t') ? parseFloat(qs.get('t')) : null;

  // ---------- DOM ----------
  var stage = document.getElementById('stage');
  var glCanvas = document.getElementById('gl');
  var fallback = document.getElementById('fallback');
  var revealPoster = document.getElementById('revealPoster');
  var video = document.getElementById('video');
  var endbg = document.getElementById('endbg');
  var veil = document.getElementById('veil');
  var taplayer = document.getElementById('taplayer');
  var hint = document.getElementById('hint');
  var cardWrap = document.getElementById('cardWrap');
  var card = document.getElementById('card');
  var cardname = document.getElementById('cardname');
  var cardnameText = document.getElementById('cardnameText');
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
  var watchdog = null;
  var stallWatch = null;
  var audioTimer = null;
  var seeking = false;
  var pendingSeek = false;
  var HINT_DEFAULT = 'Tippen zum Öffnen';
  var HINT_LOADING = 'Lädt …';
  var HINT_RETRY = 'Nicht geladen - nochmal tippen';

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
  //  Texturen: echtes Kartenartwork + Name zur Laufzeit eingebrannt
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
    var defs = [
      ['400', 'latin', 'U+0000-00FF'],
      ['500', 'latin', 'U+0000-00FF'],
      ['600', 'latin', 'U+0000-00FF'],
      ['500', 'latin-ext', 'U+0100-024F, U+1E00-1EFF'],
      ['600', 'latin-ext', 'U+0100-024F, U+1E00-1EFF']
    ];
    var jobs = defs.map(function (d) {
      var f = new FontFace('Oswald', 'url(fonts/oswald-' + d[0] + '-' + d[1] + '.woff2)', {
        weight: d[0], unicodeRange: d[2]
      });
      document.fonts.add(f);
      return f.load();
    });
    return Promise.all(jobs);
  }

  // Gleichmäßiges Papierkorn, damit gebackener Text wie Druck wirkt
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

  // Vorderseite: NUR Artwork + Korn. Der Empfaengername wird nie eingebrannt
  // (Max-Regel 25.10), er liegt als Live-Textebene im DOM (Jost) - dasselbe
  // Material funktioniert so fuer alle Empfaenger.
  function bakeFront(img) {
    var S = 2;
    var cv = document.createElement('canvas');
    cv.width = CARD_W * S; cv.height = CARD_H * S;
    var ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    if (!grainPat) makeGrain(ctx);

    // Papierkorn über den Druck legen
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = grainPat;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalAlpha = 1;
    return cv;
  }

  // Innenseiten: zum Artwork passendes pinkes Papier mit Korn, ohne Aufdruck
  function bakeBack(img) {
    var S = 1;
    var cv = document.createElement('canvas');
    cv.width = CARD_W * S; cv.height = CARD_H * S;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#F6F1E8';   // EchoTag: Innenseiten cremig (v4-Palette)
    ctx.fillRect(0, 0, cv.width, cv.height);
    // Korn des Originals durchscheinen lassen
    ctx.globalAlpha = 0.16;
    ctx.globalCompositeOperation = 'soft-light';
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (!grainPat) makeGrain(ctx);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = grainPat;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalAlpha = 1;
    return cv;
  }

  // Streifen aus der gebackenen Vorderseite für die Kanten (Druck läuft um die Ecke)
  function edgeStrip(cv, sx, sy, sw, sh, dw, dh) {
    var c = document.createElement('canvas');
    c.width = dw; c.height = dh;
    var x = c.getContext('2d');
    x.drawImage(cv, sx, sy, sw, sh, 0, 0, dw, dh);
    // Schnittkante matter machen: abgedunkelt + Papierkorn wie Karton
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
  var glFailed = false;

  function initGL(frontCanvas, backCanvas) {
    try {
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true });
    } catch (e) { glFailed = true; return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);

    var hemi = new THREE.HemisphereLight(0xfff8f0, 0xdcc9c2, 0.42);
    scene.add(hemi);
    var key = new THREE.DirectionalLight(0xffffff, 0.6);
    key.position.set(-2.4, 3.4, 5.2);
    scene.add(key);
    var fillLight = new THREE.DirectionalLight(0xfff0e6, 0.1);
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

    // Kantenmaterialien: Druck (inkl. Name) läuft um die Ecke wie bei dickem Karton
    var FCW = frontCanvas.width, FCH = frontCanvas.height, FH = FCW / 2;
    function edgeMat(c) {
      var t = new THREE.CanvasTexture(c);
      t.encoding = THREE.sRGBEncoding;
      t.anisotropy = 4;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 1.0, metalness: 0 });
    }
    var EW = 14; // Quellstreifenbreite im Front-Canvas
    var mInL = edgeMat(edgeStrip(frontCanvas, FH - EW, 0, EW, FCH, 64, 1600));
    var mOutL = edgeMat(edgeStrip(frontCanvas, 0, 0, EW, FCH, 64, 1600));
    var mInR = edgeMat(edgeStrip(frontCanvas, FH, 0, EW, FCH, 64, 1600));
    var mOutR = edgeMat(edgeStrip(frontCanvas, FCW - EW, 0, EW, FCH, 64, 1600));
    var mTopL = edgeMat(edgeStrip(frontCanvas, 0, 0, FH, EW, 800, 64));
    var mBotL = edgeMat(edgeStrip(frontCanvas, 0, FCH - EW, FH, EW, 800, 64));
    var mTopR = edgeMat(edgeStrip(frontCanvas, FH, 0, FH, EW, 800, 64));
    var mBotR = edgeMat(edgeStrip(frontCanvas, FH, FCH - EW, FH, EW, 800, 64));

    function wing(side) {
      // Starrer, dicker Flügel: Front z=0, Rückseite z=-THICK, 4 bedruckte Kanten
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

      var xIn = L ? halfW : -halfW;   // Falz (Kartenmitte)
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
    // Cover-Fit wie bei v2: Karte fuellt die Buehne randlos (leichter Ueberstand gegen Sway-Raender)
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
      // Name (Live-Ebene) loest sich auf, nur Opacity
      var kn = 1 - smooth((p - 0.15) / 0.35);
      cardname.style.opacity = kn;
      cardname.style.visibility = kn > 0.01 ? 'visible' : 'hidden';
      // Blumenwelt blendet synchron zur Öffnung ein
      var rv = smooth(p * 2.2);
      revealPoster.style.opacity = rv;
      if (video.dataset.on === '1') video.style.opacity = rv;
      if (p > 0.8) glCanvas.style.opacity = Math.max(0, 1 - (p - 0.8) / 0.2);
      if (p >= 1 && frozenP === null) endOpening();
    }
    renderFrame(dt);
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
  //  Ablauf
  // ============================================================
  function open() {
    if (phase !== 'closed' && phase !== 'retry') return;
    phase = 'opening';
    taplayer.classList.add('is-pass');
    // Sofortiges Ladefeedback nach dem Tippen, falls das Video noch nicht bereit ist
    if (video.dataset.on !== '1') setHint(HINT_LOADING, true);
    else taplayer.classList.add('is-hidden');

    // Testton im selben Gesture stumm entsperren (iOS)
    try {
      audio.muted = true;
      var ap = audio.play();
      if (ap && ap.then) ap.then(function () { audio.pause(); audio.currentTime = 0; audio.muted = false; }, function () { audio.muted = false; });
    } catch (e) { audio.muted = false; }

    // Blumenphase starten (stumm), Karte öffnet sich sofort - kein toter Tap
    video.muted = true;
    var doPlay = function () {
      var vp;
      try { vp = video.play(); } catch (e) { vp = null; }
      if (vp && vp.catch) vp.catch(function () { /* Watchdog greift */ });
    };
    try {
      if (video.readyState >= 1) { video.currentTime = START_T; doPlay(); }
      else { pendingSeek = true; video.load(); }
    } catch (e) { pendingSeek = true; }

    clearTimeout(watchdog);
    watchdog = setTimeout(function () {
      if (video.dataset.on !== '1' && (phase === 'opening' || phase === 'flight')) {
        taplayer.classList.remove('is-hidden');
        taplayer.classList.remove('is-pass');
        setHint(HINT_RETRY, false);
        phase = 'retry';
      }
    }, 9000);
    if (renderer) {
      swayOn = false;
      glCanvas.style.opacity = 1;
      openStart = performance.now();
    } else {
      // Fallback: statische Karte ausblenden, Blumenwelt direkt zeigen
      fallback.style.transition = 'opacity .8s ease';
      fallback.style.opacity = 0;
      revealPoster.style.opacity = 1;
    }
  }

  function endOpening() {
    phase = 'flight';
    glCanvas.style.opacity = 0;
    revealPoster.style.opacity = 1;
    if (video.dataset.on === '1') video.style.opacity = 1;
    stopLoop();
  }

  function landCard() {
    if (phase !== 'flight') return;
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

  function freezeFrame() {
    if (phase !== 'landing' && phase !== 'player' && phase !== 'flight') return;
    if (phase === 'flight') landCard();
    endbg.classList.add('is-on');
    setTimeout(function () { video.style.opacity = 0; }, 650);
  }

  function replay() {
    clearTimeout(audioTimer);
    clearTimeout(stallWatch);
    audio.pause(); audio.currentTime = 0; audio.muted = false;
    video.pause();
    video.dataset.on = '';
    video.style.opacity = 0;
    revealPoster.style.opacity = 0;
    endbg.classList.remove('is-on');
    cardname.style.opacity = 1;
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

  // ---------- Video-Events ----------
  video.addEventListener('loadedmetadata', function () {
    if (pendingSeek) {
      pendingSeek = false;
      try { video.currentTime = START_T; } catch (e) {}
      var vp;
      try { vp = video.play(); } catch (e) { vp = null; }
      if (vp && vp.catch) vp.catch(function () {});
    }
  });
  video.addEventListener('playing', function () {
    video.dataset.on = '1';
    if (phase === 'opening' || phase === 'flight') taplayer.classList.add('is-hidden');
    if (phase === 'opening' || phase === 'flight') {
      var p = phase === 'flight' ? 1 : clamp((performance.now() - openStart) / OPEN_MS, 0, 1);
      video.style.opacity = smooth(p * 2.2);
    }
  });
  video.addEventListener('timeupdate', function () {
    if (!video.duration) return;
    if (video.currentTime >= LAND_AT) landCard();
  });
  video.addEventListener('ended', freezeFrame);
  video.addEventListener('error', freezeFrame);
  video.addEventListener('stalled', function () {
    if (phase !== 'flight') return;
    clearTimeout(stallWatch);
    stallWatch = setTimeout(freezeFrame, 6000);
  });
  video.addEventListener('playing', function () { clearTimeout(stallWatch); });

  // Fallback: blockierte Audiowiedergabe beim nächsten echten Fingertipp holen
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
    playBtn.setAttribute('aria-label', 'Abspielen');
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
      revealPoster.style.opacity = 1;
      cardname.style.opacity = 0;
      cardname.style.visibility = 'hidden';
    }
    if (debugState === 'player') {
      if (renderer) { stopLoop(); glCanvas.style.opacity = 0; }
      else fallback.style.opacity = 0;
      revealPoster.style.opacity = 1;
      endbg.style.transition = 'none';
      endbg.classList.add('is-on');
      cardname.style.opacity = 0;
      cardname.style.visibility = 'hidden';
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

  Promise.all([loadImage('card-front.jpg'), loadFonts()])
    .then(function (r) {
      ready(bakeFront(r[0]), bakeBack(r[0]));
    })
    .catch(function (err) {
      // Schrift oder Bild nicht ladbar: trotzdem Karte zeigen
      loadImage('card-front.jpg').then(function (img) {
        ready(bakeFront(img), bakeBack(img));
      }, function () {
        glCanvas.style.display = 'none';
        fallback.hidden = false;
        phase = 'closed';
      });
    });
})();

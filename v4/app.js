(function () {
  'use strict';

  // ============================================================
  //  CONFIG - Kartenfarbe und Palette hier zentral aenderbar
  // ============================================================
  var COLORS = {
    card:  '#7C1D25',  // Kartenfront: weihnachtliches Weinrot (dezent, kein Feuerwehrrot)
    cardDeep: '#571218',  // Vertiefung am Rand (leichter Verlauf auf der Front)
    cream: '#F6F1E8',  // Innenseiten, Player-Karte, Szene-Papier
    blue:  '#22306E',  // Tiefblau: Schrift, UI
    pink:  '#EBC7D2',  // Akzent
    ink:   '#F6F1E8'   // Farbe des Empfaengernamens (Live-Textebene, CSS)
  };

  // ---------- Konstanten ----------
  // ---------- Oeffnungs-Choreografie (frameweise aus v2 vermessen) ----------
  // v3-Oeffnung (Max 09:25: v3 war "fast perfekt") mit genau drei Anpassungen:
  // a) insgesamt +20% langsamer, b) 350ms v2-Hold vor dem Start,
  // c) Fluegel-Desync im v2-Verhaeltnis (1050/1650) aufs v3-Tempo skaliert.
  var HOLD_MS = 350;      // b) Anticipation: Karte steht nach dem Tap kurz still
  var SWING_L_MS = 1075;  // c) linker Fluegel = 1690 * 1050/1650
  var SWING_R_MS = 1690;  // a+c) rechter hinkt hinterher; 350+1690 = 2040ms = v3 (1700ms) +20%
  var OPEN_TOTAL = HOLD_MS + SWING_R_MS;
  // ---------- FLUG-VIDEO (Asset-Slot) ----------
  // Max' KI-Flugvideo kommt als 2-flug.mp4 in diesen Ordner - nur Datei tauschen, kein Code-Eingriff.
  // Solange es fehlt, laeuft das Paris-Standbild (scene.jpg) als Platzhalter.
  var VIDEO_SRC = '2-flug.mp4';
  var PLACEHOLDER_MS = 6000;   // Standbild-Dauer bis die Player-Karte landet
  // ---------- SCHNEE-ENDSZENE (Max-Wunsch) ----------
  // Flocken sammeln sich auf der Oberkante des Players; ab Schwellhoehe kippt ein Klumpen ab.
  var SNOW = {
    enabled: true,              // CONFIG-Schalter: Schnee-Endszene an/aus
    flakesDesktop: 130,         // max. gleichzeitige Flocken (Desktop)
    flakesMobile: 60,           // mobil begrenzt
    capMax: 16,                 // Hauben-Hoehe in px, ab der ein Klumpen abkippt
    clumpMin: 9                 // Mindest-Haubenhoehe fuer natuerliches Abkippen
  };
  var OPEN_ANGLE = 2.96;  // ~170 Grad
  var CARD_W = 905, CARD_H = 1600;
  var THICK = 0.055;      // Materialstaerke der Karte (v3-Wert, von Max abgenommen; ~3% der Breite wie der Blender-Render)
  var SCENE_BLUR0 = 7;    // Rack-Focus: Welt startet so unscharf, Oeffnung zieht den Fokus nach hinten

  // ---------- URL-Parameter ----------
  var qs = new URLSearchParams(location.search);
  var recipient = (qs.get('name') || 'Julia').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Julia';
  var debugState = qs.get('state');
  var snowForce = qs.get('snowforce') === '1';   // Debug: Schnee auch bei verstecktem Tab (Cloud-Test)
  var debugT = qs.has('t') ? parseFloat(qs.get('t')) : null;

  // ---------- DOM ----------
  var stage = document.getElementById('stage');
  var glCanvas = document.getElementById('gl');
  var fallback = document.getElementById('fallback');
  var sceneImg = document.getElementById('sceneImg');
  var sceneEl = document.getElementById('scene');
  var flightVideo = document.getElementById('flight');
  var snowFxCv = document.getElementById('snowFx');
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
  // cubic-bezier-Looper (wie CSS): Stuetzstellen v2: 14->0, 30->19, 46->32, 62->58, 78->77, 90->89
  function cubicBezier(x1, y1, x2, y2) {
    function bx(t) { var u = 1 - t; return 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t; }
    function by(t) { var u = 1 - t; return 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t; }
    function dBx(t) { var u = 1 - t; return 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2); }
    return function (x) {
      if (x <= 0) return by(0);
      if (x >= 1) return by(1);
      var t = x;
      for (var i = 0; i < 6; i++) {
        var e = bx(t) - x;
        var d = dBx(t);
        if (Math.abs(d) < 1e-4) break;
        t -= e / d;
        if (t < 0) t = 0; else if (t > 1) t = 1;
      }
      if (Math.abs(bx(t) - x) > 1e-4) {
        var lo = 0, hi = 1;
        for (var j = 0; j < 32; j++) {
          t = (lo + hi) / 2;
          if (bx(t) < x) lo = t; else hi = t;
        }
      }
      return by(t);
    };
  }
  function openEase(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }  // v3: easeInOutCubic
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
      id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v; id.data[i + 3] = 98;
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

  // Grossflaechiges Papier-Mottling (Low-Frequency), wie v2-Embossing
  function mottle(ctx, w, h) {
    for (var i = 0; i < 14; i++) {
      var x = Math.random() * w, y = Math.random() * h;
      var r = (0.25 + Math.random() * 0.45) * Math.max(w, h);
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      var dark = Math.random() < 0.5;
      var a = 0.03 + Math.random() * 0.035;
      g.addColorStop(0, dark ? 'rgba(0,0,0,' + a.toFixed(3) + ')' : 'rgba(255,255,255,' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Eckenradius ~2,5% der Kartenbreite in die Textur einbrennen (Material: alphaTest)
  function roundCorners(ctx, w, h) {
    var r = Math.round(w * 0.025);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, w, h, r);
    else {
      ctx.moveTo(r, 0);
      ctx.arcTo(w, 0, w, h, r); ctx.arcTo(w, h, 0, h, r);
      ctx.arcTo(0, h, 0, 0, r); ctx.arcTo(0, 0, w, 0, r);
      ctx.closePath();
    }
    ctx.fillStyle = '#000';  // deckkraftvolle Maske: destination-in nutzt nur deren Alpha
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
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
    // dezenter Verlauf: Mitte etwas heller, Raender vertieft
    var g = ctx.createRadialGradient(
      cv.width / 2, cv.height * 0.42, cv.width * 0.1,
      cv.width / 2, cv.height * 0.5, cv.height * 0.75
    );
    g.addColorStop(0, 'rgba(255,235,225,0.10)');
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);
    var g2 = ctx.createLinearGradient(0, 0, 0, cv.height);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(1, COLORS.cardDeep);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalAlpha = 1;
    // EchoTag-Wortmarke im Druck, Jost, dezent - dort, wo bei der Vorlage das
    // Bart-&-Bastian-Logo sass (Mitte, leicht unterhalb der Kartenmitte)
    ctx.fillStyle = 'rgba(246,241,232,0.92)';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '500 ' + (34 * S) + 'px Jost';
    drawSpaced(ctx, 'ECHOTAG', cv.width / 2, 1010 * S, 16 * S);
    if (!grainPat) makeGrain(ctx);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = grainPat;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalAlpha = 1;
    mottle(ctx, cv.width, cv.height);
    roundCorners(ctx, cv.width, cv.height);
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
    mottle(ctx, cv.width, cv.height);
    roundCorners(ctx, cv.width, cv.height);
    return cv;
  }

  // Schnittkante in hellem Papierweiss (Max 09:20): die Kante muss beim
  // Schwenken als helle Papierschicht lesbar sein, nicht als umgedruckter Rotton.
  function paperEdge(dw, dh, along) {
    var c = document.createElement('canvas');
    c.width = dw; c.height = dh;
    var x = c.getContext('2d');
    x.fillStyle = '#f5f1e6';            // warmes Papierweiss wie Karton-Schnitt
    x.fillRect(0, 0, dw, dh);
    // leichte Schicht-Struktur entlang der Kante (Kartonage-Lagen)
    x.globalAlpha = 0.12;
    var ln = along === 'h' ? dw : dh;
    for (var ly = 0; ly < ln; ly += 3) {
      x.fillStyle = (ly % 6 === 0) ? '#e6e0d0' : '#fbf8ef';
      if (along === 'h') x.fillRect(ly, 0, 1, dh); else x.fillRect(0, ly, dw, 1);
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = 'rgb(235,235,235)';   // mattieren wie Schnittkante
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
  var tapTime = 0, swayRotY = 0, swayRotX = 0;
  var openStart = 0, frozenP = null;
  var ghL = [], ghR = [];   // Nachzieher fuer Bewegungsunschaerfe

  function initGL(frontCanvas, backCanvas) {
    var ctxTries = 0;
    while (ctxTries < 3) {
      try {
        renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true });
        break;
      } catch (e) {
        // Manche Browser-Umgebungen belegen den Canvas vorab mit einem 2D-Context;
        // dann hilft nur ein frisches Element, Retry lohnt nicht auf demselben.
        ctxTries++;
        if (ctxTries >= 3) return false;
        var fresh = glCanvas.cloneNode(false);
        glCanvas.parentNode.replaceChild(fresh, glCanvas);
        glCanvas = fresh;
      }
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);

    var hemi = new THREE.HemisphereLight(0xfff8f0, 0xdcc9c2, 0.47);
    scene.add(hemi);
    var key = new THREE.DirectionalLight(0xffffff, 0.55);
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
    grad.addColorStop(0, 'rgba(10,16,44,0.27)');
    grad.addColorStop(0.55, 'rgba(10,16,44,0.11)');
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

    var frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.95, metalness: 0, alphaTest: 0.5 });
    var backMatL = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.9, metalness: 0, alphaTest: 0.5 });
    var backMatR = backMatL.clone();

    // Kantenmaterialien: Druck (inkl. Name) laeuft um die Ecke wie bei dickem Karton
    function edgeMat(c) {
      var t = new THREE.CanvasTexture(c);
      t.encoding = THREE.sRGBEncoding;
      t.anisotropy = 4;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 1.0, metalness: 0 });
    }
    var mInL = edgeMat(paperEdge(64, 1600));
    var mOutL = edgeMat(paperEdge(64, 1600));
    var mInR = edgeMat(paperEdge(64, 1600));
    var mOutR = edgeMat(paperEdge(64, 1600));
    var mTopL = edgeMat(paperEdge(800, 64, 'h'));
    var mBotL = edgeMat(paperEdge(800, 64, 'h'));
    var mTopR = edgeMat(paperEdge(800, 64, 'h'));
    var mBotR = edgeMat(paperEdge(800, 64, 'h'));

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

    // Bewegungsunschaerfe (Render-Learning): je Fluegel zwei halbtransparente
    // Nachzieher, die um 45/90ms aeltere Schwenkwinkel zeigen. Nur Front+Rueck,
    // ohne Kanten - bei 8-16% Deckkraft faellt das nicht auf und bleibt billig.
    function ghostWing(side, base) {
      var L = side === 'L';
      var xOff = L ? halfW / 2 : -halfW / 2;
      var gp = new THREE.Group();
      var g = new THREE.PlaneGeometry(halfW, cardH);
      var uv = g.attributes.uv, i;
      for (i = 0; i < uv.count; i++) uv.setX(i, L ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
      g.translate(xOff, 0, 0);
      var gb = new THREE.PlaneGeometry(halfW, cardH);
      gb.rotateY(Math.PI);
      gb.translate(xOff, 0, -THICK);
      function gm(src) {
        var m = src.clone();
        m.transparent = true; m.opacity = base;
        m.alphaTest = 0; m.depthWrite = false;
        return m;
      }
      var mf = gm(frontMat), mb = gm(L ? backMatL : backMatR);
      gp.add(new THREE.Mesh(g, mf));
      gp.add(new THREE.Mesh(gb, mb));
      gp.position.x = L ? -halfW : halfW;
      gp.visible = false;
      cardGroup.add(gp);
      return { pivot: gp, mats: [mf, mb], base: base };
    }
    ghL = [ghostWing('L', 0.16), ghostWing('L', 0.08)];
    ghR = [ghostWing('R', 0.16), ghostWing('R', 0.08)];

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
      blobShadow.scale.set(halfW * 2 * 1.52, cardH * 1.3, 1);
      blobShadow.position.set(0.1, -0.18, -0.5);
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

  // Schwenkwinkel als Funktion der Timeline (auch fuer Nachzieher nutzbar)
  function wingAngleL(ms) { var tMs = Math.max(0, ms - HOLD_MS); return -openEase(clamp(tMs / SWING_L_MS, 0, 1)) * OPEN_ANGLE; }
  function wingAngleR(ms) { var tMs = Math.max(0, ms - HOLD_MS); return  openEase(clamp(tMs / SWING_R_MS, 0, 1)) * OPEN_ANGLE; }
  function setGhost(g, aOld, aRef, p) {
    var d = Math.abs(aRef - aOld);
    var on = p < 1 && d > 0.012;
    g.pivot.visible = on;
    if (on) {
      g.pivot.rotation.y = aOld;
      var k = clamp(d / 0.10, 0, 1) * g.base;   // Staerke ~ Schwenkgeschwindigkeit
      g.mats[0].opacity = k; g.mats[1].opacity = k;
    }
  }

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;

    if (phase === 'opening' || frozenP !== null) {
      // Gesamt-Fortschritt ueber der 2000ms-Timeline (frozenP = Anteil davon)
      var ms = frozenP !== null ? frozenP * OPEN_TOTAL : (now - openStart);
      var tMs = Math.max(0, ms - HOLD_MS);   // 350ms Hold: Karte steht erst still
      var tL = clamp(tMs / SWING_L_MS, 0, 1);
      var tR = clamp(tMs / SWING_R_MS, 0, 1);
      pivL.rotation.y = wingAngleL(ms);   // links schwingt schneller auf (auf den Betrachter zu, wie v3)
      pivR.rotation.y = wingAngleR(ms);   // rechts hinkt hinterher
      var p = tR; // globaler Fortschritt = langsamer rechter Fluegel
      // Nachzieher positionieren (45/90ms hinter dem aktuellen Stand)
      setGhost(ghL[0], wingAngleL(ms - 45), pivL.rotation.y, p);
      setGhost(ghL[1], wingAngleL(ms - 90), wingAngleL(ms - 45), p);
      setGhost(ghR[0], wingAngleR(ms - 45), pivR.rotation.y, p);
      setGhost(ghR[1], wingAngleR(ms - 90), wingAngleR(ms - 45), p);
      // v3: Kamera schiebt durch das Tor; Karte laeuft dabei aus dem Fokus
      camera.position.z = z0 * (1 - 0.58 * smooth((p - 0.22) / 0.78));
      // v3: Tiefenschaerfe beim Heranfahren, max ~10px ab p>0.2
      var blur = p > 0.2 ? Math.pow(smooth((p - 0.2) / 0.7), 1.1) * 10 : 0;
      glCanvas.style.filter = blur > 0.05 ? 'blur(' + blur.toFixed(1) + 'px)' : '';
      // v3: Sway klingt multiplikativ aus
      cardGroup.rotation.y *= 0.85; cardGroup.rotation.x *= 0.85;
      if (blobShadow) blobShadow.material.opacity = 1 - smooth(p * 1.7);
      // Name (Live-Ebene) loest sich auf, nur Opacity
      var kn = 1 - smooth((p - 0.15) / 0.35);
      cardname.style.opacity = kn;
      cardname.style.visibility = kn > 0.01 ? 'visible' : 'hidden';
      // v3: Welt blendet synchron zur Oeffnung ein
      sceneImg.style.opacity = smooth(p * 2.2);
      // Rack-Focus: Welt startet unscharf (DOF) und wird beim Durchflug scharf
      var sb = SCENE_BLUR0 * (1 - smooth((p - 0.18) / 0.6));
      sceneEl.style.filter = sb > 0.05 ? 'blur(' + sb.toFixed(1) + 'px)' : '';
      sceneEl.style.transform = sb > 0.05 ? 'scale(1.04)' : '';
      // v3: Karte fadet im letzten Fuenftel aus
      glCanvas.style.opacity = p > 0.8 ? Math.max(0, 1 - (p - 0.8) / 0.2) : 1;
      if (p >= 1 && frozenP === null) endOpening();
    }
    if (phase !== 'flight' && phase !== 'landing' && phase !== 'player') renderFrame(dt);
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
  //  Flug: Video (Max' KI-Clip) oder Standbild-Platzhalter
  // ============================================================
  var videoOK = false;

  flightVideo.addEventListener('playing', function () {
    videoOK = true;
    if (phase === 'opening' || phase === 'flight') flightVideo.style.opacity = 1;
  });
  flightVideo.addEventListener('error', function () { videoOK = false; });
  // Letztes Videobild (fertige Szene) bleibt stehen, Player-Karte landet
  flightVideo.addEventListener('ended', function () {
    if (phase === 'flight') landCard();
  });
  flightVideo.addEventListener('stalled', function () {
    // haengt das Video, landet die Karte trotzdem (Watchdog laeuft)
  });

  // ============================================================
  //  Schnee-Endszene: Flocken -> Haube auf dem Player -> abkippende Klumpen
  //  Eigenes minimales Partikelsystem (kein Framework). Eigener rAF-Loop,
  //  weil die Hauptschleife in der Flugphase steht. Pausiert bei verstecktem Tab.
  //  Physik der Rundung (Max 08:12): Haube nur auf dem GERADEN Teil der
  //  Oberkante; Flocken im border-radius-Bereich rutschen der Kurve folgend
  //  seitlich ab; Klumpen brechen bevorzugt an den Ecken und fallen entlang
  //  der Rundung.
  // ============================================================
  var snowRaf = null, snowCtx = null, snowOn = false;
  var flakes = [], clumps = [], sliders = [], pile = null;
  var cardRect = null, cardRectT = 0;
  var BIN = 7;                 // Breite eines Hauben-Bins in px
  var GRAV = 620;              // Gravitation px/s^2

  function snowResize() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var r = snowFxCv.getBoundingClientRect();
    snowFxCv.width = Math.max(1, Math.round(r.width * dpr));
    snowFxCv.height = Math.max(1, Math.round(r.height * dpr));
    snowCtx = snowFxCv.getContext('2d');
    snowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pile = null; // Hauben-Bins beim Resize neu aufsetzen
  }

  function flakeCount() {
    var mobile = Math.min(window.innerWidth, window.innerHeight) < 620;
    return mobile ? SNOW.flakesMobile : SNOW.flakesDesktop;
  }

  function spawnFlake(anywhere) {
    var r = snowFxCv.getBoundingClientRect();
    return {
      x: Math.random() * r.width,
      y: anywhere ? Math.random() * r.height : -6 - Math.random() * 30,
      vy: 26 + Math.random() * 34,
      drift: 10 + Math.random() * 22,
      phase: Math.random() * Math.PI * 2,
      size: 1.1 + Math.random() * 1.9
    };
  }

  // gerader Abschnitt der Oberkante (ohne Ecken-Radius)
  function straightL() { return cardRect.left + cardRect.radius; }
  function straightR() { return cardRect.left + cardRect.width - cardRect.radius; }

  function ensurePile() {
    if (!cardRect) return;
    var w = Math.max(10, straightR() - straightL());
    var n = Math.max(4, Math.ceil(w / BIN));
    if (!pile || pile.length !== n) {
      pile = new Array(n);
      for (var i = 0; i < n; i++) pile[i] = 0;
    }
  }

  function refreshCardRect(now) {
    if (now - cardRectT > 400) {
      cardRectT = now;
      var el = document.getElementById('card');
      var cr = el.getBoundingClientRect();
      var cs = getComputedStyle(el);
      var rad = parseFloat(cs.borderTopLeftRadius) || 0;
      rad = Math.max(rad, parseFloat(cs.borderTopRightRadius) || 0);
      var stageR = stage.getBoundingClientRect();
      cardRect = {
        left: cr.left - stageR.left,
        top: cr.top - stageR.top,
        width: cr.width,
        height: cr.height,
        radius: Math.min(rad, cr.width / 2)
      };
      ensurePile();
    }
  }

  // Kurven-Oberflaeche im Eckenbereich: Kreisbogen des border-radius
  // Seite: -1 links, +1 rechts. Gibt y der Bogenoberflaeche bei x zurueck.
  function cornerCurveY(x, side) {
    var cx = side < 0 ? straightL() : straightR();
    var dx = side < 0 ? (cx - x) : (x - cx);   // 0 am geraden Ende, R aussen
    var R = cardRect.radius;
    if (dx < 0 || dx > R) return null;
    return cardRect.top + R - Math.sqrt(Math.max(0, R * R - dx * dx));
  }

  function inCornerZone(x) {
    if (!cardRect) return 0;
    if (x >= cardRect.left && x < straightL()) return -1;
    if (x > straightR() && x <= cardRect.left + cardRect.width) return 1;
    return 0;
  }

  // Slider: Partikel/Klumpen, der dem Ecken-Kreisbogen folgt
  function spawnSlider(x, r, side) {
    var R = cardRect.radius;
    var cx = side < 0 ? straightL() : straightR();
    var dx = Math.max(0, Math.min(R, side < 0 ? cx - x : x - cx));
    sliders.push({
      side: side,
      a: Math.asin(dx / R),          // 0 = oben, PI/2 = seitlich
      om: 0.6 + Math.random() * 0.5, // Winkelgeschwindigkeit rad/s
      r: r
    });
  }

  function deposit(x) {
    if (!pile || !cardRect) return false;
    if (x < straightL() || x > straightR()) return false;
    var i = Math.min(pile.length - 1, Math.max(0, Math.floor((x - straightL()) / BIN)));
    pile[i] += 0.55;
    if (i > 0) pile[i - 1] += 0.18;
    if (i < pile.length - 1) pile[i + 1] += 0.18;
    // harte Decke: kein Bin darf ueber capMax wachsen (sonst Saeulen bis Bildrand)
    if (pile[i] > SNOW.capMax) pile[i] = SNOW.capMax;
    if (i > 0 && pile[i - 1] > SNOW.capMax) pile[i - 1] = SNOW.capMax;
    if (i < pile.length - 1 && pile[i + 1] > SNOW.capMax) pile[i + 1] = SNOW.capMax;
    return true;
  }

  // Abkippen: bevorzugt nahe den Ecken; der Klumpen rutscht auf den Bogen
  function maybeTip() {
    if (!pile || !cardRect) return;
    var n = pile.length;
    for (var i = 0; i < n; i++) {
      var h = pile[i];
      if (h < 2) continue;
      var edgeDist = Math.min(i, n - 1 - i) / (n / 2);      // 0 = Ecke, 1 = Mitte
      var edgeBias = 1 + 3 * (1 - edgeDist);                // Ecken kippen 4x so gern
      var threshold = SNOW.capMax - 4 * (1 - edgeDist);     // Ecken frueher
      if (h >= threshold || (h > SNOW.clumpMin * 0.7 && Math.random() < 0.0015 * edgeBias)) {
        var take = Math.min(h, 6 + Math.random() * 6);
        pile[i] = Math.max(0, pile[i] - take);
        if (i > 0 && pile[i - 1] > 1) pile[i - 1] = Math.max(0, pile[i - 1] - take * 0.25);
        if (i < n - 1 && pile[i + 1] > 1) pile[i + 1] = Math.max(0, pile[i + 1] - take * 0.25);
        var x = straightL() + i * BIN + BIN / 2;
        var r = 2.5 + take * 0.45;
        if (edgeDist < 0.35) {
          // nahe der Ecke: direkt auf den Bogen setzen
          spawnSlider(i < n / 2 ? straightL() - 1 : straightR() + 1, r, i < n / 2 ? -1 : 1);
        } else {
          clumps.push({
            x: x, y: cardRect.top - Math.max(0, h - take) - 3,
            r: r,
            vx: (Math.random() - 0.5) * 20,
            vy: 12,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 3
          });
        }
      }
    }
  }

  function drawBlob(x, y, r, alpha) {
    snowCtx.globalAlpha = alpha;
    snowCtx.beginPath();
    snowCtx.arc(x, y, r, 0, Math.PI * 2);
    if (r > 3) snowCtx.arc(x + r * 0.6, y - r * 0.35, r * 0.7, 0, Math.PI * 2);
    snowCtx.fillStyle = 'rgba(255,255,255,0.95)';
    snowCtx.fill();
    snowCtx.globalAlpha = 1;
  }

  function snowStep(now, dt) {
    var r = snowFxCv.getBoundingClientRect();
    var W = r.width, H = r.height;
    snowCtx.clearRect(0, 0, W, H);
    // Erst sammeln, wenn die Player-Karte gelandet ist - vorher nur Schneefall
    var cardLive = (phase === 'landing' || phase === 'player');

    // Flocken bewegen
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.phase += dt * 0.9;
      f.x += Math.sin(f.phase) * f.drift * dt;
      f.y += f.vy * dt;

      var done = false;
      if (cardLive && cardRect) {
        var side = inCornerZone(f.x);
        if (side !== 0) {
          // Eckenzone: auf der Kurve landen -> seitlich abrutschen
          var cy = cornerCurveY(f.x, side);
          if (cy !== null && f.y >= cy - 1) {
            spawnSlider(f.x, f.size, side);
            done = true;
          }
        } else if (pile && f.x >= straightL() && f.x <= straightR()) {
          var bi = Math.min(pile.length - 1, Math.max(0, Math.floor((f.x - straightL()) / BIN)));
          if (f.y >= cardRect.top - pile[bi] - 1) { deposit(f.x); done = true; }
        }
      }
      if (done || f.y > H + 6) { flakes[i] = spawnFlake(false); continue; }

      snowCtx.beginPath();
      snowCtx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      snowCtx.fillStyle = 'rgba(255,255,255,0.85)';
      snowCtx.fill();
    }

    if (cardLive) maybeTip();
    if (snowForce && pile) { var m = 0; for (var pi = 0; pi < pile.length; pi++) if (pile[pi] > m) m = pile[pi]; window.__pileMax = m; }

    // Slider: entlang des Kreisbogens beschleunigen, an der Seite abloesen
    for (var s = sliders.length - 1; s >= 0; s--) {
      var sl = sliders[s];
      var R = cardRect ? cardRect.radius : 20;
      sl.om += (GRAV * Math.sin(sl.a) / R) * dt;   // tangentiale Beschleunigung
      sl.a += sl.om * dt;
      var cx = sl.side < 0 ? straightL() : straightR();
      var px = cx - sl.side * R * Math.sin(sl.a);
      var py = cardRect.top + R - R * Math.cos(sl.a);
      if (sl.a >= Math.PI / 2 * 0.98) {
        // am Ende der Rundung: als freier Klumpen weiterfallen
        var v = sl.om * R;
        clumps.push({
          x: px, y: py, r: sl.r,
          vx: -sl.side * Math.max(6, v * 0.15),
          vy: Math.max(30, v),
          rot: 0, vr: (Math.random() - 0.5) * 3
        });
        sliders.splice(s, 1);
        continue;
      }
      drawBlob(px, py, sl.r, 0.95);
    }

    // Klumpen: Gravitation, Rotation, ggf. auf die Rundung umgreifen
    for (var j = clumps.length - 1; j >= 0; j--) {
      var cl = clumps[j];
      cl.vy += GRAV * dt;
      cl.y += cl.vy * dt;
      cl.x += cl.vx * dt;
      cl.rot += cl.vr * dt;
      if (cardRect) {
        var cside = inCornerZone(cl.x);
        if (cside !== 0 && cl.y < cardRect.top + cardRect.radius) {
          var cy2 = cornerCurveY(cl.x, cside);
          if (cy2 !== null && cl.y >= cy2 - 2) {
            spawnSlider(cl.x, cl.r, cside);
            clumps.splice(j, 1);
            continue;
          }
        }
      }
      var fade = 1;
      if (cardRect && cl.y > cardRect.top + 10) fade = Math.max(0, 1 - (cl.y - cardRect.top - 10) / 90);
      if (fade <= 0 || cl.y > H + 20) { clumps.splice(j, 1); continue; }
      clumps[j].rot = cl.rot;
      snowCtx.save();
      snowCtx.translate(cl.x, cl.y);
      snowCtx.rotate(cl.rot);
      drawBlob(0, 0, cl.r, fade);
      snowCtx.restore();
    }

    // Haube: nur auf dem geraden Abschnitt der Oberkante
    if (cardLive && pile && cardRect && cardRect.width > 0) {
      snowCtx.beginPath();
      snowCtx.moveTo(straightL(), cardRect.top + 2);
      for (var b = 0; b < pile.length; b++) {
        var bx = straightL() + b * BIN + BIN / 2;
        var by = cardRect.top + 1 - pile[b];
        if (b === 0) snowCtx.lineTo(bx, by);
        else snowCtx.quadraticCurveTo(straightL() + b * BIN, cardRect.top + 1 - pile[b - 1], bx, by);
      }
      snowCtx.lineTo(straightR(), cardRect.top + 2);
      snowCtx.closePath();
      snowCtx.fillStyle = 'rgba(255,255,255,0.96)';
      snowCtx.fill();
    }
  }

  var snowLast = 0;
  function snowLoop(now) {
    if (!snowOn) { snowRaf = null; return; }
    snowRaf = requestAnimationFrame(snowLoop);
    var dt = Math.min(0.05, (now - snowLast) / 1000 || 0.016);
    snowLast = now;
    refreshCardRect(now);
    snowStep(now, dt);
  }

  var snowIv = null;
  function startSnow() {
    if (!SNOW.enabled || snowOn) return;
    snowOn = true;
    snowResize();
    var want = flakeCount();
    flakes = [];
    for (var i = 0; i < want; i++) flakes.push(spawnFlake(true));
    clumps = []; sliders = [];
    snowLast = performance.now();
    snowRaf = requestAnimationFrame(snowLoop);
    if (snowForce) {
      // Debug-Treiber: rAF schlaeft in versteckten Tabs, Intervall laeuft (gedrosselt) weiter
      snowIv = setInterval(function () {
        if (!snowOn) return;
        for (var k = 0; k < 10; k++) snowStep(performance.now(), 0.05);
      }, 500);
    }
  }

  function stopSnow() {
    snowOn = false;
    if (snowIv !== null) { clearInterval(snowIv); snowIv = null; }
    if (snowRaf !== null) { cancelAnimationFrame(snowRaf); snowRaf = null; }
    if (snowCtx) {
      var r = snowFxCv.getBoundingClientRect();
      snowCtx.clearRect(0, 0, r.width, r.height);
    }
    flakes = []; clumps = []; sliders = []; pile = null;
  }

  // Pausieren bei verstecktem Tab
  document.addEventListener('visibilitychange', function () {
    if (!SNOW.enabled || snowForce) return;
    if (document.hidden) {
      if (snowRaf !== null) { cancelAnimationFrame(snowRaf); snowRaf = null; }
    } else if (snowOn && snowRaf === null) {
      snowLast = performance.now();
      snowRaf = requestAnimationFrame(snowLoop);
    }
  });
  window.addEventListener('resize', function () { if (snowOn) snowResize(); });

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

    // Flug-Video mit Ton starten (User-Geste durch Antippen; fehlt die Datei, bleibt das Standbild)
    try {
      flightVideo.muted = false;
      flightVideo.volume = 1;
      var fv = flightVideo.play();
      if (fv && fv.catch) fv.catch(function () {});
    } catch (e) {}

    if (renderer) {
      swayOn = false;
      swayRotY = cardGroup.rotation.y; swayRotX = cardGroup.rotation.x;
      tapTime = performance.now();
      glCanvas.style.opacity = 1;
      openStart = tapTime + HOLD_MS;   // Anticipation-Hold: Karte steht 350ms
      // Rack-Focus ab jetzt: Welt unscharf, bis die Oeffnung den Fokus nach hinten zieht
      sceneEl.style.filter = 'blur(' + SCENE_BLUR0 + 'px)';
      sceneEl.style.transform = 'scale(1.04)';
    } else {
      // Fallback ohne WebGL: statische Karte ausblenden, Szene direkt zeigen
      fallback.style.transition = 'opacity .8s ease';
      fallback.style.opacity = 0;
      cardname.style.opacity = 0;
      cardname.style.visibility = 'hidden';
      sceneImg.style.opacity = 1;
      sceneEl.style.filter = '';
      sceneEl.style.transform = '';
      startSnow();
      clearTimeout(flightTimer);
      flightTimer = setTimeout(landCard, PLACEHOLDER_MS);
    }
  }

  function endOpening() {
    phase = 'flight';
    glCanvas.style.opacity = 0;
    sceneImg.style.opacity = 1;
    sceneEl.style.filter = '';
    sceneEl.style.transform = '';
    if (ghL.length) {
      ghL[0].pivot.visible = false; ghL[1].pivot.visible = false;
      ghR[0].pivot.visible = false; ghR[1].pivot.visible = false;
    }
    stopLoop();
    startSnow();
    clearTimeout(flightTimer);
    flightTimer = setTimeout(flightWatchdog, PLACEHOLDER_MS);
  }

  // Watchdog: bei Video landet 'ended' frueher; Standbild oder Video-Haenger -> Timer.
  // Laeuft das Video noch, wird der Timer auf das Restende verlaengert.
  function flightWatchdog() {
    if (phase !== 'flight') return;
    if (videoOK && !flightVideo.paused && !flightVideo.ended &&
        isFinite(flightVideo.duration) && flightVideo.duration > 0 &&
        flightVideo.currentTime < flightVideo.duration - 0.4) {
      flightTimer = setTimeout(flightWatchdog,
        (flightVideo.duration - flightVideo.currentTime) * 1000 + 1200);
      return;
    }
    landCard();
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
    stopSnow();
    flightVideo.pause();
    try { flightVideo.currentTime = 0; } catch (e) {}
    flightVideo.style.opacity = 0;
    sceneImg.style.opacity = 0;
    sceneEl.style.filter = '';
    sceneEl.style.transform = '';
    cardname.style.opacity = 1;
    cardname.style.filter = '';
    cardname.style.visibility = 'visible';
    veil.classList.remove('is-on');
    card.classList.remove('is-in');
    cardWrap.setAttribute('aria-hidden', 'true');
    if (renderer) {
      frozenP = null;
      pivL.rotation.y = 0; pivR.rotation.y = 0;
      if (ghL.length) {
        ghL[0].pivot.visible = false; ghL[1].pivot.visible = false;
        ghR[0].pivot.visible = false; ghR[1].pivot.visible = false;
      }
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
      sceneImg.style.opacity = 1;
      sceneEl.style.filter = '';
      sceneEl.style.transform = '';
    }
    if (debugState === 'player') {
      if (renderer) { stopLoop(); glCanvas.style.opacity = 0; }
      else fallback.style.opacity = 0;
      cardname.style.opacity = 0;
      cardname.style.visibility = 'hidden';
      sceneImg.style.opacity = 1;
      sceneEl.style.filter = '';
      sceneEl.style.transform = '';
      phase = 'flight';
      startSnow();
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

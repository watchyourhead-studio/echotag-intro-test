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
  // ---------- Oeffnung, live ueber das Panel aenderbar ----------
  // Etwas langsamer als die letzte Film-Messung. Tempo 1 benutzt diese Millisekunden.
  var TUNE = {
    hold: 220,
    left: 2200,
    right: 2320,
    tempo: 0.7,
    angle: 170,
    camStart: 0,
    camPush: 0,
    sceneAt: 0
  };
  function tuneScale() { return Math.max(0.25, TUNE.tempo); }
  function holdMs() { return TUNE.hold / tuneScale(); }
  function swingL() { return TUNE.left / tuneScale(); }
  function swingR() { return TUNE.right / tuneScale(); }
  function openTotal() { return holdMs() + swingR(); }
  function openAngle() { return TUNE.angle * Math.PI / 180; }
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
  var THICK = 0.030;      // schmale Kante wie im V2-Film, kein dicker weisser Kern
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
  var openEase = cubicBezier(0.40, 0.30, 0.80, 0.75);
  function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  function setHint(text, loading) {
    hint.textContent = text;
    hint.classList.toggle('is-loading', !!loading);
  }

  // ============================================================
  //  Texturen: Karton. Farbe aus CONFIG, Faser von der V2-Karte,
  //  Falz wie dort vermessen. Der Empfaengername bleibt Live-Ebene.
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
  var paperTile = null; // Graustufen-Faser aus der fotografierten V2-Karte
  var creasePx = null, creaseW = 0, creaseH = 0;
  var CREASE_DX0 = -16; // Pixel 0 der Falz-Karte = 16px links der Rinne (an card-front gemessen)
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

  // Faser 1:1 zur fotografierten Karte: die Kachel stammt pixelgleich aus card-front.
  function coverGrain(ctx, w, h, alpha) {
    ctx.save();
    if (paperTile) {
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'overlay';
      var s = w / CARD_W;
      var dw = paperTile.width * s;
      var dh = paperTile.height * s;
      for (var y = 0; y < h; y += dh) {
        for (var x = 0; x < w; x += dw) ctx.drawImage(paperTile, x, y, dw, dh);
      }
    } else {
      if (!grainPat) makeGrain(ctx);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = grainPat;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  // Ganz leichter Randabfall wie bei einem Foto von Karton, kein Verlaufs-Panel.
  function softenEdges(ctx, w, h, amount) {
    var g = ctx.createRadialGradient(w * 0.5, h * 0.46, w * 0.2, w * 0.5, h * 0.5, h * 0.76);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.78, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(30,8,12,' + amount + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Buchdruck: Farbe sitzt im Papier, mit kleinem Licht- und Schattenversatz.
  function letterpress(ctx, text, cx, y, size, spacing) {
    ctx.save();
    ctx.font = '500 ' + size + 'px Jost';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(42, 10, 14, 0.5)';
    drawSpaced(ctx, text, cx + size * 0.012, y + size * 0.016, spacing);
    ctx.fillStyle = 'rgba(255, 236, 220, 0.32)';
    drawSpaced(ctx, text, cx - size * 0.008, y - size * 0.012, spacing);
    ctx.fillStyle = 'rgba(246, 241, 232, 0.94)';
    drawSpaced(ctx, text, cx, y, spacing);
    ctx.restore();
  }

  // Falzstreifen aus dem V2-Foto: duenne, ausgefranste Rinne, kein gerader Verlauf.
  function captureCrease(img) {
    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    var x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    var id = x.getImageData(0, 0, c.width, c.height);
    creasePx = id.data;
    creaseW = c.width;
    creaseH = c.height;
  }

  function creaseFactor(dx, sy) {
    var sx = Math.round(dx - CREASE_DX0);
    if (sx < 0 || sx >= creaseW) return 1;
    sy = sy < 0 ? 0 : (sy > creaseH - 1 ? creaseH - 1 : sy);
    return creasePx[(sy * creaseW + sx) * 4] / 128;
  }

  // Uebernimmt die gemessene Schattierung Zeile fuer Zeile, inklusive der kleinen Ausfransung.
  function shadeStock(ctx, w, h, strength) {
    if (!creasePx) return;
    var img = ctx.getImageData(0, 0, w, h);
    var d = img.data;
    var scale = w / CARD_W;
    var cx = (w - 1) / 2;
    var reach = (creaseW + 2) * scale;
    var x0 = Math.max(0, Math.floor(cx - reach));
    var x1 = Math.min(w - 1, Math.ceil(cx + reach));
    for (var y = 0; y < h; y++) {
      var sy = Math.min(creaseH - 1, Math.floor(y * creaseH / h));
      var row = y * w;
      for (var x = x0; x <= x1; x++) {
        var raw = creaseFactor((x - cx) / scale, sy);
        var factor = 1 + (raw - 1) * strength;
        if (factor > 1) factor = 1 + (factor - 1) * 0.28;
        var i = (row + x) * 4;
        d[i] = Math.min(255, d[i] * factor);
        d[i + 1] = Math.min(255, d[i + 1] * factor);
        d[i + 2] = Math.min(255, d[i + 2] * factor);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // Normalmap aus derselben unregelmaessigen Rinne, nur ganz leicht,
  // damit das Licht den Knick nicht zu einer perfekten Fase macht.
  function makeFrontNormal() {
    var w = 905, h = 1600;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, w, h);
    if (!creasePx) return c;
    var cx = (w - 1) / 2;
    var band = 20;
    var x0 = Math.max(0, Math.floor(cx - band));
    var x1 = Math.min(w - 1, Math.ceil(cx + band));
    var sw = x1 - x0 + 1;
    var out = ctx.createImageData(sw, h);
    var od = out.data;
    var bump = 0.85;
    function heightAt(px, sy) {
      return 0.5 + (creaseFactor(px - cx, sy) - 1) * 0.5;
    }
    for (var y = 0; y < h; y++) {
      var sy = Math.min(creaseH - 1, Math.floor(y * creaseH / h));
      var row = y * sw;
      for (var x = x0; x <= x1; x++) {
        var ddx = heightAt(x + 1, sy) - heightAt(x - 1, sy);
        var nx = -ddx * bump;
        var nz = 1;
        var len = Math.sqrt(nx * nx + nz * nz);
        var i = (row + (x - x0)) * 4;
        od[i] = (nx / len * 0.5 + 0.5) * 255;
        od[i + 1] = 128;
        od[i + 2] = (nz / len * 0.5 + 0.5) * 255;
        od[i + 3] = 255;
      }
    }
    ctx.putImageData(out, x0, 0);
    return c;
  }

  // Vorderseite: eine Farbe, echtes Papier, Falz durch die Wortmarke.
  // Der Empfaengername ist eine Live-Textebene (Jost) und wird nicht eingebrannt.
  function bakeFront() {
    var S = 2;
    var cv = document.createElement('canvas');
    cv.width = CARD_W * S; cv.height = CARD_H * S;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = COLORS.card;
    ctx.fillRect(0, 0, cv.width, cv.height);
    coverGrain(ctx, cv.width, cv.height, 0.88);
    softenEdges(ctx, cv.width, cv.height, 0.12);
    // Wortmarke dort, wo bei der Vorlage das Bart-&-Bastian-Logo sass.
    // Der Falz wird danach daruebergelegt und teilt den Schriftzug.
    letterpress(ctx, 'ECHOTAG', cv.width / 2, 1010 * S, 34 * S, 16 * S);
    shadeStock(ctx, cv.width, cv.height, 1);
    roundCorners(ctx, cv.width, cv.height);
    return cv;
  }

  // Empfaengername: eigene Druckebene, zur Laufzeit aus dem Namen erzeugt.
  // Liegt auf den Fluegeln, klappt also mit, ist aber nicht Teil der Karten-Textur.
  function bakeName(label) {
    var S = 2;
    var cv = document.createElement('canvas');
    cv.width = CARD_W * S; cv.height = CARD_H * S;
    var ctx = cv.getContext('2d');
    var name = String(label || 'Julia').toUpperCase();
    var maxW = cv.width * 0.82;
    var size = Math.round(cv.height * 0.057);
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 ' + size + 'px Jost';
    while (ctx.measureText(name).width > maxW && size > 28) {
      size -= 2;
      ctx.font = '600 ' + size + 'px Jost';
    }
    var nameY = Math.round(cv.height * 0.545);
    ctx.fillStyle = 'rgba(42, 12, 16, 0.4)';
    ctx.fillText(name, (cv.width - ctx.measureText(name).width) / 2 + size * 0.012, nameY + size * 0.02);
    ctx.fillStyle = '#f3eee4';
    ctx.fillText(name, (cv.width - ctx.measureText(name).width) / 2, nameY);

    var fuerSize = Math.round(cv.height * 0.0186);
    var fuerY = Math.round(cv.height * 0.468);
    ctx.font = '500 ' + fuerSize + 'px Jost';
    ctx.fillStyle = 'rgba(42, 12, 16, 0.4)';
    drawSpaced(ctx, 'FÜR', cv.width / 2 + 1, fuerY + 1, Math.round(fuerSize * 0.45));
    ctx.fillStyle = '#f3eee4';
    drawSpaced(ctx, 'FÜR', cv.width / 2, fuerY, Math.round(fuerSize * 0.45));

    if (paperTile) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = 0.55;
      var s = cv.width / CARD_W;
      var dw = paperTile.width * s;
      var dh = paperTile.height * s;
      for (var y = 0; y < cv.height; y += dh) {
        for (var x = 0; x < cv.width; x += dw) ctx.drawImage(paperTile, x, y, dw, dh);
      }
      ctx.restore();
    }
    imprintCrease(ctx, cv.width, cv.height, 1);
    return cv;
  }

  function imprintCrease(ctx, w, h, strength) {
    if (!creasePx) return;
    var img = ctx.getImageData(0, 0, w, h);
    var d = img.data;
    var scale = w / CARD_W;
    var cx = (w - 1) / 2;
    for (var y = 0; y < h; y++) {
      var sy = Math.min(creaseH - 1, Math.floor(y * creaseH / h));
      var row = y * w;
      for (var x = 0; x < w; x++) {
        var i = (row + x) * 4;
        if (d[i + 3] < 8) continue;
        var raw = creaseFactor((x - cx) / scale, sy);
        var factor = 1 + (raw - 1) * strength;
        if (factor > 1) factor = 1 + (factor - 1) * 0.28;
        d[i] = Math.min(255, d[i] * factor);
        d[i + 1] = Math.min(255, d[i + 1] * factor);
        d[i + 2] = Math.min(255, d[i + 2] * factor);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  function bakeBack() {
    var S = 2;
    var cv = document.createElement('canvas');
    cv.width = CARD_W * S; cv.height = CARD_H * S;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = COLORS.cream;
    ctx.fillRect(0, 0, cv.width, cv.height);
    coverGrain(ctx, cv.width, cv.height, 0.42);
    softenEdges(ctx, cv.width, cv.height, 0.07);
    shadeStock(ctx, cv.width, cv.height, 0.62);
    roundCorners(ctx, cv.width, cv.height);
    return cv;
  }

  // Schnittkante wie im V2-Film: dieselbe Farbe wie die Front, zur Spalte hin fast schwarz.
  // Kein heller Kartonkern — dort ist die Kante ein dunkler Schatten der Kartenfarbe.
  function paperEdge(dw, dh, along) {
    var c = document.createElement('canvas');
    c.width = dw; c.height = dh;
    var x = c.getContext('2d');
    var g = along === 'h'
      ? x.createLinearGradient(0, 0, 0, dh)
      : x.createLinearGradient(0, 0, dw, 0);
    g.addColorStop(0, '#5c1a21');
    g.addColorStop(0.35, '#3c1218');
    g.addColorStop(1, '#140608');
    x.fillStyle = g;
    x.fillRect(0, 0, dw, dh);
    if (paperTile) {
      x.save();
      x.globalAlpha = 0.22;
      x.globalCompositeOperation = 'multiply';
      x.drawImage(paperTile, 0, 0, dw, dh);
      x.restore();
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
  var nameTex = null;
  var nameOnCard = false;
  var printName = null;
  var ghL = [], ghR = [];
  // Tiefenschaerfe nur auf der Karte: Fokus = geschlossene Ebene (z=0).
  // Weiter vorn (Falz) weicher, Aussenkante scharf. Die DOM-Szene bleibt ungefiltert.
  var dofTarget = null, dofScene = null, dofCam = null, dofUniforms = null;
  var dofFocus = null, dofSize = null;
  var DOF_APERTURE = 0.046;

  // Innenflaeche: Falz (Texturmitte) auf das Scharnier, nicht in die Fluegelmitte.
  function hingeUV(geo, side) {
    geo.computeBoundingBox();
    var pos = geo.attributes.position;
    var uv = geo.attributes.uv;
    var minX = geo.boundingBox.min.x;
    var span = geo.boundingBox.max.x - minX || 1;
    for (var i = 0; i < uv.count; i++) {
      var t = (pos.getX(i) - minX) / span;
      uv.setX(i, side === 'L' ? t * 0.5 : 0.5 + t * 0.5);
    }
    uv.needsUpdate = true;
  }

  function initGL(frontCanvas, backCanvas, normalCanvas, nameCanvas) {
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

    var frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.84, metalness: 0, alphaTest: 0.5 });
    if (normalCanvas) {
      var nTex = new THREE.CanvasTexture(normalCanvas);
      nTex.anisotropy = 4;
      frontMat.normalMap = nTex;
      frontMat.normalScale = new THREE.Vector2(0.12, 0.12);
    }
    var backMatL = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.9, metalness: 0, alphaTest: 0.5 });
    var backMatR = backMatL.clone();

    var nameMat = null;
    if (nameCanvas) {
      printName = nameCanvas;
      nameTex = new THREE.CanvasTexture(nameCanvas);
      nameTex.encoding = THREE.sRGBEncoding;
      nameTex.anisotropy = frontTex.anisotropy;
      nameMat = new THREE.MeshStandardMaterial({
        map: nameTex,
        transparent: true,
        alphaTest: 0.2,
        roughness: 0.84,
        metalness: 0,
        depthWrite: false
      });
      nameOnCard = true;
    }

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
      // Drehachse an der Aussenkante. Der Fluegel reicht zur Mitte,
      // der Spalt oeffnet sich dort. Aussenkanten bleiben am Bildrand.
      var L = side === 'L';
      var xOff = L ? halfW / 2 : -halfW / 2;
      var pivot = new THREE.Group();

      var g = new THREE.PlaneGeometry(halfW, cardH);
      var uv = g.attributes.uv, i;
      for (i = 0; i < uv.count; i++) uv.setX(i, L ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
      g.translate(xOff, 0, 0);
      pivot.add(new THREE.Mesh(g, frontMat));

      if (nameMat) {
        var gn = new THREE.PlaneGeometry(halfW, cardH);
        var uvn = gn.attributes.uv, ni;
        for (ni = 0; ni < uvn.count; ni++) uvn.setX(ni, L ? uvn.getX(ni) * 0.5 : 0.5 + uvn.getX(ni) * 0.5);
        gn.translate(xOff, 0, 0.004);
        pivot.add(new THREE.Mesh(gn, nameMat));
      }

      var gb = new THREE.PlaneGeometry(halfW, cardH);
      gb.rotateY(Math.PI);
      gb.translate(xOff, 0, -THICK);
      hingeUV(gb, side);
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

    function ghostWing(side, base) {
      var L = side === 'L';
      var xOff = L ? halfW / 2 : -halfW / 2;
      var gp = new THREE.Group();
      function gm(src) {
        var m = src.clone();
        m.transparent = true; m.opacity = base;
        m.alphaTest = 0; m.depthWrite = false;
        return m;
      }
      var g = new THREE.PlaneGeometry(halfW, cardH);
      var uv = g.attributes.uv, i;
      for (i = 0; i < uv.count; i++) uv.setX(i, L ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
      g.translate(xOff, 0, 0);
      gp.add(new THREE.Mesh(g, gm(frontMat)));
      if (nameMat) {
        var gn = new THREE.PlaneGeometry(halfW, cardH);
        var uvn = gn.attributes.uv, ni;
        for (ni = 0; ni < uvn.count; ni++) uvn.setX(ni, L ? uvn.getX(ni) * 0.5 : 0.5 + uvn.getX(ni) * 0.5);
        gn.translate(xOff, 0, 0.004);
        var nm = gm(nameMat);
        nm.alphaTest = 0.2;
        gp.add(new THREE.Mesh(gn, nm));
      }
      gp.position.x = L ? -halfW : halfW;
      gp.visible = false;
      cardGroup.add(gp);
      return { pivot: gp, mats: gp.children.map(function (ch) { return ch.material; }), base: base };
    }
    ghL = [ghostWing('L', 0.08), ghostWing('L', 0.035)];
    ghR = [ghostWing('R', 0.08), ghostWing('R', 0.035)];

    dofFocus = new THREE.Vector3();
    dofSize = new THREE.Vector2();
    dofUniforms = {
      tColor: { value: null },
      tDepth: { value: null },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uFocus: { value: -8 },
      uPxPerUnit: { value: 400 },
      uAperture: { value: DOF_APERTURE },
      uRes: { value: new THREE.Vector2(1, 1) }
    };
    dofTarget = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false
    });
    dofTarget.texture.generateMipmaps = false;
    dofTarget.texture.encoding = THREE.sRGBEncoding;
    dofTarget.depthTexture = new THREE.DepthTexture(4, 4);
    dofUniforms.tColor.value = dofTarget.texture;
    dofUniforms.tDepth.value = dofTarget.depthTexture;
    var dofMat = new THREE.ShaderMaterial({
      uniforms: dofUniforms,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      vertexShader: [
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  gl_Position = vec4(position.xy, 0.0, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D tColor;',
        'uniform sampler2D tDepth;',
        'uniform float uNear;',
        'uniform float uFar;',
        'uniform float uFocus;',
        'uniform float uPxPerUnit;',
        'uniform float uAperture;',
        'uniform vec2 uRes;',
        'varying vec2 vUv;',
        'float perspectiveDepthToViewZ(const in float invClipZ, const in float near, const in float far) {',
        '  return (near * far) / ((far - near) * invClipZ - far);',
        '}',
        'void main() {',
        '  vec4 center = texture2D(tColor, vUv);',
        '  float depth = texture2D(tDepth, vUv).x;',
        '  float viewZ = perspectiveDepthToViewZ(depth, uNear, uFar);',
        '  float forward = max(viewZ - uFocus, 0.0);',
        '  float radius = forward * uPxPerUnit * uAperture;',
        '  if (radius < 0.8) {',
        '    gl_FragColor = center;',
        '    return;',
        '  }',
        '  vec2 texel = vec2(radius / 3.0) / uRes;',
        '  vec4 acc = vec4(0.0);',
        '  float wsum = 0.0;',
        '  for (int y = -3; y <= 3; y++) {',
        '    for (int x = -3; x <= 3; x++) {',
        '      float fx = float(x);',
        '      float fy = float(y);',
        '      float w = exp(-0.5 * (fx * fx + fy * fy) / 1.35);',
        '      acc += texture2D(tColor, vUv + vec2(fx, fy) * texel) * w;',
        '      wsum += w;',
        '    }',
        '  }',
        '  gl_FragColor = acc / wsum;',
        '}'
      ].join('\n')
    });
    dofScene = new THREE.Scene();
    dofCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    dofScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dofMat));

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
    if (dofTarget) {
      renderer.getDrawingBufferSize(dofSize);
      var dw = Math.max(1, dofSize.x), dh = Math.max(1, dofSize.y);
      if (dofTarget.width !== dw || dofTarget.height !== dh) {
        dofTarget.setSize(dw, dh);
        dofTarget.depthTexture.image.width = dw;
        dofTarget.depthTexture.image.height = dh;
        dofTarget.depthTexture.needsUpdate = true;
      }
      dofUniforms.uRes.value.set(dw, dh);
    }
  }

  var dofChecked = false;
  function renderFrame(dt) {
    if (swayOn) {
      swayT += dt;
      cardGroup.rotation.y = Math.sin(swayT * 0.55) * 0.035;
      cardGroup.rotation.x = Math.sin(swayT * 0.8) * 0.013;
    }
    glCanvas.style.filter = '';
    var spread = 0;
    if (pivL && pivR) {
      spread = Math.max(
        Math.sin(Math.min(Math.abs(pivL.rotation.y), Math.PI / 2)),
        Math.sin(Math.min(Math.abs(pivR.rotation.y), Math.PI / 2))
      );
    }
    // Geschlossen: direkt, mit MSAA, ohne Post. Offen: Karte in den Depth-Target, dann DOF.
    if (!dofTarget || spread < 0.01) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    renderer.getDrawingBufferSize(dofSize);
    dofUniforms.uNear.value = camera.near;
    dofUniforms.uFar.value = camera.far;
    renderer.setRenderTarget(dofTarget);
    renderer.render(scene, camera);
    if (!dofChecked) {
      dofChecked = true;
      var gl = renderer.getContext();
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        renderer.setRenderTarget(null);
        dofTarget = null;
        renderer.render(scene, camera);
        return;
      }
    }
    camera.updateMatrixWorld();
    dofFocus.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse);
    var dist = Math.max(0.05, Math.abs(dofFocus.z));
    dofUniforms.uFocus.value = dofFocus.z;
    dofUniforms.uPxPerUnit.value = (dofSize.y * 0.5) / (dist * Math.tan(camera.fov * Math.PI / 360));
    dofUniforms.uAperture.value = DOF_APERTURE;
    renderer.setRenderTarget(null);
    renderer.render(dofScene, dofCam);
  }

  // Schwenkwinkel als Funktion der Timeline (auch fuer Nachzieher nutzbar)
  function wingAngleL(ms) { var t = clamp((ms - holdMs()) / swingL(), 0, 1); return -openEase(t) * openAngle(); }
  function wingAngleR(ms) { var t = clamp((ms - holdMs()) / swingR(), 0, 1); return  openEase(t) * openAngle(); }

  function setGhost(g, aOld, aRef, p) {
    var d = Math.abs(aRef - aOld);
    var on = p < 1 && d > 0.012;
    g.pivot.visible = on;
    if (on) {
      g.pivot.rotation.y = aOld;
      var k = clamp(d / 0.10, 0, 1) * g.base;   // Staerke ~ Schwenkgeschwindigkeit
    g.mats.forEach(function (m) { m.opacity = k; });
    }
  }

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;

    if (phase === 'opening' || frozenP !== null) {
      // Gesamt-Fortschritt ueber der 2000ms-Timeline (frozenP = Anteil davon)
      var ms = frozenP !== null ? frozenP * openTotal() : (now - openStart);
      var tMs = ms - holdMs();
      var tL = clamp(tMs / swingL(), 0, 1);
      var tR = clamp(tMs / swingR(), 0, 1);
      pivL.rotation.y = wingAngleL(ms);
      pivR.rotation.y = wingAngleR(ms);
      glCanvas.style.filter = '';
      var p = tR; // globaler Fortschritt = langsamer rechter Fluegel
      // Nachzieher positionieren (45/90ms hinter dem aktuellen Stand)
      setGhost(ghL[0], wingAngleL(ms - 45), pivL.rotation.y, p);
      setGhost(ghL[1], wingAngleL(ms - 90), wingAngleL(ms - 45), p);
      setGhost(ghR[0], wingAngleR(ms - 45), pivR.rotation.y, p);
      setGhost(ghR[1], wingAngleR(ms - 90), wingAngleR(ms - 45), p);
      // Kamera erst spaet durch das Tor, die Karte bleibt waehrend des Knicks scharf (V2: max ~3px, zweite Haelfte)
      camera.position.z = z0 * (1 - TUNE.camPush * smooth((p - TUNE.camStart) / Math.max(0.05, 1 - TUNE.camStart)));
      sceneEl.style.filter = '';
      sceneEl.style.transform = '';
      sceneImg.style.filter = '';
      sceneImg.style.transform = '';
      flightVideo.style.filter = '';
      flightVideo.style.transform = '';
      // v3: Sway klingt multiplikativ aus
      cardGroup.rotation.y *= 0.85; cardGroup.rotation.x *= 0.85;
      if (blobShadow) blobShadow.material.opacity = 1 - smooth(p * 1.7);
      if (!nameOnCard) {
        var kn = 1 - smooth(clamp((tL - 0.05) / 0.27, 0, 1));
        cardname.style.opacity = kn;
        cardname.style.visibility = kn > 0.02 ? 'visible' : 'hidden';
        cardname.style.filter = kn < 0.98 ? 'blur(' + ((1 - kn) * 1.1).toFixed(2) + 'px)' : '';
      }
      sceneImg.style.opacity = smooth(clamp((tL - TUNE.sceneAt) / 0.20, 0, 1));
      glCanvas.style.opacity = p > 0.92 ? Math.max(0, 1 - (p - 0.92) / 0.08) : 1;
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
    if (phase === 'opening' || phase === 'flight' || phase === 'landing' || phase === 'player') flightVideo.style.opacity = 1;
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

    // Flug startet mit dem Tap (User-Geste, iOS) und laeuft hinter der Karte weiter.
    try {
      flightVideo.muted = false;
      flightVideo.volume = 1;
      flightVideo.currentTime = 0;
      var fv = flightVideo.play();
      if (fv && fv.catch) fv.catch(function () {});
    } catch (e) {}

    if (renderer) {
      swayOn = false;
      swayRotY = cardGroup.rotation.y; swayRotX = cardGroup.rotation.x;
      tapTime = performance.now();
      glCanvas.style.opacity = 1;
      openStart = tapTime;
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
    glCanvas.style.filter = '';
    sceneImg.style.opacity = 1;
    sceneEl.style.filter = '';
    sceneEl.style.transform = '';
    if (ghL.length) {
      ghL[0].pivot.visible = false; ghL[1].pivot.visible = false;
      ghR[0].pivot.visible = false; ghR[1].pivot.visible = false;
    }
    stopLoop();
    flightVideo.style.opacity = 1;
    if (flightVideo.paused) {
      try {
        var started = flightVideo.play();
        if (started && started.catch) started.catch(function () {});
      } catch (e) {}
    }
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
    cardname.style.opacity = nameOnCard ? 0 : 1;
    cardname.style.visibility = nameOnCard ? 'hidden' : 'visible';
    cardname.style.filter = '';
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

  function setRecipient(label) {
    recipient = String(label || 'Julia').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Julia';
    cardnameText.textContent = recipient.toUpperCase();
    if (nameTex) {
      printName = bakeName(recipient);
      nameTex.image = printName;
      nameTex.needsUpdate = true;
    }
  }

  function setupTune() {
    var root = document.getElementById('tune');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    try {
      var saved = JSON.parse(localStorage.getItem('echotag-v4-tune') || 'null');
      if (saved) {
        Object.keys(TUNE).forEach(function (k) {
          if (typeof saved[k] === 'number' && isFinite(saved[k])) TUNE[k] = saved[k];
        });
      }
    } catch (e) {}

    var fields = [
      ['hold', 'Stillstand', 0, 2000, 10],
      ['left', 'Links', 400, 5000, 10],
      ['right', 'Rechts', 400, 6000, 10],
      ['tempo', 'Tempo', 0.4, 1.8, 0.05],
      ['angle', 'Winkel', 110, 180, 1],
      ['camStart', 'Kamera ab', 0, 0.9, 0.01],
      ['camPush', 'Kamera-Zug', 0, 1, 0.01],
      ['sceneAt', 'Szene ab', 0, 0.6, 0.01]
    ];
    var body = document.getElementById('tuneBody');
    function save() {
      try { localStorage.setItem('echotag-v4-tune', JSON.stringify(TUNE)); } catch (err) {}
    }
    function showEffective() {
      var el = document.getElementById('tuneEffective');
      if (el) el.textContent = 'effektiv ' + Math.round(holdMs()) + ' ms still · links ' + Math.round(swingL()) + ' · rechts ' + Math.round(swingR());
    }
    fields.forEach(function (f) {
      var key = f[0], min = f[2], max = f[3], step = f[4];
      var row = document.createElement('label');
      row.className = 'tune-row';
      var lab = document.createElement('span');
      lab.textContent = f[1];
      var range = document.createElement('input');
      range.type = 'range';
      range.min = String(min); range.max = String(max); range.step = String(step);
      range.value = String(TUNE[key]);
      var num = document.createElement('input');
      num.type = 'number';
      num.min = String(min); num.max = String(max); num.step = String(step);
      num.value = String(TUNE[key]);
      function set(v) {
        if (!isFinite(v)) return;
        v = Math.min(max, Math.max(min, v));
        TUNE[key] = v;
        range.value = String(v);
        num.value = String(v);
        save();
        showEffective();
      }
      range.addEventListener('input', function () { set(parseFloat(range.value)); });
      num.addEventListener('input', function () { set(parseFloat(num.value)); });
      row.appendChild(lab);
      row.appendChild(range);
      row.appendChild(num);
      body.appendChild(row);
    });
    showEffective();

    var nameInput = document.getElementById('tuneName');
    nameInput.value = recipient;
    nameInput.addEventListener('change', function () { setRecipient(nameInput.value); });
    document.getElementById('tuneOpen').addEventListener('click', function () {
      replay();
      setTimeout(open, 80);
    });
    document.getElementById('tuneClose').addEventListener('click', replay);
    document.getElementById('tuneCopy').addEventListener('click', function () {
      var text = [
        'hold: ' + TUNE.hold,
        'links: ' + TUNE.left,
        'rechts: ' + TUNE.right,
        'tempo: ' + TUNE.tempo,
        'winkel: ' + TUNE.angle,
        'kameraAb: ' + TUNE.camStart,
        'kameraZug: ' + TUNE.camPush,
        'szeneAb: ' + TUNE.sceneAt,
        'effektiv hold/links/rechts: ' + Math.round(holdMs()) + ' / ' + Math.round(swingL()) + ' / ' + Math.round(swingR())
      ].join('\n');
      var out = document.getElementById('tuneOut');
      out.value = text;
      out.focus();
      out.select();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
    });
    document.getElementById('tuneDefaults').addEventListener('click', function () {
      try { localStorage.removeItem('echotag-v4-tune'); } catch (e) {}
      location.reload();
    });
    document.getElementById('tuneHide').addEventListener('click', function () {
      root.classList.toggle('is-mini');
      this.textContent = root.classList.contains('is-mini') ? 'öffnen' : 'zu';
    });
  }

  // ============================================================
  //  Start
  // ============================================================
  function ready(pack) {
    var ok = typeof THREE !== 'undefined' && initGL(pack.front, pack.back, pack.normal, pack.name);
    if (!ok) {
      glCanvas.style.display = 'none';
      fallback.hidden = false;
    }
    phase = 'closed';
    setHint(HINT_DEFAULT, false);

    // Empfaengername als Live-Textebene (wird nie ins Material eingebrannt)
    cardnameText.textContent = recipient.toUpperCase();
    if (nameOnCard) {
      cardname.style.visibility = 'hidden';
      cardname.style.opacity = 0;
    }
    setupTune();

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

  Promise.all([
    loadFonts().catch(function () { return null; }),
    loadImage('paper-grain.png').catch(function () { return null; }),
    loadImage('crease.png').catch(function () { return null; })
  ]).then(function (res) {
    paperTile = res[1];
    if (res[2]) captureCrease(res[2]);
    ready({ front: bakeFront(), back: bakeBack(), normal: makeFrontNormal(), name: bakeName(recipient) });
  });
})();

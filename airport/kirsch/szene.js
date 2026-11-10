/* Susanne Kirsch, "Barfuss durch New York": Flug in die Collage, raeumlich.
   Das Foto bleibt unveraendert; eine Tiefenkarte (tiefe.png, aus tools/kirsch_tiefe.py) hebt Papier und
   Spruehlinien als echtes Relief vom Leinwandgrund ab. Die Kamera hat einen wirklichen Standpunkt: schaut sie
   schraeg, verdecken die vorderen Schichten die hinteren und werfen Schatten. Sie folgt dem, was die
   Kuenstlerin gerade sagt. Am Ende liegt alles wieder flach, und die Kamera faehrt zurueck in den Raum.
   Orte im Bild: x/y von 0 bis 1, links oben = 0/0. */
(function () {
  var ORT = {
    schrift:   [.865, .468],  /* "FRANKFURT -> NEW YORK" */
    manhattan: [.640, .425],
    nyc:       [.600, .250],  /* Turm mit X und "New York City" */
    farbe:     [.270, .300],
    sprueh:    [.300, .800],
    naht:      [.520, .480],  /* wo Malerei und Collage sich treffen */
    plakat:    [.650, .470],  /* "edge", "Sample Sale" */
    hotel:     [.628, .585],
    brooklyn:  [.730, .590],
    highline:  [.610, .520],  /* gruene Linie auf dem Stadtplan - Stelle bitte bestaetigen */
    taxi:      [.690, .660],
    ganz:      [.500, .545]
  };
  var RAUM = { bild: '../raum/hell.jpg', tiefe: '../raum/hell-tiefe.png', x: .56, y: .44, hoehe: .29, wand: .90, blickX: .50, blickY: .50 };
  var TANF = .36;
  function cam(t, ort, zoom) { return [t, [ORT[ort][0], ORT[ort][1], zoom]]; }

  Echo.start({
    subs: 'untertitel.json', duration: 72, endAt: 66,
    tracks: {
      /* Kamera: Zeit, Ort, Zoom (1 = ganzes Werk an der Wand) */
      cam: [
        cam(0, 'schrift', 4.2),
        cam(0.5, 'schrift', 4.4),
        cam(2.8, 'manhattan', 3.0),     /* dem Pfeil nach in den Stadtplan */
        cam(7.2, 'ganz', 1.0),          /* "... Barfuss durch New York." das ganze Werk */
        cam(7.9, 'ganz', 1.02),
        cam(11.4, 'nyc', 2.4),          /* "New York fasziniert mich ..." */
        cam(12.0, 'nyc', 2.45),
        cam(15.8, 'farbe', 2.0),        /* "ihre Energie, ihre Gegensaetze" */
        cam(19.6, 'sprueh', 2.0),       /* "zu Fuss durch ihre Strassen" */
        cam(20.3, 'sprueh', 2.02),
        cam(25.0, 'ganz', 1.25),        /* "auf die Leinwand bringen" */
        cam(29.4, 'naht', 2.2),         /* "Malerei und Collage" */
        cam(30.5, 'naht', 2.25),
        cam(34.2, 'plakat', 3.5),       /* "alte Werbeplakate" */
        cam(35.5, 'plakat', 3.6),
        cam(37.3, 'hotel', 4.1),        /* "Hotels, in denen ich gewohnt habe" */
        cam(38.0, 'hotel', 4.15),
        cam(39.3, 'manhattan', 3.8),    /* "Manhattan" */
        cam(40.6, 'brooklyn', 3.8),     /* "und Brooklyn" */
        cam(44.6, 'brooklyn', 3.3),
        cam(47.0, 'highline', 4.2),     /* "Highline" */
        cam(50.6, 'highline', 3.9),
        cam(54.8, 'taxi', 3.2),         /* "ein ganz persoenliches Stueck New York" */
        cam(56.0, 'taxi', 3.1),
        cam(61.2, 'ganz', 1.0),         /* "mein Gefuehl und meine Erinnerung" */
        cam(90, 'ganz', 1.0)
      ],
      /* Blickwinkel: seitlich, hoch/tief (Bogenmass); schraeg zeigt das Relief */
      blick: [[0, [-.34, .06]], [0.5, [-.34, .06]], [2.8, [.22, -.04]], [7.2, [0, 0]], [7.9, [0, 0]], [11.4, [.26, .08]], [15.8, [-.22, .04]], [19.6, [.14, -.12]], [20.3, [.14, -.12]],
              [25, [0, 0]], [29.4, [-.26, .05]], [30.5, [-.24, .05]], [34.2, [.24, .04]], [37.3, [-.20, .10]], [39.3, [.16, .06]], [40.6, [-.18, -.04]], [47, [.28, .02]], [50.6, [.20, .02]],
              [54.8, [-.22, -.08]], [56, [-.20, -.08]], [61.2, [0, 0]], [90, [0, 0]]],
      /* wie weit die Schichten vom Grund abheben */
      heben: [[0, .9], [0.5, 1.0], [2.8, 1.5], [7.2, .8], [12, 1.1], [19.6, 1.5], [25, .9], [29.4, 1.7], [34, 1.1], [56, 1.1], [59.5, .5], [61.2, 0], [90, 0]],
      /* Schaerfeebene: 0 Leinwand, .5 Papier, 1 Spruehlinien */
      fokus: [[0, .15], [2.8, .5], [7.2, .3], [11.4, .5], [15.8, .3], [19.6, .9], [25, .3], [29.4, .45], [34.2, .5], [56, .5], [61.2, .3]],
      unschaerfe: [[0, 1.2], [2.8, 1.8], [7.2, .3], [11.4, 1.0], [19.6, 1.4], [25, .35], [29.4, 1.2], [56, 1.1], [60, .3], [61.2, 0], [90, 0]],
      puls: [[0, 0], [9.5, 0], [10.6, 1], [15.5, 1], [17, 0], [90, 0]],
      fahrt: [[0, 0], [61.8, 0], [68.5, 1], [90, 1]]     /* die Kamera faehrt zurueck in den Raum */
    },
    scene: function (gl, K) {
      var FS = '#version 300 es\nprecision highp float;in vec2 vP;out vec4 o;\n' +
        'uniform vec2 uRes;uniform vec3 uC,uR,uU,uF,uE;uniform float uTanF,uIA;\n' +
        'uniform sampler2D uTex,uDep,uRaumT,uRaumD;uniform float uLift,uFocus,uBlur,uPulse,uTime,uWand;uniform vec4 uRaumR;\n' +
        'float box(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}\n' +
        /* Hoehe der Schicht ueber der Leinwand; ausserhalb des Werks liegt nichts */
        'float hgt(vec2 uv){vec2 e=step(vec2(0.),uv)*step(uv,vec2(1.));return max(texture(uDep,uv).r-.13,0.)*e.x*e.y;}\n' +
        'void main(){\n' +
        ' float sa=uRes.x/uRes.y;vec3 dir=uF+uR*(vP.x*sa*uTanF)+uU*(vP.y*uTanF);\n' +
        ' float lift=uLift*(1.+.10*uPulse*sin(uTime*5.2));float HM=.036*lift;\n' +
        /* Sehstrahl von der hoechsten Schicht bis zur Leinwand abschreiten: was vorn liegt, verdeckt */
        ' float t1=-uC.z/dir.z;float t0=(HM-uC.z)/dir.z;vec3 p=uC+dir*t1;float hit=0.;\n' +
        ' if(lift>.002){float ta=t0,tb=t0;bool found=false;\n' +
        '  for(int i=1;i<=30;i++){tb=mix(t0,t1,float(i)/30.);vec3 q=uC+dir*tb;if(q.z<=hgt(vec2(q.x/uIA,q.y))*HM){found=true;break;}ta=tb;}\n' +
        '  if(found){for(int i=0;i<5;i++){float tm=.5*(ta+tb);vec3 q=uC+dir*tm;if(q.z<=hgt(vec2(q.x/uIA,q.y))*HM)tb=tm;else ta=tm;}p=uC+dir*tb;hit=1.;}}\n' +
        ' vec2 w=p.xy;vec2 uv=vec2(w.x/uIA,w.y);float d=texture(uDep,uv).r;\n' +
        ' vec2 q2=vec2(w.x-.5*uIA,w.y-.5);float sd=box(q2,vec2(.5*uIA,.5));\n' +
        /* Raum hinter dem Werk */
        ' vec3 pw0=uC+dir*t1;vec2 ww=pw0.xy;vec2 rs=uRaumR.zw-uRaumR.xy;vec2 par=(uC.xy-ww)/uC.z-(uE.xy-ww)/uE.z;vec2 pw=ww;\n' +
        ' for(int i=0;i<3;i++){float hh=max(uWand-texture(uRaumD,(pw-uRaumR.xy)/rs).r,0.)*2.2;pw=ww-par*hh;}\n' +
        ' vec3 room=texture(uRaumT,clamp((pw-uRaumR.xy)/rs,0.,1.)).rgb;\n' +
        ' vec2 qw=vec2(ww.x-.5*uIA,ww.y-.5);\n' +
        ' room*=1.-.30*smoothstep(.09,-.02,box(qw-vec2(.008,.026),vec2(.5*uIA,.5)));\n' +
        /* vordere Schichten werfen Schatten auf das, was dahinter liegt */
        ' float dn=hgt(uv-vec2(.012,.019)*lift*vec2(1./uIA,1.));\n' +
        ' float shade=clamp((dn-hgt(uv))*2.4,0.,1.)*min(lift,1.3)*.44;\n' +
        /* Schaerfentiefe ueber die Bildverkleinerungen, vier Proben gegen Kloetzchen */
        ' float lod=clamp(abs(d-uFocus)*uBlur*1.5,0.,5.);\n' +
        ' vec2 px=exp2(lod)/vec2(textureSize(uTex,0))*.6;\n' +
        ' vec3 c=textureLod(uTex,uv,lod).rgb*.4;\n' +
        ' c+=textureLod(uTex,uv+px*vec2(.7,.7),lod).rgb*.15+textureLod(uTex,uv+px*vec2(-.7,.7),lod).rgb*.15;\n' +
        ' c+=textureLod(uTex,uv+px*vec2(.7,-.7),lod).rgb*.15+textureLod(uTex,uv+px*vec2(-.7,-.7),lod).rgb*.15;\n' +
        ' c*=1.-shade;c*=1.+.05*hgt(uv)*min(lift,1.);\n' +
        ' c=mix(c,c*1.06+.012*sin(uTime*5.2),uPulse*.5);\n' +
        ' float aa=fwidth(sd)+1e-5;float inside=smoothstep(aa,-aa,sd);\n' +
        ' vec3 col=mix(room,c,inside);\n' +
        ' o=vec4(col,1.);}';
      var prog = K.program(gl, K.QUAD_VS, FS), tex, dep, raumT, raumD, ia, ra;
      function mix(a, b, k) { return a + (b - a) * k; }
      return Promise.all([K.loadImage('werk.jpg'), K.loadImage('tiefe.png'), K.loadImage(RAUM.bild), K.loadImage(RAUM.tiefe)]).then(function (im) {
        ia = im[0].naturalWidth / im[0].naturalHeight; ra = im[2].naturalWidth / im[2].naturalHeight;
        tex = K.texture(gl, im[0], true); dep = K.texture(gl, im[1], false); raumT = K.texture(gl, im[2], true); raumD = K.texture(gl, im[3], false);
        var rH = 1 / RAUM.hoehe, rW = rH * ra, rx0 = ia / 2 - RAUM.x * rW, ry0 = .5 - RAUM.y * rH;
        return {
          draw: function (f) {
            var u = prog.u, s = f.s, k = f.clock, a = f.idle ? 1.6 : 1, sa = f.w / f.h, Hh = Math.max(.54, .54 * ia / sa);
            var fa = s.fahrt, viewH = mix(Hh / s.cam[2], .485 * rH, fa);
            var T = [mix(s.cam[0] * ia, rx0 + RAUM.blickX * rW, fa), mix(s.cam[1], ry0 + RAUM.blickY * rH, fa), 0];
            var D = viewH / TANF, live = 1 - .6 * fa;
            /* die Kamera steht nie ganz still; Neigen des Handys schwenkt sie um das Werk */
            var yaw = s.blick[0] + (f.tilt.x * .22 + Math.sin(k * .37) * .05 * a) * live;
            var pit = s.blick[1] + (f.tilt.y * .15 + Math.cos(k * .29) * .035 * a) * live;
            var C = [T[0] + D * Math.sin(yaw) * Math.cos(pit), T[1] + D * Math.sin(pit), D * Math.cos(yaw) * Math.cos(pit)];
            var F = [T[0] - C[0], T[1] - C[1], -C[2]], fl = Math.hypot(F[0], F[1], F[2]); F = [F[0] / fl, F[1] / fl, F[2] / fl];
            var R = [-F[2], 0, F[0]], rl = Math.hypot(R[0], R[2]); R = [R[0] / rl, 0, R[2] / rl];
            var U = [F[1] * R[2] - F[2] * R[1], F[2] * R[0] - F[0] * R[2], F[0] * R[1] - F[1] * R[0]];
            gl.viewport(0, 0, f.w, f.h); gl.useProgram(prog.p);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u.uTex, 0);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, dep); gl.uniform1i(u.uDep, 1);
            gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, raumT); gl.uniform1i(u.uRaumT, 2);
            gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, raumD); gl.uniform1i(u.uRaumD, 3);
            gl.uniform2f(u.uRes, f.w, f.h); gl.uniform1f(u.uIA, ia); gl.uniform1f(u.uTanF, TANF); gl.uniform1f(u.uTime, k);
            gl.uniform3fv(u.uC, C); gl.uniform3fv(u.uR, R); gl.uniform3fv(u.uU, U); gl.uniform3fv(u.uF, F);
            gl.uniform3f(u.uE, rx0 + RAUM.blickX * rW, ry0 + RAUM.blickY * rH, .485 * rH / TANF);
            gl.uniform4f(u.uRaumR, rx0, ry0, rx0 + rW, ry0 + rH); gl.uniform1f(u.uWand, RAUM.wand);
            gl.uniform1f(u.uLift, s.heben); gl.uniform1f(u.uFocus, s.fokus); gl.uniform1f(u.uBlur, s.unschaerfe); gl.uniform1f(u.uPulse, s.puls);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
          }
        };
      });
    }
  });
})();

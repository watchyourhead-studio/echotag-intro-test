/* Thorsten Poersch, "Schoenheit & Vergaenglichkeit": aus der Naehe nur Punkte, aus der Ferne ein Gesicht.
   Echte Raeumlichkeit: Jeder Punkt schwebt auf der Sichtlinie zwischen seinem Platz auf dem Putz und einem
   einzigen Standpunkt vor dem Werk. Nur von dort fuegen sich die Punkte zum Gesicht, von ueberall sonst
   zerfaellt es. Die Kamera fliegt durch die Punktwolke zu diesem Standpunkt; wer das Handy neigt, sieht das
   Gesicht wieder zerfallen. Am Ende steht das unveraenderte Foto, und die Kamera faehrt zurueck in den Raum.
   Putzgrund (grund.jpg) und Punkte (punkte.json) sind aus dem Werkfoto herausgeloest: tools/poersch_punkte.py */
(function () {
  var ORT = {
    haar:  [.200, .270],
    ganz:  [.500, .540],
    blick: [.540, .430],
    auge:  [.680, .375],
    riss:  [.600, .800],
    mitte: [.500, .480]
  };
  /* Raumbild: wo das Werk haengt (Mitte in Bildanteilen) und wie hoch es im Raumbild ist */
  var RAUM = { bild: '../raum/loft.jpg', tiefe: '../raum/loft-tiefe.png', x: .44, y: .43, hoehe: .30, wand: .918, blickX: .52, blickY: .50 };
  var TANF = .36;
  function cam(t, ort, zoom) { return [t, [ORT[ort][0], ORT[ort][1], zoom]]; }

  Echo.start({
    subs: 'untertitel.json', duration: 73.4,
    tracks: {
      /* Kamera: Zeit, Ort, Zoom (1 = der Standpunkt, von dem aus das Gesicht stimmt) */
      cam: [
        cam(0, 'haar', 3.0),
        cam(1.0, 'haar', 2.9),
        cam(7.3, 'ganz', 1.0),          /* "... sondern durch Verfall spricht." das Gesicht ist da */
        cam(9.5, 'ganz', 1.0),
        cam(13.3, 'blick', 1.5),        /* "die schemenhafte Gestalt" */
        cam(18.3, 'blick', 1.65),
        cam(22.4, 'auge', 2.9),         /* "kein klares Gesicht, sondern ein Abdruck der Zeit" */
        cam(26.4, 'riss', 3.3),         /* "Spuren in die Oberflaeche gegraben" */
        cam(27.1, 'riss', 3.3),
        cam(31.5, 'ganz', 1.0),         /* "Tarotkarte Tod" */
        cam(41.5, 'ganz', 1.0),         /* "loest sich auf" */
        cam(49.4, 'ganz', 1.12),        /* "Aufbluehen aus dem Unsichtbaren" */
        cam(50.0, 'ganz', 1.12),
        cam(55.8, 'auge', 2.2),         /* "im Moment des Dazwischen" */
        cam(59.4, 'auge', 2.3),
        cam(62.6, 'ganz', 1.0),         /* "ein Portraet der Verwandlung" */
        cam(65.2, 'ganz', 1.0),
        cam(67.6, 'riss', 2.8),         /* "jeder Riss, jede Spur der Zeit" */
        cam(69.7, 'riss', 2.9),
        cam(72.4, 'ganz', 1.0),         /* "Tor zum Anfang" */
        cam(90, 'ganz', 1.0)
      ],
      /* Blickwinkel: seitlich, hoch/tief (Bogenmass); 0/0 = frontal */
      blick:   [[0, [.62, -.10]], [1, [.60, -.10]], [7.3, [0, 0]], [18.3, [.05, 0]], [22.4, [.30, .05]], [26.4, [-.34, .10]], [31.5, [0, 0]], [50, [0, 0]], [55.8, [.20, 0]], [59.4, [.16, 0]], [62.6, [0, 0]], [65.2, [0, 0]], [67.6, [-.32, .12]], [69.7, [-.28, .12]], [72.4, [0, 0]], [90, [0, 0]]],
      schwung: [[0, 0], [1, 0], [4.3, 1], [7.3, 0], [90, 0]],                      /* Bogen im Anflug: einmal um das Werk herum */
      hoehe:   [[0, 1], [7.3, 1], [9.0, 1], [11.5, .10], [27.1, .10], [31.5, .85], [41.4, .85], [41.5, 0], [59.4, .0], [62.6, .0], [64.0, .8], [65.2, .8], [67.0, 0], [90, 0]],  /* wie weit die Punkte vor dem Putz schweben */
      dof:     [[0, 1], [5, 1], [7.3, .25], [22.4, .6], [31.5, .3], [55.8, .6], [62.6, .25], [90, .25]],                                                               /* Unschaerfe vor und hinter der Schaerfeebene */
      punkte:  [[0, 1], [18.7, 1], [22.4, .32], [26.4, .24], [29.2, 1], [65.4, 1], [67.6, .5], [69.7, .5], [71.5, 1]],
      lose:    [[0, 1], [1, 1], [6.5, 0], [90, 0]],
      broeckeln: [[0, 0], [9.9, 0], [12.5, 1], [26, 1], [27, 0], [90, 0]],         /* "die broeckelnden Strukturen": einzelne fallen */
      aufloesen: [[0, 0], [34.2, 0], [37.6, 1], [41.4, 1], [41.5, 0], [90, 0]],    /* "loest sich auf": sie treiben auf den Betrachter zu */
      bluehen:   [[0, 1], [37.8, 1], [37.9, 0], [41.5, 0], [49.6, 1], [90, 1]],    /* "Aufbluehen aus dem Unsichtbaren" */
      zwischen:  [[0, 0], [50, 0], [52.5, 1], [58.5, 1], [60.5, 0], [90, 0]],      /* "Verblassen und Erscheinen zugleich" */
      relief:  [[0, .25], [18.7, .25], [22.4, 1], [27, 1], [30, .3], [37, .3], [38.5, .9], [42, .4], [65.4, .3], [67.6, 1], [69.7, 1], [72, .1], [90, .1]],
      licht:   [[0, .2], [22, .15], [27, .85], [37.5, .2], [41.5, .8], [65.4, .15], [69.7, .9], [90, .5]],
      dunkel:  [[0, 0], [27, 0], [29.5, .45], [34, .45], [41, .15], [49, 0], [90, 0]],
      foto:    [[0, 0], [70.4, 0], [72.2, 1], [90, 1]],                           /* am Ende das unveraenderte Foto */
      raum:    [[0, 0], [71.5, 0], [76.5, 1], [90, 1]],                           /* das Licht im Raum geht an */
      fahrt:   [[0, 0], [72.6, 0], [79.5, 1], [90, 1]]                            /* die Kamera faehrt zurueck in den Raum */
    },
    scene: function (gl, K) {
      var CAM = 'uniform vec2 uRes;uniform vec3 uC,uR,uU,uF;uniform float uTanF,uIA;\n';
      var BG = '#version 300 es\nprecision highp float;in vec2 vP;out vec4 o;\n' + CAM +
        'uniform sampler2D uGrund,uFoto,uRaumT,uRaumD;uniform float uRelief,uLicht,uDunkel,uFotoMix,uRaum,uWand,uTime;uniform vec4 uRaumR;uniform vec3 uE;\n' +
        'float box(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}\n' +
        'float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\n' +
        'float nz(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+1.),f.x),f.y);}\n' +
        'float L(vec2 uv){return dot(texture(uGrund,uv).rgb,vec3(.3,.59,.11));}\n' +
        'void main(){\n' +
        /* Sehstrahl bis zur Wandebene z=0 */
        ' float sa=uRes.x/uRes.y;vec3 dir=uF+uR*(vP.x*sa*uTanF)+uU*(vP.y*uTanF);\n' +
        ' float t=-uC.z/dir.z;vec2 w=uC.xy+dir.xy*t;vec2 uv=vec2(w.x/uIA,w.y);float vh=t*uTanF;\n' +
        ' vec2 q=vec2(w.x-.5*uIA,w.y-.5);float sd=box(q,vec2(.5*uIA,.5));\n' +
        /* Raum: Foto einer Wand. Was vor der Wand steht, verschiebt sich mit dem Kamerastandpunkt */
        ' vec2 rs=uRaumR.zw-uRaumR.xy;vec2 par=(uC.xy-w)/uC.z-(uE.xy-w)/uE.z;vec2 pw=w;\n' +
        ' for(int i=0;i<3;i++){float hh=max(uWand-texture(uRaumD,(pw-uRaumR.xy)/rs).r,0.)*2.2;pw=w-par*hh;}\n' +
        ' vec2 ru=clamp((pw-uRaumR.xy)/rs,0.,1.);vec3 room=texture(uRaumT,ru).rgb;\n' +
        ' float spot=exp(-dot(q,q)*.9);\n' +
        ' room*=mix(.07+.42*spot,1.,uRaum);\n' +
        ' float sh=smoothstep(.10,-.02,box(q-vec2(.006,.030),vec2(.5*uIA,.5)));\n' +
        ' room*=1.-(.55-.2*uRaum)*sh;\n' +
        ' vec3 c=texture(uGrund,uv).rgb;\n' +
        /* Koernung, die beim Heranfahren fein bleibt */
        ' float g=nz(w*520.)*.5+nz(w*1300.)*.3+nz(w*3100.)*.2;\n' +
        ' float near=smoothstep(.35,.06,vh);\n' +
        ' c*=1.+(g-.5)*(.07+.20*near);\n' +
        /* Relief: Helligkeit als Hoehe lesen, Streiflicht von der Seite */
        ' vec2 e=vec2(1.5)/vec2(textureSize(uGrund,0));\n' +
        ' float hx=L(uv+vec2(e.x,0.))-L(uv-vec2(e.x,0.)),hy=L(uv+vec2(0.,e.y))-L(uv-vec2(0.,e.y));\n' +
        ' hx+=(nz(w*900.+7.)-nz(w*900.-7.))*.03*near;\n' +
        ' vec2 lp=vec2((uLicht*1.5-.25)*uIA,.34);vec2 ld=normalize(w-lp);\n' +
        ' float rake=clamp((hx*ld.x+hy*ld.y)*-5.5,-.45,.6);\n' +
        ' float beam=exp(-pow((w.x-lp.x)/(.38*uIA),2.));\n' +
        ' c*=1.+uRelief*(rake*(.5+.7*beam)+.14*beam-.05);\n' +
        ' c=mix(c,texture(uFoto,uv).rgb,uFotoMix);\n' +
        ' c*=mix(1.,.5+.5*exp(-dot(q,q)*2.2),uDunkel);\n' +
        ' c*=1.-.25*dot(vP,vP)*(1.-uFotoMix);\n' +
        /* im Raum bekommt das Werk das Licht der Wand: oben heller, leicht warm */
        ' c*=mix(vec3(1.),vec3(1.02,.98,.93)*(1.04-.22*smoothstep(.0,1.,w.y)),uRaum);\n' +
        ' float aa=fwidth(sd);float inside=smoothstep(aa,-aa,sd);\n' +
        ' vec3 col=mix(room,c,inside);\n' +
        ' col*=1.-.16*dot(vP,vP)*uRaum;\n' +
        ' o=vec4(col,1.);}';
      var PVS = '#version 300 es\nprecision highp float;\n' +
        'layout(location=0) in vec3 aP;layout(location=1) in vec3 aC;layout(location=2) in vec2 aS;\n' + CAM +
        'uniform vec3 uE;uniform float uTime,uAlpha,uHoehe,uLose,uBroeckeln,uAufloesen,uBluehen,uZwischen,uDunkel,uDof,uFocus,uShadow;uniform vec2 uAuge;\n' +
        'out vec4 vC;out float vSeed;out vec2 vSoft;\n' +
        'void main(){\n' +
        ' vec3 P=vec3(aP.xy*uIA,0.);float r=aP.z*uIA;float a=uAlpha;\n' +
        /* jeder Punkt schwebt auf der Sichtlinie zum Standpunkt E: von dort deckt er genau seinen Platz */
        ' float s=uHoehe*(.03+.37*pow(aS.x,1.4));vec3 X=P+s*(uE-P);r*=1.-s;\n' +
        ' X+=vec3(sin(uTime*.7+aS.x*40.),cos(uTime*.6+aS.y*37.),sin(uTime*.5+aS.y*21.))*.004*uLose;\n' +
        /* einzelne broeckeln ab */
        ' float pick=step(aS.y,.14);float b=clamp(uBroeckeln*1.6-aS.x*.6,0.,1.)*pick;\n' +
        ' X+=vec3(sin(aS.x*50.)*.012,.13,.02)*b*b;a*=1.-b;\n' +
        /* aufloesen: von oben nach unten loesen sie sich und treiben auf den Betrachter zu */
        ' float od=P.y*.55+aS.y*.45;float d=smoothstep(od*.78,od*.78+.22,uAufloesen);\n' +
        ' X+=vec3(sin(aS.y*31.+d*4.)*.05*d,.10*d*d,d*d*(.3+1.5*aS.y));a*=1.-smoothstep(.45,1.,d);\n' +
        /* aufbluehen: vom Auge aus wachsen sie wieder */
        ' float ob=clamp(distance(P.xy,uAuge*vec2(uIA,1.))/.85,0.,1.)*.8+aS.y*.2;float g=smoothstep(ob*.8,ob*.8+.2,uBluehen);\n' +
        ' r*=g*(1.+.35*sin(g*3.1416));a*=min(1.,g*1.5);\n' +
        /* dazwischen: verblassen und erscheinen zugleich */
        ' a*=mix(1.,smoothstep(.25,.75,.5+.5*sin(uTime*.9+aS.x*6.283+P.y*4.)),uZwischen);\n' +
        ' vec3 col=aC*(1.-.3*uDunkel);float soft=0.;\n' +
        /* Schatten des schwebenden Punkts auf dem Putz */
        ' if(uShadow>.5){float hz=X.z;X=vec3(X.xy+vec2(.30,.50)*hz*.40,0.);r=r*(1.+hz*1.6)+hz*.012;\n' +
        '  a*=.26*smoothstep(0.,.02,hz)/(1.+hz*hz*60.);col=vec3(.03,.025,.02);soft=.9;}\n' +
        ' vec3 v=X-uC;float zs=dot(v,uF);\n' +
        ' if(zs<.05||a<.003){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;vC=vec4(0.);vSeed=0.;vSoft=vec2(0.);return;}\n' +
        ' float sa=uRes.x/uRes.y;\n' +
        ' gl_Position=vec4(dot(v,uR)/(zs*uTanF*sa),dot(v,uU)/(zs*uTanF),0.,1.);\n' +
        ' float s0=max(1.5,r/(zs*uTanF)*uRes.y*1.3);\n' +
        ' if(uShadow>.5&&s0<4.){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;vC=vec4(0.);vSeed=0.;vSoft=vec2(0.);return;}\n' +
        ' float bl=uDof*abs(1./zs-1./uFocus)*uRes.y*.022*(1.-uShadow);\n' +
        ' float sz=min(s0+2.*bl,460.);\n' +
        ' gl_PointSize=sz;vSoft=vec2(s0/sz,max(soft,clamp(2.*bl/sz,0.,1.)));\n' +
        ' vC=vec4(col,a*clamp(s0/sz*1.6,.12,1.));vSeed=aS.x;}';
      var PFS = '#version 300 es\nprecision highp float;in vec4 vC;in float vSeed;in vec2 vSoft;out vec4 o;\n' +
        'void main(){vec2 p=gl_PointCoord*2.-1.;float an=atan(p.y,abs(p.x)<1e-4?1e-4:p.x);\n' +
        /* keine perfekten Kreise: leicht kantig wie im Original */
        ' float rr=(.76+.07*sin(an*3.+vSeed*40.)+.05*sin(an*5.+vSeed*13.))*vSoft.x;\n' +
        ' float d=length(p);float w=fwidth(d)*1.3+.03+vSoft.y*.6;float al=smoothstep(rr+w,rr-w,d)*vC.a;\n' +
        ' if(al<.004)discard;\n' +
        ' vec3 c=vC.rgb*(.94+.12*smoothstep(rr,0.,d));\n' +
        ' o=vec4(c*al,al);}';
      var bg = K.program(gl, K.QUAD_VS, BG), pt = K.program(gl, PVS, PFS), grund, foto, raumT, raumD, ia, ra, n, vao;
      function mix(a, b, k) { return a + (b - a) * k; }
      return Promise.all([K.loadImage('grund.jpg'), K.loadImage('werk.jpg'), fetch('punkte.json').then(function (r) { return r.json(); }),
        K.loadImage(RAUM.bild), K.loadImage(RAUM.tiefe)]).then(function (r) {
        ia = r[0].naturalWidth / r[0].naturalHeight; ra = r[3].naturalWidth / r[3].naturalHeight;
        grund = K.texture(gl, r[0], true); foto = K.texture(gl, r[1], true); raumT = K.texture(gl, r[3], true); raumD = K.texture(gl, r[4], false);
        var P = r[2].p; n = r[2].n;
        var buf = new Float32Array(n * 8), seed = 1234567;
        function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
        for (var i = 0; i < n; i++) {
          /* x und y in Bildbreiten: mal uIA ergibt Weltkoordinaten (Bildhoehe = 1) */
          buf[i * 8] = P[i * 6] / 1000; buf[i * 8 + 1] = P[i * 6 + 1] / 1000; buf[i * 8 + 2] = P[i * 6 + 2] / 1000;
          buf[i * 8 + 3] = P[i * 6 + 3] / 255; buf[i * 8 + 4] = P[i * 6 + 4] / 255; buf[i * 8 + 5] = P[i * 6 + 5] / 255;
          buf[i * 8 + 6] = rnd(); buf[i * 8 + 7] = rnd();
        }
        vao = gl.createVertexArray(); gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
        gl.bindVertexArray(null);
        /* Raumbild in Weltkoordinaten (Werkhoehe = 1) */
        var rH = 1 / RAUM.hoehe, rW = rH * ra, rx0 = ia / 2 - RAUM.x * rW, ry0 = .5 - RAUM.y * rH;
        function camUniforms(u, c) {
          gl.uniform2f(u.uRes, c.w, c.h); gl.uniform1f(u.uIA, ia); gl.uniform1f(u.uTanF, TANF);
          gl.uniform3fv(u.uC, c.C); gl.uniform3fv(u.uR, c.R); gl.uniform3fv(u.uU, c.U); gl.uniform3fv(u.uF, c.F); gl.uniform3fv(u.uE, c.E);
        }
        return {
          draw: function (f) {
            var s = f.s, k = f.clock, a = f.idle ? 1.6 : 1, sa = f.w / f.h, Hh = Math.max(.54, .54 * ia / sa);
            var E = [.5 * ia, ORT.ganz[1], Hh / TANF];
            /* Ziel und Abstand aus der Spur, am Ende hinueber in den Raum */
            var fa = s.fahrt, viewH = mix(Hh / s.cam[2], .485 * rH, fa);
            var T = [mix(s.cam[0] * ia, rx0 + RAUM.blickX * rW, fa), mix(s.cam[1], ry0 + RAUM.blickY * rH, fa), 0];
            var D = viewH / TANF;
            var live = 1 - .6 * fa, ruhe = f.idle ? 1 : 1 - .92 * Math.min(1, s.hoehe * 2) * (1 - s.lose);
            var yaw = s.blick[0] - .52 * s.schwung + (f.tilt.x * .20 + Math.sin(k * .23) * .035 * a * ruhe) * live;
            var pit = s.blick[1] + .10 * s.schwung + (f.tilt.y * .13 + Math.cos(k * .19) * .022 * a * ruhe) * live;
            var C = [T[0] + D * Math.sin(yaw) * Math.cos(pit), T[1] + D * Math.sin(pit), D * Math.cos(yaw) * Math.cos(pit)];
            var F = [T[0] - C[0], T[1] - C[1], -C[2]], fl = Math.hypot(F[0], F[1], F[2]); F = [F[0] / fl, F[1] / fl, F[2] / fl];
            /* rechts = oben x vorn (Welt-y zeigt nach unten), oben = vorn x rechts */
            var R = [-F[2], 0, F[0]], rl = Math.hypot(R[0], R[2]); R = [R[0] / rl, 0, R[2] / rl];
            var U = [F[1] * R[2] - F[2] * R[1], F[2] * R[0] - F[0] * R[2], F[0] * R[1] - F[1] * R[0]];
            var c = { w: f.w, h: f.h, C: C, R: R, U: U, F: F, E: E };
            /* Standpunkt, fuer den das Raumfoto unverzerrt ist: der Schlusspunkt der Fahrt */
            var ER = [rx0 + RAUM.blickX * rW, ry0 + RAUM.blickY * rH, .485 * rH / TANF];

            gl.viewport(0, 0, f.w, f.h); gl.disable(gl.BLEND);
            gl.useProgram(bg.p); var u = bg.u; camUniforms(u, c); gl.uniform3fv(u.uE, ER);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, grund); gl.uniform1i(u.uGrund, 0);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, foto); gl.uniform1i(u.uFoto, 1);
            gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, raumT); gl.uniform1i(u.uRaumT, 2);
            gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, raumD); gl.uniform1i(u.uRaumD, 3);
            gl.uniform4f(u.uRaumR, rx0, ry0, rx0 + rW, ry0 + rH); gl.uniform1f(u.uWand, RAUM.wand); gl.uniform1f(u.uRaum, s.raum);
            gl.uniform1f(u.uTime, k); gl.uniform1f(u.uRelief, s.relief); gl.uniform1f(u.uLicht, s.licht + f.tilt.x * .12);
            gl.uniform1f(u.uDunkel, s.dunkel); gl.uniform1f(u.uFotoMix, s.foto);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            if (s.foto >= 1) return;

            gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.useProgram(pt.p); u = pt.u; camUniforms(u, c);
            gl.uniform1f(u.uTime, k); gl.uniform1f(u.uAlpha, s.punkte * (1 - s.foto)); gl.uniform1f(u.uHoehe, s.hoehe); gl.uniform1f(u.uLose, s.lose);
            gl.uniform1f(u.uBroeckeln, s.broeckeln); gl.uniform1f(u.uAufloesen, s.aufloesen); gl.uniform1f(u.uBluehen, s.bluehen);
            gl.uniform1f(u.uZwischen, s.zwischen); gl.uniform1f(u.uDunkel, s.dunkel); gl.uniform1f(u.uDof, s.dof); gl.uniform1f(u.uFocus, D);
            gl.uniform2f(u.uAuge, ORT.auge[0], ORT.auge[1]);
            gl.bindVertexArray(vao);
            gl.uniform1f(u.uShadow, 1); gl.drawArrays(gl.POINTS, 0, n);
            gl.uniform1f(u.uShadow, 0); gl.drawArrays(gl.POINTS, 0, n);
            gl.bindVertexArray(null);
          }
        };
      });
    }
  });
})();

/* Thorsten Poersch, "Schoenheit & Vergaenglichkeit": aus der Naehe nur Punkte, aus der Ferne ein Gesicht.
   Der Putzgrund (grund.jpg) und jeder einzelne Punkt (punkte.json) sind aus dem Werkfoto herausgeloest.
   Die Punkte werden scharf gezeichnet und koennen sich loesen, verblassen und neu aufbluehen,
   genau dort, wo der Kuenstler davon spricht. Am Ende steht das unveraenderte Foto (werk.jpg). */
(function () {
  var ORT = {
    haar:  [.235, .330],
    ganz:  [.500, .540],
    blick: [.560, .420],
    auge:  [.650, .400],
    riss:  [.630, .140],
    putz:  [.600, .640],
    mitte: [.500, .480]
  };
  function cam(t, ort, zoom) { return [t, [ORT[ort][0], ORT[ort][1], zoom]]; }

  Echo.start({
    subs: 'untertitel.json', duration: 73.4,
    tracks: {
      cam: [
        cam(0, 'haar', 7.0),            /* Start: so nah, dass nur Punkte zu sehen sind */
        cam(1.0, 'haar', 6.6),
        cam(7.3, 'ganz', 1.0),          /* "... sondern durch Verfall spricht." das Gesicht ist da */
        cam(8.3, 'ganz', 1.02),
        cam(13.3, 'blick', 1.55),       /* "die schemenhafte Gestalt" */
        cam(18.3, 'blick', 1.7),
        cam(22.4, 'auge', 3.0),         /* "kein klares Gesicht, sondern ein Abdruck der Zeit" */
        cam(26.4, 'riss', 3.6),         /* "Spuren in die Oberflaeche gegraben" */
        cam(27.1, 'riss', 3.6),
        cam(31.5, 'ganz', 1.12),        /* "Tarotkarte Tod" */
        cam(34.3, 'ganz', 1.18),
        cam(37.0, 'mitte', 1.3),        /* "loest sich auf" */
        cam(41.5, 'mitte', 1.45),
        cam(49.4, 'ganz', 1.1),         /* "Aufbluehen aus dem Unsichtbaren" */
        cam(50.0, 'ganz', 1.1),
        cam(55.8, 'auge', 2.3),         /* "im Moment des Dazwischen" */
        cam(59.4, 'auge', 2.4),
        cam(64.3, 'ganz', 1.2),         /* "ein Portraet der Verwandlung" */
        cam(67.0, 'riss', 2.9),         /* "jeder Riss, jede Spur der Zeit" */
        cam(69.7, 'riss', 3.0),
        cam(72.6, 'ganz', 1.0),         /* "Tor zum Anfang" */
        cam(76, 'ganz', .95)
      ],
      punkte:   [[0, 1], [18.7, 1], [22.4, .30], [26.4, .22], [29.2, 1], [64.6, 1], [67, .5], [69.7, .5], [71.5, 1]],  /* Deckkraft aller Punkte */
      lose:     [[0, 1], [1, 1], [6.5, 0], [80, 0]],                                    /* Punkte schweben leicht, solange man nah dran ist */
      broeckeln:[[0, 0], [9.9, 0], [12.5, 1], [26, 1], [27, 0], [80, 0]],               /* "die broeckelnden Strukturen": einzelne fallen */
      aufloesen:[[0, 0], [34.2, 0], [37.4, 1], [41.4, 1], [41.5, 0], [80, 0]],          /* "loest sich auf" */
      bluehen:  [[0, 1], [37.6, 1], [37.7, 0], [41.5, 0], [49.6, 1], [80, 1]],          /* "Aufbluehen aus dem Unsichtbaren" */
      zwischen: [[0, 0], [50, 0], [52.5, 1], [58.5, 1], [60.5, 0], [80, 0]],            /* "Verblassen und Erscheinen zugleich" */
      relief:   [[0, .25], [18.7, .25], [22.4, 1], [27, 1], [30, .3], [37, .3], [38.5, .9], [42, .4], [64.6, .3], [66.5, 1], [69.7, 1], [72, .15], [80, .15]],
      licht:    [[0, .2], [22, .15], [27, .85], [37.5, .2], [41.5, .8], [64.6, .15], [69.7, .9], [80, .5]],   /* Streiflicht wandert von links nach rechts */
      dunkel:   [[0, .0], [27, .0], [29.5, .45], [34, .45], [41, .15], [49, 0], [80, 0]],                    /* "Tarotkarte Tod" */
      foto:     [[0, 0], [70.6, 0], [72.6, 1], [80, 1]]                                                      /* am Ende das unveraenderte Foto */
    },
    scene: function (gl, K) {
      var BG = '#version 300 es\nprecision highp float;in vec2 vP;out vec4 o;\n' + K.CAM_GLSL +
        'uniform sampler2D uGrund,uFoto;uniform float uRelief,uLicht,uDunkel,uFotoMix,uTime;\n' +
        'float box(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}\n' +
        'float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\n' +
        'float nz(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+1.),f.x),f.y);}\n' +
        'float L(vec2 uv){return dot(texture(uGrund,uv).rgb,vec3(.3,.59,.11));}\n' +
        'void main(){\n' +
        ' vec2 w=world(vP);vec2 uv=vec2(w.x/uIA,w.y);float vh=viewH();\n' +
        ' vec2 q=vec2(w.x-.5*uIA,w.y-.5);float sd=box(q,vec2(.5*uIA,.5));\n' +
        /* dunkle Wand, das Werk im Lichtkegel */
        ' float spot=exp(-dot(q,q)*1.1);\n' +
        ' vec3 wall=vec3(.105,.108,.115)*(.55+1.1*spot);\n' +
        ' wall*=1.-.55*smoothstep(.07,-.01,box(q-vec2(.010,.024),vec2(.5*uIA,.5)));\n' +
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
        ' c*=1.-.25*dot(vP,vP)*(1.-uFotoMix*.6);\n' +
        ' float aa=fwidth(sd);float inside=smoothstep(aa,-aa,sd);\n' +
        ' o=vec4(mix(wall,c,inside),1.);}';
      var PVS = '#version 300 es\nprecision highp float;\n' +
        'layout(location=0) in vec3 aP;layout(location=1) in vec3 aC;layout(location=2) in vec2 aS;\n' +
        'uniform vec2 uRes;uniform vec3 uCam;uniform float uIA,uTime,uAlpha,uLose,uBroeckeln,uAufloesen,uBluehen,uZwischen,uDunkel;uniform vec2 uAuge;\n' +
        'out vec4 vC;out float vSeed;\n' +
        'void main(){\n' +
        ' float sa=uRes.x/uRes.y;float vh=max(.54,.54*uIA/sa)/uCam.z;\n' +
        ' vec2 w=aP.xy*uIA;float r=aP.z*uIA;float a=uAlpha;\n' +
        /* nah dran schweben die Punkte ein wenig */
        ' w+=vec2(sin(uTime*.7+aS.x*40.),cos(uTime*.6+aS.y*37.))*.0016*uLose;\n' +
        /* einzelne broeckeln ab */
        ' float pick=step(aS.y,.14);float b=clamp(uBroeckeln*1.6-aS.x*.6,0.,1.)*pick;\n' +
        ' w+=vec2(sin(aS.x*50.)*.012,.11)*b*b;a*=1.-b;\n' +
        /* aufloesen: von oben nach unten rieseln sie wie Asche */
        ' float od=w.y*.55+aS.x*.45;float d=smoothstep(od*.78,od*.78+.22,uAufloesen);\n' +
        ' w+=vec2(sin(aS.y*31.+d*4.)*.022*d,.16*d*d);a*=1.-d;r*=1.-.45*d;\n' +
        /* aufbluehen: vom Auge aus wachsen sie wieder */
        ' float ob=clamp(distance(w,uAuge*vec2(uIA,1.))/.85,0.,1.)*.8+aS.y*.2;float g=smoothstep(ob*.8,ob*.8+.2,uBluehen);\n' +
        ' r*=g*(1.+.35*sin(g*3.1416));a*=min(1.,g*1.5);\n' +
        /* dazwischen: verblassen und erscheinen zugleich */
        ' a*=mix(1.,smoothstep(.25,.75,.5+.5*sin(uTime*.9+aS.x*6.283+w.y*4.)),uZwischen);\n' +
        ' vec2 p=(w-vec2(uCam.x*uIA,uCam.y))/vh;\n' +
        ' gl_Position=vec4(p.x/sa,-p.y,0.,1.);\n' +
        ' gl_PointSize=max(1.5,r/vh*uRes.y*1.25);\n' +
        ' vC=vec4(aC*(1.-.3*uDunkel),a);vSeed=aS.x;}';
      var PFS = '#version 300 es\nprecision highp float;in vec4 vC;in float vSeed;out vec4 o;\n' +
        'void main(){vec2 p=gl_PointCoord*2.-1.;float an=atan(p.y,p.x);\n' +
        /* keine perfekten Kreise: leicht kantig wie im Original */
        ' float rr=.76+.07*sin(an*3.+vSeed*40.)+.05*sin(an*5.+vSeed*13.);\n' +
        ' float d=length(p);float w=fwidth(d)*1.3+.03;float al=smoothstep(rr+w,rr-w,d)*vC.a;\n' +
        ' if(al<.004)discard;\n' +
        ' vec3 c=vC.rgb*(.94+.12*smoothstep(rr,0.,d));\n' +
        ' o=vec4(c*al,al);}';
      var bg = K.program(gl, K.QUAD_VS, BG), pt = K.program(gl, PVS, PFS), grund, foto, ia, n, vao;
      return Promise.all([K.loadImage('grund.jpg'), K.loadImage('werk.jpg'), fetch('punkte.json').then(function (r) { return r.json(); })]).then(function (r) {
        ia = r[0].naturalWidth / r[0].naturalHeight;
        grund = K.texture(gl, r[0], true); foto = K.texture(gl, r[1], true);
        var P = r[2].p; n = r[2].n;
        var buf = new Float32Array(n * 8), seed = 1234567;
        function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
        for (var i = 0; i < n; i++) {
          buf[i * 8] = P[i * 6] / 1000; buf[i * 8 + 2] = P[i * 6 + 2] / 1000;
          /* x und y in Bildbreiten: mal uIA ergibt Weltkoordinaten (Bildhoehe = 1) */
          buf[i * 8 + 1] = P[i * 6 + 1] / 1000;
          buf[i * 8 + 3] = P[i * 6 + 3] / 255; buf[i * 8 + 4] = P[i * 6 + 4] / 255; buf[i * 8 + 5] = P[i * 6 + 5] / 255;
          buf[i * 8 + 6] = rnd(); buf[i * 8 + 7] = rnd();
        }
        vao = gl.createVertexArray(); gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
        gl.bindVertexArray(null);
        return {
          draw: function (f) {
            var s = f.s, c = s.cam, k = f.clock, a = f.idle ? 1.5 : 1, z = c[2] * (1 + Math.sin(k * .31) * .012 * a);
            /* Neigen des Handys schiebt den Blick ein wenig, das Licht wandert mit */
            var cx = c[0] + (Math.sin(k * .23) * .006 * a + f.tilt.x * .012) / z, cy = c[1] + (Math.cos(k * .19) * .005 * a + f.tilt.y * .010) / z;
            gl.viewport(0, 0, f.w, f.h); gl.disable(gl.BLEND);
            gl.useProgram(bg.p); var u = bg.u;
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, grund); gl.uniform1i(u.uGrund, 0);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, foto); gl.uniform1i(u.uFoto, 1);
            gl.uniform2f(u.uRes, f.w, f.h); gl.uniform1f(u.uIA, ia); gl.uniform3f(u.uCam, cx, cy, z); gl.uniform1f(u.uTime, k);
            gl.uniform1f(u.uRelief, s.relief); gl.uniform1f(u.uLicht, s.licht + f.tilt.x * .12); gl.uniform1f(u.uDunkel, s.dunkel); gl.uniform1f(u.uFotoMix, s.foto);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            if (s.foto >= 1) return;
            gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.useProgram(pt.p); u = pt.u;
            gl.uniform2f(u.uRes, f.w, f.h); gl.uniform1f(u.uIA, ia); gl.uniform3f(u.uCam, cx, cy, z); gl.uniform1f(u.uTime, k);
            gl.uniform1f(u.uAlpha, s.punkte * (1 - s.foto)); gl.uniform1f(u.uLose, s.lose); gl.uniform1f(u.uBroeckeln, s.broeckeln);
            gl.uniform1f(u.uAufloesen, s.aufloesen); gl.uniform1f(u.uBluehen, s.bluehen); gl.uniform1f(u.uZwischen, s.zwischen); gl.uniform1f(u.uDunkel, s.dunkel);
            gl.uniform2f(u.uAuge, ORT.auge[0], ORT.auge[1]);
            gl.bindVertexArray(vao); gl.drawArrays(gl.POINTS, 0, n); gl.bindVertexArray(null);
          }
        };
      });
    }
  });
})();

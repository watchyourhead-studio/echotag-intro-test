/* Susanne Kirsch, "Barfuss durch New York": Flug in die Collage.
   Das Foto bleibt unveraendert; eine Tiefenkarte (tiefe.png) hebt Papier und Spruehlinien vom Grund ab.
   Die Kamera folgt dem, was die Kuenstlerin gerade sagt. Orte im Bild: x/y von 0 bis 1, links oben = 0/0. */
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
  function cam(t, ort, zoom) { return [t, [ORT[ort][0], ORT[ort][1], zoom]]; }

  Echo.start({
    subs: 'untertitel.json', duration: 62.5,
    tracks: {
      /* Kamera: Zeit, Ort, Zoom (1 = ganzes Werk an der Wand) */
      cam: [
        cam(0, 'schrift', 4.4),
        cam(0.5, 'schrift', 4.6),
        cam(2.6, 'manhattan', 3.3),     /* dem Pfeil nach in den Stadtplan */
        cam(7.2, 'ganz', 1.0),          /* "... Barfuss durch New York." das ganze Werk */
        cam(7.9, 'ganz', 1.02),
        cam(11.4, 'nyc', 2.5),          /* "New York fasziniert mich ..." */
        cam(12.0, 'nyc', 2.55),
        cam(15.8, 'farbe', 2.0),        /* "ihre Energie, ihre Gegensaetze" */
        cam(19.6, 'sprueh', 2.1),       /* "zu Fuss durch ihre Strassen" */
        cam(20.3, 'sprueh', 2.12),
        cam(25.0, 'ganz', 1.25),        /* "auf die Leinwand bringen" */
        cam(29.4, 'naht', 2.3),         /* "Malerei und Collage" */
        cam(30.5, 'naht', 2.35),
        cam(34.2, 'plakat', 3.6),       /* "alte Werbeplakate" */
        cam(35.5, 'plakat', 3.7),
        cam(37.3, 'hotel', 4.2),        /* "Hotels, in denen ich gewohnt habe" */
        cam(38.0, 'hotel', 4.25),
        cam(39.3, 'manhattan', 3.9),    /* "Manhattan" */
        cam(40.6, 'brooklyn', 3.9),     /* "und Brooklyn" */
        cam(44.6, 'brooklyn', 3.4),
        cam(47.0, 'highline', 4.3),     /* "Highline" */
        cam(50.6, 'highline', 4.0),
        cam(54.8, 'taxi', 3.3),         /* "ein ganz persoenliches Stueck New York" */
        cam(56.0, 'taxi', 3.2),
        cam(61.5, 'ganz', 1.0),         /* "mein Gefuehl und meine Erinnerung" */
        cam(64.5, 'ganz', 0.94)
      ],
      /* wie weit die Schichten auseinandertreten */
      heben: [[0, .55], [0.5, .7], [3, 1.5], [7.2, .9], [12, 1.0], [19, 1.25], [25, 1.0], [29.4, 1.6], [34, 1.1], [54, 1.0], [59.5, .5], [61.5, 0], [70, 0]],
      /* Schaerfeebene: 0 Leinwand, .5 Papier, 1 Spruehlinien */
      fokus: [[0, .15], [2.6, .5], [7.2, .3], [11.4, .5], [15.8, .3], [19.6, .9], [25, .3], [29.4, .45], [34.2, .5], [56, .5], [61.5, .3]],
      unschaerfe: [[0, 1.3], [3, 2.0], [7.2, .35], [11.4, 1.2], [19.6, 1.5], [25, .4], [29.4, 1.3], [56, 1.2], [60, .3], [61.5, 0], [70, 0]],
      puls: [[0, 0], [9.5, 0], [10.6, 1], [15.5, 1], [17, 0], [70, 0]]
    },
    scene: function (gl, K) {
      var FS = '#version 300 es\nprecision highp float;in vec2 vP;out vec4 o;\n' + K.CAM_GLSL +
        'uniform sampler2D uTex,uDep;uniform vec2 uTilt;uniform float uLift,uFocus,uBlur,uPulse,uTime;\n' +
        'float box(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}\n' +
        'void main(){\n' +
        ' vec2 w=world(vP);vec2 uv0=vec2(w.x/uIA,w.y);float vh=viewH();\n' +
        /* Wand hinter dem Werk, mit Schlagschatten */
        ' vec2 q=vec2(w.x-.5*uIA,w.y-.5);float sd=box(q,vec2(.5*uIA,.5));\n' +
        ' float sh=smoothstep(.09,-.01,box(q-vec2(.012,.022),vec2(.5*uIA,.5)));\n' +
        ' vec3 wall=vec3(.925,.9,.855)*(1.-.07*length(vP))*(1.-.34*sh);\n' +
        ' float lift=uLift*(1.+.12*uPulse*sin(uTime*5.2));\n' +
        /* Versatz je Tiefe: Neigung des Handys plus Perspektive zur Bildmitte hin */
        ' vec2 off=(uTilt*.011+vec2(vP.x*uRes.x/uRes.y,-vP.y)*vh*.050)*lift;\n' +
        ' vec2 uv=uv0;float d=0.;\n' +
        ' for(int i=0;i<5;i++){d=texture(uDep,uv).r;uv=uv0-(d-uFocus)*off;}\n' +
        ' d=texture(uDep,uv).r;\n' +
        /* vordere Schichten werfen Schatten auf das, was dahinter liegt */
        ' float dn=texture(uDep,uv-vec2(.010,.016)*lift*vec2(1./uIA,1.)).r;\n' +
        ' float shade=clamp((dn-d)*2.2,0.,1.)*min(lift,1.3)*.36;\n' +
        /* Schaerfentiefe ueber die Bildverkleinerungen, vier Proben gegen Kloetzchen */
        ' float lod=clamp(abs(d-uFocus)*uBlur*1.5,0.,5.);\n' +
        ' vec2 px=exp2(lod)/vec2(textureSize(uTex,0))*.6;\n' +
        ' vec3 c=textureLod(uTex,uv,lod).rgb*.4;\n' +
        ' c+=textureLod(uTex,uv+px*vec2(.7,.7),lod).rgb*.15+textureLod(uTex,uv+px*vec2(-.7,.7),lod).rgb*.15;\n' +
        ' c+=textureLod(uTex,uv+px*vec2(.7,-.7),lod).rgb*.15+textureLod(uTex,uv+px*vec2(-.7,-.7),lod).rgb*.15;\n' +
        ' c*=1.-shade;\n' +
        ' c=mix(c,c*1.06+.012*sin(uTime*5.2),uPulse*.5);\n' +
        ' float aa=fwidth(sd);float inside=smoothstep(aa,-aa,sd);\n' +
        ' vec3 col=mix(wall,c,inside);\n' +
        ' col*=1.-.10*smoothstep(.006,0.,abs(sd))*(1.-inside);\n' +
        ' o=vec4(col,1.);}';
      var prog = K.program(gl, K.QUAD_VS, FS), tex, dep, ia;
      return Promise.all([K.loadImage('werk.jpg'), K.loadImage('tiefe.png')]).then(function (im) {
        ia = im[0].naturalWidth / im[0].naturalHeight;
        tex = K.texture(gl, im[0], true); dep = K.texture(gl, im[1], false);
        return {
          draw: function (f) {
            var u = prog.u, c = f.s.cam, k = f.clock;
            gl.viewport(0, 0, f.w, f.h); gl.useProgram(prog.p);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u.uTex, 0);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, dep); gl.uniform1i(u.uDep, 1);
            gl.uniform2f(u.uRes, f.w, f.h); gl.uniform1f(u.uIA, ia); gl.uniform1f(u.uTime, k);
            /* die Kamera steht nie ganz still: langsames Atmen, im Startbild etwas mehr */
            var a = f.idle ? 1.6 : 1, z = c[2];
            gl.uniform3f(u.uCam, c[0] + Math.sin(k * .23) * .006 * a / z, c[1] + Math.cos(k * .19) * .005 * a / z, z * (1 + Math.sin(k * .31) * .012 * a));
            gl.uniform2f(u.uTilt, f.tilt.x + Math.sin(k * .37) * .35, f.tilt.y + Math.cos(k * .29) * .3);
            gl.uniform1f(u.uLift, f.s.heben); gl.uniform1f(u.uFocus, f.s.fokus); gl.uniform1f(u.uBlur, f.s.unschaerfe); gl.uniform1f(u.uPulse, f.s.puls);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
          }
        };
      });
    }
  });
})();

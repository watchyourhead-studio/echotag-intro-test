# Übergabe: Intro-Video „Umschlag öffnet sich" für v7b (neuer Chat)

Kopiere alles ab „PROMPT" in einen neuen Chat im Repo `echotag-intro-test`.

---

## PROMPT

Wir arbeiten an der EchoTag-Weihnachtskarte im Repo `/Users/maximilianillig/Documents/GitHub/echotag-intro-test`. Lies zuerst diese Datei komplett (`daynight/UEBERGABE-umschlag-video.md`), dann `v7b/index.html` und in `v7b/app.js` die Abschnitte `var T = {`, `Intro-Film` und `function open()`.

### Stand
- **v7b** (live: https://watchyourhead-studio.github.io/echotag-intro-test/v7b/?name=Max) startet mit einem Intro-Video: `v7b/umschlag.mp4` (Poster `v7b/umschlag-start.jpg`). Danach zeichnet eine Feder die Paris-Szene auf das Kartenpapier `v7b/papier.jpg`, dann Nacht, Lichter, Player mit Sprachnachricht. Das alles funktioniert und bleibt unverändert.
- **v7** ist die gesicherte Version ohne Intro. Nicht anfassen. **v8 gehört einem Kollegen (Instinct). Dort nichts anlegen.**
- Das aktuelle Intro-Video ist gut, aber die **Perspektive ist falsch**: Der Umschlag liegt klein auf dem Tisch, und die Kamera fährt am Ende auf die Karte. Das soll ersetzt werden.

### Was ich will
Ein neues Intro-Video in der Art des Umschlags von https://www.thedigitalyes.com/ (Demo „Day & Night“ / „Embroidered Garden“), aber **ohne Schnörkel**:
- **Kamera exakt von oben, komplett starr.** Kein Zoom, keine Fahrt, kein Schwenk.
- Der **Umschlag füllt das ganze 9:16-Bild**, Rückseite mit Lasche nach unten. Weil von oben auf den Umschlag gezoomt ist, stellt sich die Frage Hoch- oder Querformat nicht.
- **Papier, Farben und Licht wie bei unserem bisherigen Umschlag** (Startbild Variante A, siehe unten): cremefarbenes, dickes Baumwoll-/Büttenpapier mit gerissener Kante, warmes Fensterlicht von oben links mit weichen Lichtbahnen und Schatten, weinrotes Futter innen, dunkelblaues Leinen höchstens am Rand sichtbar.
- **Die Lasche öffnet sich realistisch nach oben** und gibt das weinrote Futter frei. Danach **gleitet die Karte heraus und hebt sich zur Kamera**, bis ihr leeres cremefarbenes Papier das ganze Bild füllt. Die Bewegung kommt vom Papier, nie von der Kamera.
- **Siegel:** entweder **gar keins**, oder ein weinrotes Wachssiegel an der Laschenspitze, das **an der Lasche haften bleibt und mit nach oben geht**. Es darf nie brechen oder zerspringen, das sieht nie echt aus. Beide Varianten als Startbild anbieten.
- Kein Text, keine Hände, keine Deko, keine Ornamente, keine Bänder.

### Ablauf (bitte genau so)
1. **Startbild generieren und mir zur Abnahme zeigen, BEVOR ein Video generiert wird.** 4 Varianten: 2 ohne Siegel, 2 mit Siegel. Als Referenz für Papier, Farben und Licht dient unser bisheriges Startbild Variante A (Magnific-Creation `1lWbyt9r4r`, lokal `daynight/umschlag/start-a.png`). Modelle: `seedream-5-pro` und `imagen-nano-banana-2` (= Nano Banana Pro), jeweils `count: 2`, `aspectRatio: 9:16`, `resolution: 2k`, Referenz `{type: "image", identifier: "1lWbyt9r4r"}`. Kosten: etwa 75–100 Credits pro Bild. Bilder in `daynight/umschlag/` speichern, eine Vergleichsübersicht bauen (Python mit `/usr/bin/python3`, PIL ist dort installiert) und mir mit Einschätzung zeigen. **Warten, bis ich eine Variante wähle.**
2. **Video** mit Kling 4: `video_generate`, `slug: "kling-40"`, `aspectRatio: "9:16"`, `resolution: "1080p"`, `duration: 6` (ca. 1.680 Credits). `keyframes.start` = gewähltes Startbild, `keyframes.end` = Kartenpapier (Creation `bxGQykt5Y2` = `v7b/papier.jpg`), damit der Übergang ins Zeichnen nahtlos bleibt. Vorher die Kosten mit `simulate_cost` prüfen.
3. **Video prüfen**, bevor es eingebaut wird: Kontaktbogen (`ffmpeg -vf "fps=2,scale=200:-1,tile=6x2"`), Laschen- und Siegelmoment dicht prüfen (fps=8, Ausschnitt), letztes Bild mit `v7b/papier.jpg` vergleichen (mittlere Abweichung sollte unter etwa 4 liegen). Bei Morphing, Kamerabewegung oder brechendem Siegel lieber gezielt neu generieren als einbauen.
4. **Einbauen in v7b:**
   - `ffmpeg -i neu.mp4 -an -c:v libx264 -crf 23 -preset slow -profile:v high -pix_fmt yuv420p -movflags +faststart v7b/umschlag.mp4`
   - `ffmpeg -i neu.mp4 -frames:v 1 -q:v 3 v7b/umschlag-start.jpg`
   - In `v7b/app.js`: `INTRO_RATE`, den Zeitpunkt, an dem der Name weinrot wird (`3800 / INTRO_RATE`), und im Block `var T` die Werte `drawAt`, `paintAt`, `nightAt`, `cardAt` und `voiceAt` an die neue Filmlänge anpassen (`drawAt` ≈ Filmende).
   - Liegt der Umschlag jetzt im ganzen Bild, braucht der Name „FÜR MAX“ oben (`.greeting`) und der Knopf unten (`.open-btn`) eventuell eine andere Farbe für den Kontrast. Die Klasse `.stage.on-table` steuert die Farben vor dem Öffnen.
   - Den Cache-Zähler in `v7b/index.html` hochzählen (`?v=v7b17` → `v7b18`).
5. **Testen** im lokalen Server (läuft meist schon auf Port 8765, sonst `.claude/launch.json` „static“) mit `http://localhost:8765/v7b/?name=Max`, Handygröße 375×812. Startbild, Öffnen, Übergang ins Zeichnen und Konsolenfehler prüfen.
6. **Direkt committen und auf `main` pushen, ohne Rückfrage** (vorher `git fetch` + `git rebase origin/main`), dann prüfen, dass GitHub Pages den neuen Stand ausliefert.

### Prompt-Entwurf Startbild (anpassen, nicht blind übernehmen)
> Top-down photograph, camera exactly perpendicular above, of the back of a closed luxury greeting card envelope that fills the entire vertical 9:16 frame edge to edge. Thick cream cotton paper with soft deckled edges and fine natural texture, the pointed top flap closed and pointing down to the center of the frame. [Variante A: no seal, the flap simply tucked closed.] [Variante B: a deep wine-red wax seal with a small embossed star on the flap tip.] Exactly the same paper, cream color and warm window light as the reference image: soft warm light from the upper left with gentle diagonal light beams and soft shadows. Only a thin sliver of dark midnight-blue linen may show at the edges. Calm, elegant, premium stationery photography, ultra realistic. No text, no letters, no ornaments, no ribbon, no props, no hands.

### Prompt-Entwurf Video
> Locked-off top-down shot, the camera never moves, no zoom, no pan. The back of a cream cotton-paper envelope fills the whole frame. The pointed top flap slowly lifts and folds open upward on its crease with real paper physics, revealing a deep wine-red paper lining [Variante B: the wax seal stays attached to the flap tip and rises with it, it never breaks]. Then a thick blank cream card slides smoothly up out of the envelope and lifts toward the camera until its plain cream paper fills the entire frame, ending exactly on the final image: an evenly lit empty cream paper surface with fine grain. Warm diffuse window light from the upper left, soft shadows, photorealistic, premium stationery commercial, slow and graceful, no hands, no text, no extra objects, no morphing.

### Werkzeuge und Hinweise
- Magnific läuft über die MCP-Tools (`images_generate`, `video_generate`, `creations_wait`, `simulate_cost`, `account_balance`). Lokale Dateien hochladen: `creations_request_upload` → `curl -X PUT --data-binary @datei` → `creations_finalize_upload`.
- Generierte Ergebnisse über die URL aus `creations_wait` mit `curl` herunterladen.
- Python-Skripte mit `/usr/bin/python3` ohne `-I` starten, sonst fehlt PIL.
- In zsh bei Variablen vor einem Doppelpunkt `${X}` statt `$X` schreiben (`$X:e` ist sonst ein Modifier).
- Der Nutzer will Bilder **immer sehen, bevor weitere generiert werden**, und erwartet eine ehrliche Einschätzung jeder Variante.

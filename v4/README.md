# V4 - EchoTag Weihnachtskarte (3D-Gatefold + KI-Flugvideo)

Weihnachtsedition der 3D-Klappkarte aus V3. Der Flug ist KEIN programmierter
3D-Flug mehr: Max erzeugt ihn als KI-Video (Kling via Magnific) und legt die
MP4 einfach in diesen Ordner.

## Konzept (Max, 25.10.)
- Kartenfront: NUR eine Farbe (Tiefblau, CONFIG) + Empfaengername.
- Der Name ist eine Live-Textebene (Jost, DOM) und wird NIEMALS in
  Bild/Video-Material eingebrannt - dasselbe Material gilt fuer alle Empfaenger.
- Beim Oeffnen: Gatefold aus V3, dahinter Vollbild-Video (responsive, Cover).
- PLATZHALTER bis Max' Video fertig ist: sein Paris-Aquarell als Standbild
  (scene.jpg). Das Video ersetzt es ohne Code-Aenderung (siehe Video-Slot).
- Nach Video-Ende: letztes Bild (fertige Szene) bleibt stehen, Player-Karte
  landet, Sprachnachricht startet - Logik wie V3.
- Endszene: Schneeflocken sammeln sich auf der Oberkante des Players
  (Haube waechst, ab Schwellhoehe kippt ein Klumpen mit Gravitation ab).

## Video-Slot (Asset-Tausch ohne Code)
- Datei: 2-flug.mp4 in diesen Ordner legen. Fehlt sie, laeuft automatisch
  das Standbild scene.jpg (aktueller Zustand).
- Konstanten zentral oben in app.js: VIDEO_SRC, PLACEHOLDER_MS (Standbild-Dauer),
  SNOW (enabled / Flockenzahl / Hauben-Schwellwerte), COLORS (Kartenfront etc.).

## Palette (zentral in app.js COLORS aenderbar)
- Kartenfront: #22306E (Tiefblau), Name: #F6F1E8 (Creme, Live-Ebene)
- Schrift: Jost (fonts/jost-var.woff2, variabel 100-900, OFL)

## Technik
- Gatefold/3D-Karte: three.js wie V3, Front per Canvas gebacken (nur Farbe+Grain).
- Video: muted/playsinline, startet im Tap-Handler (iOS-tauglich), 'ended'
  loest die Player-Landung aus; Watchdog-Timer faengt Video-Haenger ab.
- Schnee: eigenes minimales Partikelsystem (Canvas 2D, kein Framework),
  Hoehenfeld-Haube auf der Player-Bounding-Box, Klumpen mit Gravitation,
  mobil reduzierte Flockenzahl, pausiert bei verstecktem Tab.

## Assets
- scene.jpg - Standbild aus Max' Paris-Aquarell (Platzhalter/Poster)
- 2-flug.mp4 - (kommt von Max) KI-Flugvideo
- sample-audio.mp3 - Max' Sample-Sprachnachricht (Platzhalter)
- fonts/jost-var.woff2 - Jost (SIL Open Font License 1.1)
- lib/three.min.js - three.js r149 (MIT)

## Debug
?name=Anna (Empfaengername, Live-Ebene), ?t=0..1 (Oeffnung einfrieren),
?state=open|player, ?auto=1

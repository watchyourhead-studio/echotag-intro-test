# V4 - EchoTag Weihnachtskarte (3D-Gatefold + Zeichen-Flug)

Weihnachtsedition der 3D-Klappkarte aus V3, mit Max' Aquarell-Weihnachtsszene
(Paris, Eiffelturm, rote Markise) als Welt hinter der Karte.

## Konzept (Max, 25.10.)
- Kartenfront: NUR eine Farbe (Tiefblau, CONFIG) + Empfaengername.
- Der Name ist eine Live-Textebene (Jost, DOM) und wird NIEMALS in
  Bild/Video-Material eingebrannt - dasselbe Material gilt fuer alle Empfaenger.
- Beim Oeffnen: Kamera fliegt leicht durch die Strasse, die Szenen-Elemente
  werden versetzt/gemischt gezeichnet: erst Striche (Stroke-Reveal von unten),
  dann Farbe (Fade mit Aquarell-Blur). Der Eiffelturm wird als Letztes fertig.
- Fertige Szene bleibt stehen, leichter Schnee faellt, Player-Karte landet,
  Sprachnachricht startet.

## Palette (zentral in app.js COLORS aenderbar)
- Kartenfront: #22306E (Tiefblau), Name: #F6F1E8 (Creme, Live-Ebene)
- Szene-Papier: #F4EBE4 (Cremeton aus dem Motiv)
- Schrift: Jost (fonts/jost-var.woff2, variabel 100-900, OFL)

## Technik
- Szene: Max' Aquarell (3106x4160) in 8 Tiefenebenen zerlegt (PIL, harte
  Masken, Papier-Luecken) als WebP in scene/: sky, tower, buildings-l/r,
  ground, awning, trees, people - je Farb- und Strich-Version (*-lines.webp).
- CSS-3D-Perspektive (1000px), Kamera-Dolly 320px waehrend SCENE_MS (6s).
- Stroke-Reveal per CSS-Mask-Wipe (--p), Farb-Fade mit Blur-Reduktion.
- Schnee: Canvas-Partikel, startet erst gegen Ende der Zeichenphase.

## Assets
- scene/*.webp - Ebenen aus Max' Motiv (Farbe + Strich)
- sample-audio.mp3 - Max' Sample-Sprachnachricht (Platzhalter)
- fonts/jost-var.woff2 - Jost (SIL Open Font License 1.1)
- lib/three.min.js - three.js r149 (MIT)

## Debug
?name=Anna (Empfaengername, Live-Ebene), ?t=0..1 (Oeffnung einfrieren),
?scene=0..1 (Szene einfrieren), ?state=open|player, ?auto=1

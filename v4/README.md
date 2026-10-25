# V4 - EchoTag Weihnachtskarte (3D-Gatefold)

Weihnachtsedition der 3D-Klappkarte aus V3, im Design der sprechenden Weihnachtskarte.

## Palette (zentral in app.js COLORS aenderbar)
- Kartengrund: #F6F1E8 (Creme)
- Tiefblau (Rahmen/Schrift): #22306E
- Akzent: #EBC7D2 (Pink)
- Kein Gold, keine Verlaeufe, keine Serifen. Schrift: Jost (fonts/jost-var.woff2, variabel 100-900, OFL).

## Assets
- motiv.jpg: Zentralszene aus Carine Landaus Aquarell (Frau am Fenster, Eiffelturm),
  aus carine-illustration.jpg (Drive, 1335x1337) zugeschnitten. Quelle in hoeherer
  Aufloesung ist ein offener Punkt.
- reveal.jpg: PLATZHALTER fuer die Welt hinter der Karte (flaches Tiefblau mit
  Schneepunkten). Wird ersetzt, sobald die weihnachtliche Ueberraschung nach dem
  Oeffnen feststeht.
- sample-audio.mp3: Max' Sample-Sprachnachricht (wie v1-v3).
- card-front-fallback.jpg: statisches Bild der geschlossenen Karte (No-WebGL-Fallback).

## Ablauf
Geschlossene Karte (randlos wie v2/v3) -> Tippen -> Gatefold oeffnet sich,
Kamera faehrt durch (nur Karte defokussiert) -> Reveal-Platzhalter ->
Player-Karte mit Sample-Audio (Autoplay nach Einflug, iOS-Unlock im Tap).

## Debug
?name=Anna (Empfaengername), ?t=0..1 (Oeffnung einfrieren), ?state=open|player, ?auto=1

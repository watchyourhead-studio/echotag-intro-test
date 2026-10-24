# Intro V3 - Echtes 3D-Gatefold

Eigenständiger Prototyp: physikalisch öffnende Gatefold-Karte (three.js, eigens
gebogene Papiergeometrie, echtes Kartenartwork als Textur), danach Blumenflug-Video
ab der reinen Blumenphase (2,6s), danach landet die Player-Karte (Testton).

## Parameter
- `?name=Emma` - Empfängername, wird druckähnlich auf die Kartenfront gebacken
  und teilt sich beim Öffnen physisch auf beide Flügel. Standard: Max.
- `?auto=1` - öffnet automatisch nach dem Laden (Testbetrieb)
- `?t=0.4` - friert die Öffnung bei 40% ein (Testbetrieb)
- `?state=open` / `?state=player` - sprungt in Endzustände (Testbetrieb)

## Verhalten
- Karte sofort sichtbar, Video lädt im Hintergrund (preload).
- Tap öffnet sofort (kein toter Tap); Ladehinweis nur, falls das Video hängt.
- Blumenflug läuft stumm; Ton (Testton) startet erst, wenn die Player-Karte gelandet ist.
- Ohne WebGL: statischer Fallback (Kartenbild -> Video).

## Assets
- card-front.jpg - freigegebenes Kartenartwork (905x1600)
- 1-intro.mp4 - optimierter Blumenflug (identisch zu v2/1-8-intro.mp4)
- 2-reveal.jpg - Videoframe bei 2,6s (Poster hinter der Karte)
- 3-endbild.jpg - Endstandbild (identisch zu v2/6-endbild.jpg)
- 4-testton.mp3 - Testton (identisch zu v2/7-testton.mp3)
- fonts/ - Oswald (SIL Open Font License 1.1, siehe OFL.txt)
- lib/three.min.js - three.js r149 (MIT)

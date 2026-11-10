# Airport Club Frankfurt – Werk-Intros (Entwurf)

Zwei Intros für die QR-Platten der Marniok Art Gallery. Jede Seite zeigt nach einem Tipp eine
Kamerafahrt durch das Werk, die der Sprachaufnahme des Künstlers folgt, mit Untertiteln Wort für Wort.

- `poersch/` – Thorsten Poersch, „Schönheit & Vergänglichkeit“: die Punkte schweben räumlich vor dem Putz und fügen sich nur von
  einem Standpunkt aus zum Gesicht. Die Kamera fliegt durch die Punktwolke dorthin; Neigen lässt es zerfallen. Punkte bröckeln, lösen sich auf und blühen neu auf, passend zum Text.
- `kirsch/` – Susanne Kirsch, „Barfuß durch New York“: Start bei der Handschrift „Frankfurt → New York“,
  Flug in die Collage als Relief, die Kamera besucht die Stellen, von denen sie spricht. Schluss im hellen Loft.
- `raum/` – Raumbild für den Schluss (mit Magnific erzeugt) samt Tiefenkarte. Das Werk wird als echtes Foto
  hineingesetzt; wo es hängt und wie groß, steht in `RAUM` oben in `poersch/szene.js`.
- `lib/echo.js` – gemeinsamer Ablauf (Start-Tipp, Stimme, Untertitel, Zeitspuren, Neigung, Schlussbild).

## Bild austauschen

Neues Foto nach `src/` legen (frontal, gleichmäßig ausgeleuchtet, lange Kante ab 3000 px), dann:

    python3 tools/poersch_punkte.py src/poersch-foto.jpg poersch/
    python3 tools/kirsch_tiefe.py src/kirsch-foto.jpg kirsch/

Benötigt `numpy` und `opencv-python-headless`. Die Orte im Bild und die Zeiten stehen oben in der
jeweiligen `szene.js` (`ORT` und `tracks`) und müssen bei anderem Bildausschnitt angepasst werden.

## Ansehen ohne Ton

`?t=36` an die Adresse hängen zeigt den Stand bei Sekunde 36 als Standbild.

## Ton

Stimme und Klangebene sind je Werk zu einer Datei gemischt (`poersch/ton.mp3`, `kirsch/ton.mp3`).
Quellen liegen in `src/ton/`, Zeiten und Lautstärken stehen in `tools/poersch_ton.sh` und `tools/kirsch_ton.sh`:

    sh tools/poersch_ton.sh
    sh tools/kirsch_ton.sh

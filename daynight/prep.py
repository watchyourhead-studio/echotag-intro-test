# Bereitet die v7-Assets vor: Tag/Dunkel/Nacht auf 1080x1920 und eine
# Licht-Reihenfolge-Karte (R = Einschaltzeitpunkt, G = Funkeln, B = Phase).
import random
from collections import deque
import numpy as np
from PIL import Image

SRC = 'daynight/bilder/'
OUT = 'v7/'
W, H = 1080, 1920
random.seed(7)

def load(name):
    return Image.open(SRC + name).convert('RGB').resize((W, H), Image.LANCZOS)

tag, dunkel, nacht = load('tag.jpg'), load('aus-a.png'), load('nacht-a.png')
for im, n in ((tag, 'tag'), (dunkel, 'dunkel'), (nacht, 'nacht')):
    im.save(OUT + n + '.jpg', quality=86, optimize=True, progressive=True)

# Lichtmaske auf halber Aufloesung: warme Aufhellung Nacht gegenueber Dunkel
w, h = W // 2, H // 2
a = np.asarray(dunkel.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255
b = np.asarray(nacht.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255
lum = lambda x: x[..., 0] * .3 + x[..., 1] * .59 + x[..., 2] * .11
diff = lum(b) - lum(a) + (b[..., 0] - a[..., 0]) * .5
core = diff > 0.12

# Zusammenhaengende Lichtquellen finden (4er-Nachbarschaft)
label = np.zeros((h, w), np.int32)
blobs = []
for y0 in range(h):
    for x0 in np.nonzero(core[y0] & (label[y0] == 0))[0]:
        if label[y0, x0]:
            continue
        idx = len(blobs) + 1
        q = deque([(y0, x0)]); label[y0, x0] = idx; pts = []
        while q:
            y, x = q.popleft(); pts.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and core[ny, nx] and not label[ny, nx]:
                    label[ny, nx] = idx; q.append((ny, nx))
        ys, xs = zip(*pts)
        blobs.append((len(pts), sum(xs) / len(xs), sum(ys) / len(ys)))

order = np.full((h, w), 255, np.uint8)
spark = np.zeros((h, w), np.uint8)
phase = np.zeros((h, w), np.uint8)
big = max(blobs, key=lambda b_: b_[0])
for i, (area, cx, cy) in enumerate(blobs, 1):
    m = label == i
    if (area, cx, cy) == big:
        o, s = 0.02, 0                                   # Cafe-Glut zuerst
    elif area >= 60:
        o, s = random.uniform(0.08, 0.55), 0             # Fenster nacheinander
    else:
        o, s = 0.55 + 0.35 * cx / w + random.uniform(-.04, .04), 255  # Lichtpunkte, links nach rechts
    order[m] = int(np.clip(o, 0, 1) * 254)
    spark[m] = s
    phase[m] = random.randrange(256)

# Weichen Lichtschein um die Quellen der naechsten Quelle zuordnen
for _ in range(40):
    free = order == 255
    if not free.any():
        break
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        sh_o = np.roll(order, (dy, dx), (0, 1)); sh_s = np.roll(spark, (dy, dx), (0, 1)); sh_p = np.roll(phase, (dy, dx), (0, 1))
        take = free & (sh_o != 255)
        order[take] = sh_o[take]; spark[take] = sh_s[take] // 2; phase[take] = sh_p[take]
        free = order == 255
order[order == 255] = 128

Image.fromarray(np.dstack([order, spark, phase])).save(OUT + 'lichter.png', optimize=True)
print('Lichtquellen:', len(blobs), 'davon Funkelpunkte:', sum(1 for b_ in blobs if b_[0] < 60))

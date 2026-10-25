# Bereitet die v7b-Assets vor (Zeichnen-Intro):
#   papier.jpg  leeres Kartenpapier (Tusche-Ebene ohne Linien)
#   tusche.jpg  nur die Tuschelinien
#   zeichnen.png  R = wann die Feder dieses Pixel zieht, G = wann das Aquarell hier einlaeuft
# Dazu wie in v7: tag/dunkel/nacht.jpg, lichter.png (mit Julias Ladenfenster und Laterne), turm.json.
# Aufruf aus dem Repo-Wurzelordner: /usr/bin/python3 daynight/prep7b.py
import json
import random
from collections import deque
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = 'daynight/bilder/'
OUT = 'v7b/'
W, H = 1080, 1920
random.seed(7)
rng = np.random.default_rng(7)

def load(name):
    return Image.open(SRC + name).convert('RGB').resize((W, H), Image.LANCZOS)

tag, dunkel, nacht, tusche = load('tag.jpg'), load('aus-a.png'), load('nacht2-b.png'), load('tusche-b.png')

# ---------- Papier: Tusche-Ebene mit herausgerechneten Linien ----------
t = np.asarray(tusche).astype(np.float32)
lum = t @ np.array([.3, .59, .11], np.float32)
ink = np.clip((215 - lum) / 120, 0, 1)                      # Linienstaerke 0..1
# Leeres Papier ohne Geisterbilder: Farbverlauf aus den reinen Papierraendern des
# Originals (linker und rechter Rand, zeilenweise), dazu Papierkorn. Die Tusche
# legt sich im Shader nur ueber ihre Linienstaerke darauf, nie mit ihren Flecken.
tg_full = np.asarray(tag).astype(np.float32)
edge = np.concatenate([tg_full[:, 4:22], tg_full[:, W - 22:W - 4]], axis=1)
rows = np.median(edge, axis=1)                                  # H x 3
k = 401
rows = np.stack([np.convolve(np.pad(rows[:, c], k // 2, mode='edge'), np.ones(k) / k, 'valid') for c in range(3)], 1)
paper = np.repeat(rows[:, None, :], W, axis=1)
grain = rng.normal(0, 1.4, (H, W, 1)).astype(np.float32)
paper = np.clip(paper + grain, 0, 255)

for im, n in ((tag, 'tag'), (dunkel, 'dunkel'), (nacht, 'nacht'), (tusche, 'tusche')):
    im.save(OUT + n + '.jpg', quality=86, optimize=True, progressive=True)
Image.fromarray(paper.astype(np.uint8)).save(OUT + 'papier.jpg', quality=88, optimize=True, progressive=True)

# ---------- Lichter (wie v7) ----------
w, h = W // 2, H // 2
a = np.asarray(dunkel.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255
b = np.asarray(nacht.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255
L = lambda x: x[..., 0] * .3 + x[..., 1] * .59 + x[..., 2] * .11
diff = L(b) - L(a) + (b[..., 0] - a[..., 0]) * .5

def components(mask, conn8=False):
    lab = np.zeros(mask.shape, np.int32); comps = []
    nb = ((1, 0), (-1, 0), (0, 1), (0, -1)) + (((1, 1), (1, -1), (-1, 1), (-1, -1)) if conn8 else ())
    hh, ww = mask.shape
    for y0 in range(hh):
        for x0 in np.nonzero(mask[y0] & (lab[y0] == 0))[0]:
            if lab[y0, x0]:
                continue
            idx = len(comps) + 1
            q = deque([(y0, x0)]); lab[y0, x0] = idx; pts = []
            while q:
                y, x = q.popleft(); pts.append((y, x))
                for dy, dx in nb:
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < hh and 0 <= nx < ww and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = idx; q.append((ny, nx))
            comps.append(pts)
    return lab, comps

label, blobs = components(diff > 0.12)
order = np.full((h, w), 255, np.uint8); spark = np.zeros((h, w), np.uint8); phase = np.zeros((h, w), np.uint8)
big = max(range(len(blobs)), key=lambda i: len(blobs[i]))
for i, pts in enumerate(blobs):
    area = len(pts); cx = sum(p[1] for p in pts) / area
    m = label == i + 1
    if i == big:
        o, s = 0.02, 0
    elif area >= 60:
        o, s = random.uniform(0.08, 0.55), 0
    else:
        o, s = 0.55 + 0.35 * cx / w + random.uniform(-.04, .04), 255
    order[m] = int(np.clip(o, 0, 1) * 254); spark[m] = s; phase[m] = random.randrange(256)
for _ in range(40):
    free = order == 255
    if not free.any():
        break
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        so = np.roll(order, (dy, dx), (0, 1)); ss = np.roll(spark, (dy, dx), (0, 1)); sp = np.roll(phase, (dy, dx), (0, 1))
        take = free & (so != 255)
        order[take] = so[take]; spark[take] = ss[take] // 2; phase[take] = sp[take]
        free = order == 255
order[order == 255] = 128
Image.fromarray(np.dstack([order, spark, phase])).save(OUT + 'lichter.png', optimize=True)
print('Lichtquellen:', len(blobs))

# ---------- Zeichnen: die Feder folgt jedem Strich ----------
inkh = np.asarray(Image.fromarray((ink * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)) / 255
stroke = inkh > .12
slab, strokes = components(stroke, conn8=True)
tower = [(.448, .215), (.465, .215), (.485, .33), (.51, .41), (.545, .49), (.545, .52), (.38, .52), (.38, .49), (.41, .41), (.435, .33)]
tm = Image.new('L', (w, h), 0); ImageDraw.Draw(tm).polygon([(x * w, y * h) for x, y in tower], fill=255)
tm = np.asarray(tm) > 0

def group(cx, cy, ys, xs):
    if tm[int(cy), int(cx)]:
        return 1                                            # Eiffelturm
    fx, fy = cx / w, cy / h
    if fy > .6 and .3 < fx < .62:
        return 3                                            # Passanten vorne
    if (fx < .24 and fy > .5) or (fx > .74 and fy > .52) or (.33 < fx < .38 and .52 < fy < .62):
        return 2                                            # Baeume
    if fy > .58:
        return 3                                            # kleine Figuren, Boden
    return 0                                                # Haeuser
span = {0: (0., .5), 1: (.28, .62), 2: (.5, .8), 3: (.66, .93)}
draw = np.full((h, w), 255, np.uint8)
groups = {0: [], 1: [], 2: [], 3: []}
for i, pts in enumerate(strokes):
    ys = np.array([p[0] for p in pts]); xs = np.array([p[1] for p in pts])
    groups[group(xs.mean(), ys.mean(), ys, xs)].append(i)
longest = max(len(s) for s in strokes)
for g, ids in groups.items():
    ids.sort(key=lambda i: (min(p[0] for p in strokes[i]) + random.uniform(-25, 25)))  # von oben nach unten
    lo, hi = span[g]
    for rank, i in enumerate(ids):
        pts = strokes[i]
        # Feder setzt am obersten Punkt an und folgt dem Strich (Breitensuche entlang der Linie)
        start = min(pts)
        dist = {start: 0}; q = deque([start]); mx = 0
        sset = set(pts)
        while q:
            y, x = q.popleft(); d = dist[(y, x)]
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    n = (y + dy, x + dx)
                    if n in sset and n not in dist:
                        dist[n] = d + 1; mx = max(mx, d + 1); q.append(n)
        t0 = lo + (hi - lo) * rank / max(1, len(ids)) * .82
        dur = .05 + .17 * (len(pts) / longest) ** .5
        for (y, x), d in dist.items():
            draw[y, x] = int(np.clip(t0 + dur * d / max(1, mx), 0, 1) * 254)
# Kantenpixel der Linien (unter der Schwelle) erben den Zeitpunkt der Nachbarn
for _ in range(6):
    free = draw == 255
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        sh = np.roll(draw, (dy, dx), (0, 1))
        take = free & (sh != 255)
        draw[take] = sh[take]
        free = draw == 255
draw[draw == 255] = 254
print('Striche:', len(strokes), {g: len(v) for g, v in groups.items()})

# ---------- Malen: Aquarell blueht von einzelnen Tropfen aus ----------
tg = np.asarray(tag.resize((w, h), Image.LANCZOS)).astype(np.float32)
ts = np.asarray(tusche.resize((w, h), Image.LANCZOS)).astype(np.float32)
colored = np.abs(tg - ts).sum(2) > 18
yy, xx = np.nonzero(colored)
seeds = rng.choice(len(yy), 90, replace=False)
paint = np.full((h, w), 1e9, np.float32)
q = deque()
for k, s in enumerate(seeds):
    y, x = yy[s], xx[s]
    # Reihenfolge wie beim Zeichnen: oben zuerst, Passanten zuletzt
    paint[y, x] = (y / h) * 120 + rng.uniform(0, 60)
    q.append((y, x))
grow = np.ones((h, w), np.float32) + np.asarray(Image.fromarray((rng.random((h // 8, w // 8)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)) / 255 * 1.6
while q:
    y, x = q.popleft(); v = paint[y, x]
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w:
            nv = v + grow[ny, nx] * (1. if colored[ny, nx] else 1.8)
            if nv < paint[ny, nx]:
                paint[ny, nx] = nv; q.append((ny, nx))
p = paint.copy()
p = (p - p.min()) / (np.percentile(p, 99.5) - p.min())
paintmap = (np.clip(p, 0, 1) * 254).astype(np.uint8)
Image.fromarray(np.dstack([draw, paintmap, np.zeros_like(draw)])).save(OUT + 'zeichnen.png', optimize=True)

# ---------- Eiffelturm-Punkte (wie v7) ----------
pm = Image.new('L', (W, H), 0)
ImageDraw.Draw(pm).polygon([(x * W, y * H) for x, y in tower], fill=255)
g = np.asarray(tag.convert('L')).astype(np.int16)
ys, xs = np.nonzero((g < 165) & (np.asarray(pm) > 0))
pick = random.sample(range(len(xs)), min(600, len(xs)))
pts = [[round(xs[i] / W, 4), round(ys[i] / H, 4)] for i in pick]
# Turmfuesse unten sind in der Nacht hinter den Haeusern: dort kein Funkeln
pts = [p for p in pts if p[1] < .488 and not (p[0] < .405 and p[1] > .47) and not (p[0] > .515 and p[1] > .47)]
with open(OUT + 'turm.json', 'w') as f:
    json.dump(pts, f, separators=(',', ':'))
print('fertig')

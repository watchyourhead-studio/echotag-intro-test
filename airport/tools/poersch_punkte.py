"""Zerlegt das Portraet in Grund (Putz ohne Punkte) und einzelne Punkte.
Aufruf: python3 tools/poersch_punkte.py src/poersch-foto.jpg poersch/
Ergebnis: grund.jpg, werk.jpg, punkte.json (x, y, radius, r, g, b je Punkt; x/y/radius in Tausendstel der Bildbreite).
Bei einem neuen Foto nur neu ausfuehren."""
import sys, json, numpy as np, cv2
src, out = sys.argv[1], sys.argv[2]
im = cv2.imread(src); H, W = im.shape[:2]
rng = np.random.default_rng(7)
lum = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
u = W / 538.0  # Massstab: Werte unten sind fuer 538 px Breite abgestimmt
# Putz-Helligkeit ohne Punkte: grosses Schliessen, dann weich
bg = cv2.morphologyEx(lum, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(23 * u) | 1,) * 2))
bg = cv2.GaussianBlur(bg, (0, 0), 6 * u)
dark = np.clip(bg - lum, 0, 1)
b, g, r = [im[..., i].astype(np.float32) for i in range(3)]
cool = (b - r) > -6  # Punkte sind blaugrau bis schwarz, Putzschatten warm
mask = ((dark > 0.17) & cool) | (lum < 0.24)
mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
# Grund: Punkte herausrechnen. Luecken weich aus der Umgebung fuellen (gewichtetes Weichzeichnen
# in mehreren Stufen), danach Putzkoernung aus einer freien Stelle des Bildes darueberlegen.
big = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(5 * u) | 1,) * 2))
keep = (1 - big).astype(np.float32)
fill = np.zeros_like(im, np.float32); wsum = np.zeros((H, W), np.float32)
for sig in (3, 6, 12, 24, 48):
    wgt = cv2.GaussianBlur(keep, (0, 0), sig * u)
    col = cv2.GaussianBlur(im.astype(np.float32) * keep[..., None], (0, 0), sig * u)
    use = np.clip(wgt * 4, 0, 1) * (1 - np.clip(wsum, 0, 1))
    fill += col / np.maximum(wgt, 1e-4)[..., None] * use[..., None]; wsum += use
fill /= np.maximum(wsum, 1e-4)[..., None]
py0, px0, ph, pw = int(.44 * H), int(.50 * W), int(.14 * H), int(.26 * W)
pat = im[py0:py0 + ph, px0:px0 + pw].astype(np.float32)
pat = pat - cv2.GaussianBlur(pat, (0, 0), 5 * u)
pat = np.hstack([pat, pat[:, ::-1]]); pat = np.vstack([pat, pat[::-1]])
korn = np.tile(pat, (H // pat.shape[0] + 1, W // pat.shape[1] + 1, 1))[:H, :W]
soft = cv2.GaussianBlur(big.astype(np.float32), (0, 0), 1.5 * u)[..., None]
grund = np.clip(im * (1 - soft) + (fill + korn * 0.7) * soft, 0, 255).astype(np.uint8)
# Punkte: versetztes Raster mit Streuung, Groesse nach Dunkelheit
sp = 6.4 * u; pts = []
md = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 1.6 * u)
row = 0; y = sp / 2
while y < H:
    x = sp / 2 + (sp / 2 if row % 2 else 0)
    while x < W:
        px = x + rng.normal(0, sp * .22); py = y + rng.normal(0, sp * .22)
        ix, iy = int(np.clip(px, 0, W - 1)), int(np.clip(py, 0, H - 1))
        m = md[iy, ix]
        if m > 0.5:
            y0, y1, x0, x1 = max(0, iy - 2), iy + 3, max(0, ix - 2), ix + 3
            patch = im[y0:y1, x0:x1].reshape(-1, 3); pm = mask[y0:y1, x0:x1].reshape(-1) > 0
            col = np.median(patch[pm], axis=0) if pm.sum() > 2 else patch.mean(axis=0)
            rad = sp * (0.50 + 0.26 * min(1, (m - .5) / .45)) * rng.uniform(.88, 1.12)
            pts += [round(float(px) / W * 1000, 1), round(float(py) / W * 1000, 1), round(float(rad) / W * 1000, 2), int(col[2]), int(col[1]), int(col[0])]
        x += sp
    y += sp * .866; row += 1
json.dump({'w': W, 'h': H, 'n': len(pts) // 6, 'p': pts}, open(out + 'punkte.json', 'w'), separators=(',', ':'))
s = 2
cv2.imwrite(out + 'grund.jpg', cv2.resize(grund, (W * s, H * s), interpolation=cv2.INTER_CUBIC), [cv2.IMWRITE_JPEG_QUALITY, 84])
cv2.imwrite(out + 'werk.jpg', cv2.resize(im, (W * s, H * s), interpolation=cv2.INTER_CUBIC), [cv2.IMWRITE_JPEG_QUALITY, 86])
# Kontrollbild: Grund + Punkte neben dem Original
chk = cv2.resize(grund, (W * s, H * s), interpolation=cv2.INTER_CUBIC)
for i in range(0, len(pts), 6):
    cv2.circle(chk, (int(pts[i] / 1000 * W * s), int(pts[i + 1] / 1000 * W * s)), int(round(pts[i + 2] / 1000 * W * s)), (pts[i + 5], pts[i + 4], pts[i + 3]), -1, cv2.LINE_AA)
cv2.imwrite(sys.argv[3] if len(sys.argv) > 3 else out + '_kontrolle.jpg', np.hstack([cv2.resize(im, (W * s, H * s)), chk, cv2.resize(grund, (W * s, H * s))]))
print('punkte', len(pts) // 6)

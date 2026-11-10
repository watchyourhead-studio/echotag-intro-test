"""Erzeugt aus dem Werkfoto die Tiefenkarte fuer den Flug in die Collage.
Aufruf: python3 tools/kirsch_tiefe.py src/kirsch-foto.jpg kirsch/
Heuristik: Leinwandgrund hinten, Farbe davor, aufgeklebtes Papier (feines Druckbild) weiter vorn,
dunkle Spruehlinien ganz vorn. Bei einem neuen Foto nur neu ausfuehren."""
import sys, numpy as np, cv2
src, out = sys.argv[1], sys.argv[2]
im = cv2.imread(src); H, W = im.shape[:2]
f = im.astype(np.float32) / 255
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV).astype(np.float32)
lum = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
sat = hsv[..., 1] / 255
k = lambda px: int(px * W / 1547) | 1
blur = lambda a, px: cv2.GaussianBlur(a, (0, 0), px * W / 1547)
# Leinwandgrund: nahe am Beige-Ton
beige = np.array([190, 215, 226], np.float32) / 255  # BGR
ground = np.exp(-np.sum((f - beige) ** 2, axis=2) / 0.012)
# Farbe: gesaettigt
paint = np.clip((sat - 0.25) / 0.3, 0, 1)
# Papier: feines Druckbild = hohe lokale Varianz im Kleinen, im Collage-Bereich
fine = np.abs(lum - blur(lum, 2.0)); detail = blur(fine, 9); detail = np.clip((detail - 0.012) / 0.03, 0, 1)
xx, yy = np.meshgrid(np.linspace(0, 1, W), np.linspace(0, 1, H))
region = np.clip((xx - 0.47) / 0.06, 0, 1) * np.clip((0.83 - xx) / 0.04, 0, 1) * np.clip((yy - 0.06) / 0.04, 0, 1)
paper = np.clip(blur(detail * region, 6) * 1.6, 0, 1)
# Spruehlinien: sehr dunkel und kaum gesaettigt, weich
chroma = f.max(axis=2) - f.min(axis=2)
spray = np.clip((0.34 - lum) / 0.16, 0, 1) * np.clip((0.2 - chroma) / 0.06, 0, 1); spray = blur(spray, 5)
spray *= 1 - np.clip(paper * 1.2, 0, 1) * (yy < 0.62)  # das X auf dem Turm ist gedruckt, nicht gesprueht
d = 0.12 + 0.02 * (1 - ground)
d = np.maximum(d, 0.34 * paint)
d = np.maximum(d, 0.34 + 0.26 * paper) * (paper > 0.05) + d * (paper <= 0.05)
d = np.maximum(d, 0.95 * spray)
d = blur(d.astype(np.float32), 3.5)
cv2.imwrite(out + 'tiefe.jpg', cv2.resize((np.clip(d, 0, 1) * 255).astype(np.uint8), (W // 2, H // 2), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 82])
cv2.imwrite(out + 'werk.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 80])
print('ok', W, H)

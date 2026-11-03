# coloca o orcamento real do WashReady na folha da prancheta (mantendo luz, prendedor e caneta)
import cv2, numpy as np
im = cv2.imread('../ads/c2.jpg')
doc = cv2.imread('../ig2/docs/estimate-1.png')
Q = np.float32([[843, 638], [975, 677], [930, 787], [782, 733]])
S = 4  # trabalha em resolucao maior para a folha
big = cv2.resize(im, None, fx=S, fy=S, interpolation=cv2.INTER_LANCZOS4)
q = Q * S
h, w = doc.shape[:2]
M = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), q)
H, W = big.shape[:2]
wd = cv2.warpPerspective(doc, M, (W, H), flags=cv2.INTER_AREA, borderValue=(255, 255, 255)).astype(np.float32)
mask = np.zeros((H, W), np.uint8); cv2.fillPoly(mask, [q.astype(np.int32)], 255)
mask = cv2.erode(mask, np.ones((7, 7), np.uint8)); mask = cv2.GaussianBlur(mask, (0, 0), 1.0).astype(np.float32) / 255
g = cv2.cvtColor(big, cv2.COLOR_BGR2GRAY).astype(np.float32)
pw = np.percentile(g[mask > 0.9], 90)
# o que fica por cima: prendedor e caneta (escuros e grossos); as linhas finas impressas somem na abertura
dark = ((g < 0.8 * pw) & (mask > 0.5)).astype(np.uint8)
dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((45, 45), np.uint8))
dark = cv2.dilate(dark, np.ones((5, 5), np.uint8))
keep = cv2.GaussianBlur(dark.astype(np.float32), (0, 0), 1.5)[..., None]
# luz do papel: plano ajustado nos pixels claros
ys, xs = np.where((mask > 0.9) & (dark == 0) & (g > 0.85 * pw))
A = np.c_[xs, ys, np.ones_like(xs)]; coef, *_ = np.linalg.lstsq(A, g[ys, xs], rcond=None)
YY, XX = np.mgrid[0:H, 0:W]
light = np.clip((coef[0] * XX + coef[1] * YY + coef[2]) / 255 * 1.1, 0.5, 1.0)[..., None]
paper_col = np.array([1.0, 1.0, 0.985])  # papel levemente frio como na foto
newp = np.clip(wd * light * paper_col, 0, 255)
m = mask[..., None] * (1 - keep)
out = big.astype(np.float32) * (1 - m) + newp * m
out = cv2.resize(out.astype(np.uint8), (im.shape[1] * 2, im.shape[0] * 2), interpolation=cv2.INTER_AREA)
cv2.imwrite('fr/c2doc.png', out)
cv2.imwrite('fr/c2doc_zoom.png', out[1180:1680, 1480:2050])

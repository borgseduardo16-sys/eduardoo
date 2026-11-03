# poe o orcamento real na folha em branco da prancheta (foto do criativo 5)
import cv2, numpy as np
im = cv2.imread('../ads/c5.jpg')
doc = cv2.imread('../ig2/docs/estimate-1.png'); doc = cv2.copyMakeBorder(doc[:int(doc.shape[0]*0.93)], int(doc.shape[0]*0.13), 0, 0, 0, cv2.BORDER_CONSTANT, value=(255, 255, 255))
Q = np.float32([[279, 476], [612, 417], [956, 587], [477, 762]])
S = 3
big = cv2.resize(im, None, fx=S, fy=S, interpolation=cv2.INTER_LANCZOS4)
q = Q * S; H, W = big.shape[:2]; h, w = doc.shape[:2]
M = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), q)
wd = cv2.warpPerspective(doc, M, (W, H), flags=cv2.INTER_AREA, borderValue=(255, 255, 255)).astype(np.float32)
mask = np.zeros((H, W), np.uint8); cv2.fillPoly(mask, [q.astype(np.int32)], 255)
mask = cv2.dilate(mask, np.ones((5, 5), np.uint8))
g = cv2.cvtColor(big, cv2.COLOR_BGR2GRAY).astype(np.float32)
hsv = cv2.cvtColor(big, cv2.COLOR_BGR2HSV)
paper = ((hsv[..., 2] > 165) & (hsv[..., 1] < 50) & (mask > 0)).astype(np.uint8)
paper = cv2.morphologyEx(paper, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
pw = np.percentile(g[paper > 0], 95)
# luz: a propria folha em branco, suavizada (preenche onde esta o prendedor)
lum = np.where(paper > 0, g, 0); wgt = cv2.GaussianBlur(paper.astype(np.float32), (0, 0), 6)
light = cv2.GaussianBlur(lum, (0, 0), 6) / np.maximum(wgt, 1e-3) / pw
light = np.clip(light, 0.6, 1.0)[..., None]
tint = big.astype(np.float32) / np.maximum(g[..., None], 1)  # cor do papel (levemente azulada)
tint = cv2.GaussianBlur(np.where(paper[..., None] > 0, tint, 1), (0, 0), 10)
newp = np.clip(wd * light * np.clip(tint, 0.9, 1.1), 0, 255)
m = cv2.GaussianBlur(paper.astype(np.float32), (0, 0), 0.8)[..., None]
out = big.astype(np.float32) * (1 - m) + newp * m
# leve granulado e suavizacao para casar com a foto
out = cv2.GaussianBlur(out, (0, 0), 0.6)
out = cv2.resize(out.astype(np.uint8), (im.shape[1] * 2, im.shape[0] * 2), interpolation=cv2.INTER_AREA)
cv2.imwrite('fr/c5doc.png', out)
cv2.imwrite('fr/c5doc_zoom.jpg', out[700:1650, 450:2100])

# acha a tela (preta) do celular em cada quadro e grava os 4 cantos
import cv2, numpy as np, json, sys
d, a, b, roi = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), json.loads(sys.argv[4])
x0, y0, x1, y1 = roi
out = {}
for n in range(a, b + 1):
    im = cv2.imread(f'{d}/{n:03d}.png')
    sub = im[y0:y1, x0:x1]
    hsv = cv2.cvtColor(sub, cv2.COLOR_BGR2HSV)
    m = ((hsv[..., 2] < 60)).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cs: continue
    c = max(cs, key=cv2.contourArea)
    if cv2.contourArea(c) < 40000: continue
    hull = cv2.convexHull(c)
    peri = cv2.arcLength(hull, True)
    q = None
    for eps in np.linspace(0.01, 0.08, 15):
        ap = cv2.approxPolyDP(hull, eps * peri, True)
        if len(ap) == 4: q = ap.reshape(4, 2); break
    if q is None:
        r = cv2.minAreaRect(c); q = cv2.boxPoints(r)
    q = q + np.array([x0, y0])
    # ordena TL, TR, BR, BL
    s = q.sum(1); df = np.diff(q, axis=1).ravel()
    o = [q[np.argmin(s)], q[np.argmin(df)], q[np.argmax(s)], q[np.argmax(df)]]
    out[n] = [[float(p[0]), float(p[1])] for p in o]
json.dump(out, open(sys.argv[5], 'w'))
print(len(out), 'quadros;', {k: [list(map(int, p)) for p in v] for k, v in list(out.items())[::8]})

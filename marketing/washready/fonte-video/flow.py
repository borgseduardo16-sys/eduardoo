# rastreia o celular a partir de um quadro de referencia com cantos marcados a mao
import cv2, numpy as np, json, sys
d, ref, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
Q = np.array(json.loads(sys.argv[5]), np.float32)
out = sys.argv[6]
gray = lambda n: cv2.cvtColor(cv2.imread(f'{d}/{n:03d}.png'), cv2.COLOR_BGR2GRAY)

def band(q, shape):
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [q.astype(np.int32)], 255)
    big = cv2.dilate(m, np.ones((41, 41), np.uint8)); small = cv2.erode(m, np.ones((15, 15), np.uint8))
    return cv2.subtract(big, small)

res = {ref: Q.tolist()}
for step, end in ((1, b), (-1, a)):
    q = Q.copy(); prev = gray(ref)
    for n in range(ref + step, end + step, step):
        cur = gray(n)
        pts = cv2.goodFeaturesToTrack(prev, 300, 0.01, 6, mask=band(q, prev.shape))
        if pts is None or len(pts) < 8: break
        nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev, cur, pts, None, winSize=(25, 25), maxLevel=3)
        back, st2, _ = cv2.calcOpticalFlowPyrLK(cur, prev, nxt, None, winSize=(25, 25), maxLevel=3)
        ok = (st.ravel() == 1) & (st2.ravel() == 1) & (np.linalg.norm(back - pts, axis=2).ravel() < 1.0)
        if ok.sum() < 8: break
        M, inl = cv2.estimateAffinePartial2D(pts[ok], nxt[ok], method=cv2.RANSAC, ransacReprojThreshold=2.0)
        if M is None: break
        q = cv2.transform(q.reshape(-1, 1, 2), M).reshape(-1, 2)
        res[n] = q.tolist(); prev = cur
json.dump({int(k): v for k, v in res.items()}, open(out, 'w'))
ks = sorted(res); print(ks[0], ks[-1], len(ks))
for k in ks[::6]: print(k, [list(map(int, p)) for p in res[k]])

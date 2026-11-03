# monta os quadros do video completo (9:16 e 4:5)
import cv2, json, numpy as np, os, math
from screen import place

FPS = 24; W, H = 1080, 1920; TOTAL = 26.4
os.makedirs('o916', exist_ok=True); os.makedirs('o45', exist_ok=True)
Q1 = {int(k): np.array(v) * 1.5 for k, v in json.load(open('q1.json')).items()}
Q2 = {int(k): np.array(v) * 1.5 for k, v in json.load(open('q2.json')).items()}
img = lambda p: cv2.imread(p)
HOME, SENT = img('app/home.png'), img('app/sent.png')
SCR = {k: img(f'app/{k}-top.png') for k in ('estimate', 'residential-agreement', 'invoice')}
END916, END45 = img('g/end916.png')[:1920], img('g/end45.png')[:1350]
CAPS = [cv2.imread(f'g/cap{i}.png', cv2.IMREAD_UNCHANGED) for i in range(11)]

def up(p): return cv2.resize(cv2.imread(p), (W, H), interpolation=cv2.INTER_LANCZOS4)
def ease(x): x = min(max(x, 0), 1); return x * x * (3 - 2 * x)
def ein(x): x = min(max(x, 0), 1); return x ** 3

def full(im, y0=0):
    s = cv2.resize(im, (W, int(im.shape[0] * W / im.shape[1])), interpolation=cv2.INTER_AREA)
    return s[y0:y0 + H].copy()

def zoom(fr, s, cx, cy):
    M = np.float32([[s, 0, W / 2 - s * cx], [0, s, H / 2 - s * cy]])
    return cv2.warpAffine(fr, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT), M

def clip1(n, t=None):
    fr = up(f'f1/{n:03d}.png')
    if n >= 140 and n in Q1:
        fr = place(fr, HOME, Q1[n], level=0.85 * ease((n - 140) / 7), occl='glove')
    return fr

# tela inteira do app com logo destacada
INV = full(SCR['invoice'])
LOGO_BOX = (88, 772, 722, 862)

def app_frame(t):
    seq = [(9.45, 'home'), (10.45, 'estimate'), (11.8, 'residential-agreement'), (12.9, 'invoice')]
    def still(key, tt):
        base = full(HOME, 208) if key == 'home' else (INV.copy() if key == 'invoice' else full(SCR[key]))
        if key == 'invoice' and tt >= 12.95:
            k = ease((tt - 12.95) / 0.5); s = 1 + 0.55 * k
            ov = base.copy(); x0, y0, x1, y1 = LOGO_BOX
            cv2.rectangle(ov, (x0, y0), (x1, y1), (76, 138, 255), 5, cv2.LINE_AA)
            a = ease((tt - 13.2) / 0.2); base = cv2.addWeighted(ov, a, base, 1 - a, 0)
            return zoom(base, s, W / 2 + (405 - W / 2) * k, H / 2 + (960 - H / 2) * k)[0]
        return zoom(base, 1.0 + 0.015 * max(0, tt - 9.3), W / 2, H / 2)[0]
    # transicoes de deslizar
    for (ts, a), (te, b) in zip(seq, seq[1:]):
        if ts <= t < te + 0.25 and t >= te - 0.0 and b != 'invoice' or (b == 'invoice' and te - 1.1 <= t < te - 0.85):
            pass
    swipes = [(9.45, 'home', 'estimate'), (10.45, 'estimate', 'residential-agreement'), (11.8, 'residential-agreement', 'invoice')]
    for ts, a, b in swipes:
        if ts <= t < ts + 0.25:
            k = ease((t - ts) / 0.25); A, B = still(a, t), still(b, t)
            out = np.zeros_like(A); dx = int(W * k)
            out[:, :W - dx] = A[:, dx:]; out[:, W - dx:] = B[:, :dx]
            return out
    cur = 'home'
    for ts, a, b in swipes:
        if t >= ts + 0.25: cur = b
    return still(cur, t)

CAPT = [(1.85, 2.95, 0, 560), (3.4, 4.85, 1, 560), (4.85, 6.35, 2, 560), (7.15, 8.3, 3, 560), (8.5, 9.4, 4, 560),
        (9.5, 10.45, 5, 1450), (10.5, 11.8, 6, 1450), (11.85, 12.9, 7, 1450), (12.95, 14.7, 8, 1450),
        (15.25, 16.35, 9, 1350), (16.35, 17.7, 10, 1350)]

def caption(fr, t):
    for a, b, i, y in CAPT:
        if a <= t < b:
            c = CAPS[i]; k = ease((t - a) / 0.12); s = 0.9 + 0.1 * k
            c = cv2.resize(c, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
            h, w = c.shape[:2]; x0, y0 = W // 2 - w // 2, y - h // 2
            al = c[..., 3:4].astype(np.float32) / 255 * k
            roi = fr[y0:y0 + h, x0:x0 + w].astype(np.float32)
            fr[y0:y0 + h, x0:x0 + w] = (roi * (1 - al) + c[..., :3] * al).astype(np.uint8)
    return fr

def end_frame(t, e):
    k = 1 + 0.03 * ease((t - 22.35) / 4)
    hh, ww = e.shape[:2]
    return cv2.warpAffine(e, np.float32([[k, 0, ww / 2 * (1 - k)], [0, k, hh / 2 * (1 - k)]]), (ww, hh), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

last1 = None
N = int(TOTAL * FPS)
c1_190 = None
for i in range(N):
    t = i / FPS; end = None
    if t < 7.92:
        fr = clip1(min(190, int(t * FPS) + 1))
    elif t < 9.45:
        if c1_190 is None: c1_190 = up('f1/190.png')
        if t < 8.45: s = 1 + 0.05 * ease((t - 7.92) / 0.53); k = 0
        else: k = ein((t - 8.45) / 0.75); s = 1.05 + (2.9 - 1.05) * k
        q = Q1[190]; cx, cy = q[:, 0].mean(), q[:, 1].mean()
        zx, zy = W / 2 + (cx - W / 2) * min(1, (t - 7.92) / 1.28), H / 2 + (cy - H / 2) * min(1, (t - 7.92) / 1.28)
        zf, M = zoom(c1_190, s, zx, zy)
        qz = cv2.transform(q.reshape(-1, 1, 2).astype(np.float32), M).reshape(-1, 2)
        # a tela "cresce" ate ocupar o quadro exatamente como a tela cheia do app
        hb = HOME.shape[0] * W / HOME.shape[1]
        tgt = np.float32([[0, -208], [W, -208], [W, hb - 208], [0, hb - 208]])
        e = ease((t - 8.7) / 0.75)
        qq = qz * (1 - e) + tgt * e
        fr = place(zf, HOME, qq, level=0.85 + (1 / 0.9 - 0.85) * e, occl=None, refk=0.55 / s * (1 - e))
        if t >= 9.3:
            a = ease((t - 9.3) / 0.15); fr = cv2.addWeighted(app_frame(9.45), a, fr, 1 - a, 0)
    elif t < 14.85:
        fr = app_frame(t)
        if t >= 14.6:
            nx = up('f2/011.png'); nx = place(nx, SENT, Q2[11], level=0.8, occl='skin', refk=0.35)
            a = ease((t - 14.6) / 0.25); fr = cv2.addWeighted(nx, a, fr, 1 - a, 0)
    elif t < 22.35:
        n = min(190, 11 + int((t - 14.85) * FPS))
        fr = place(up(f'f2/{n:03d}.png'), SENT, Q2[n], level=0.8, occl='skin', refk=0.35)
        if t >= 22.1: last1 = fr.copy()
    else:
        e9, e4 = end_frame(t, END916), end_frame(t, END45)
        if t < 22.65:
            a = ease((t - 22.35) / 0.3)
            e9 = cv2.addWeighted(e9, a, last1, 1 - a, 0); e4 = cv2.addWeighted(e4, a, last1[285:1635], 1 - a, 0)
        cv2.imwrite(f'o916/{i:04d}.jpg', e9, [cv2.IMWRITE_JPEG_QUALITY, 94]); cv2.imwrite(f'o45/{i:04d}.jpg', e4, [cv2.IMWRITE_JPEG_QUALITY, 94])
        continue
    fr = caption(fr, t)
    cv2.imwrite(f'o916/{i:04d}.jpg', fr, [cv2.IMWRITE_JPEG_QUALITY, 94])
    cv2.imwrite(f'o45/{i:04d}.jpg', fr[285:1635], [cv2.IMWRITE_JPEG_QUALITY, 94])
    if i % 48 == 0: print(round(t, 1), flush=True)
print('ok', N)

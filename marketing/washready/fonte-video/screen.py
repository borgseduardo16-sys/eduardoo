# coloca a tela do app dentro do quadrilatero do celular (com reflexo e oclusao do polegar)
import cv2, numpy as np

def rounded(img, r):
    h, w = img.shape[:2]
    a = np.zeros((h, w), np.uint8)
    cv2.rectangle(a, (r, 0), (w - r, h), 255, -1); cv2.rectangle(a, (0, r), (w, h - r), 255, -1)
    for cx, cy in ((r, r), (w - r, r), (r, h - r), (w - r, h - r)): cv2.circle(a, (cx, cy), r, 255, -1, cv2.LINE_AA)
    return a

def fit(screen, qw, qh):
    # recorta a captura para a proporcao da tela do video
    h, w = screen.shape[:2]; ar = qw / qh
    if w / h > ar:
        nw = int(h * ar); x = (w - nw) // 2; return screen[:, x:x + nw]
    nh = int(w / ar); return screen[:nh]

def place(frame, screen, quad, level=1.0, occl='glove', refk=0.55):
    """frame BGR (ja na resolucao final), screen BGR, quad 4x2 TL TR BR BL."""
    q = np.float32(quad)
    qw = (np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2
    qh = (np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2
    s = fit(screen, qw, qh)
    S = 3; s = cv2.resize(s, (int(qw * S), int(qh * S)), interpolation=cv2.INTER_AREA)
    h, w = s.shape[:2]
    al = rounded(s, int(w * 0.11))
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    M = cv2.getPerspectiveTransform(src, q)
    H, W = frame.shape[:2]
    ws = cv2.warpPerspective(s, M, (W, H), flags=cv2.INTER_AREA)
    wa = cv2.warpPerspective(al, M, (W, H), flags=cv2.INTER_LINEAR).astype(np.float32) / 255
    ws = cv2.GaussianBlur(ws, (0, 0), 0.7).astype(np.float32)
    f = frame.astype(np.float32)
    # reflexo: o que havia de luz na tela preta original continua por cima
    refl = np.clip(f - 18, 0, None) * refk
    comp = np.clip(ws * 0.9 * level + refl, 0, 255)
    if occl:
        # polegar/luva por cima da tela: pixels claros/marrons que nao sao a tela preta
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        if occl == 'skin':
            h_ = hsv[..., 0]; glove = (((h_ <= 22) | (h_ >= 170)) & (hsv[..., 1] > 45) & (hsv[..., 1] < 175) & (hsv[..., 2] > 140)).astype(np.uint8)
        else:
            glove = ((hsv[..., 2] > 75) & (hsv[..., 1] > 60)).astype(np.uint8)
        glove = cv2.morphologyEx(glove, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)); glove = cv2.morphologyEx(glove, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        glove = cv2.GaussianBlur(glove.astype(np.float32), (0, 0), 1.5)
        wa = wa * (1 - glove)
    wa = wa[..., None]
    return (f * (1 - wa) + comp * wa).astype(np.uint8)

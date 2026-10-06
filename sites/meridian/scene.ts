import { mountStage, THREE, type StageOpts } from '../_kit/stage';
import { makeWatch, makeFog, makeDust, gearGeometry } from '../_kit/objects';

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const CLARO = { topo: new THREE.Color('#f3f6fc'), base: new THREE.Color('#bfd1e8') };
const ESCURO = { topo: new THREE.Color('#0b0f19'), base: new THREE.Color('#020309') };

export default function montarMeridian(host: HTMLElement, opts: StageOpts) {
  return mountStage(host, opts, (ctx) => {
    const { scene, camera } = ctx;
    const alta = ctx.quality === 'high';
    ctx.useEnvironment(1.15);

    // Luzes: uma principal quente, um contra-luz frio.
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 6, 6);
    const rim = new THREE.DirectionalLight(0x9db8ff, 1.4);
    rim.position.set(-6, 2, -4);
    scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.25));

    // Relógio
    const watch = makeWatch('Meridian', ctx.quality);
    const rig = new THREE.Group();
    const spin = new THREE.Group();
    spin.add(watch.group);
    rig.add(spin);
    scene.add(rig);

    // Nuvens
    const fog = makeFog(alta ? 34 : 16, -2, -44, 16);
    scene.add(fog.group);

    // Engrenagens da seção escura (atrás de onde o relógio "chega")
    const gearRig = new THREE.Group();
    gearRig.position.z = -24;
    scene.add(gearRig);
    const douro = new THREE.MeshStandardMaterial({ color: 0xd6a85a, metalness: 1, roughness: 0.3 });
    const aco = new THREE.MeshStandardMaterial({ color: 0x6f7a8b, metalness: 1, roughness: 0.42 });
    const gdefs: { n: number; ro: number; ri: number; x: number; y: number; z: number; v: number; m: THREE.Material }[] = [
      { n: 28, ro: 2.6, ri: 2.35, x: 4.4, y: -0.6, z: -5, v: 0.12, m: douro },
      { n: 18, ro: 1.7, ri: 1.5, x: 1.7, y: -2.4, z: -6, v: -0.19, m: aco },
      { n: 36, ro: 3.4, ri: 3.1, x: 7.4, y: 2.6, z: -9, v: -0.09, m: douro },
      { n: 12, ro: 1.15, ri: 1.0, x: 2.3, y: 2.2, z: -4, v: 0.28, m: aco },
    ];
    const gears = gdefs.map((d) => {
      const geo = gearGeometry(d.n, d.ro, d.ri, 0.34);
      const mesh = new THREE.Mesh(geo, d.m);
      const pivot = new THREE.Group();
      pivot.rotation.x = Math.PI / 2;
      pivot.position.set(d.x, d.y, d.z);
      pivot.add(mesh);
      gearRig.add(pivot);
      return { mesh, v: d.v, pivot, geo };
    });

    const poeira = alta ? makeDust(260, new THREE.Vector3(26, 16, 60), 0xffffff, 0.06) : null;
    if (poeira) {
      poeira.points.position.z = -14;
      scene.add(poeira.points);
    }

    const cor = new THREE.Color();
    const cor2 = new THREE.Color();
    let ultimoBg = '';

    return {
      update(c, t, dt) {
        const wide = c.aspect > 1.15;
        const tra = c.pass('travessia');
        const ana = c.stick('anatomia');
        const hor = c.pass('horologia');
        const dk = smooth(0.02, 0.5, hor);

        // ---- Câmera: dolly pela névoa e chegada ao relógio
        const dolly = smooth(0.0, 0.9, tra);
        const camZ = lerp(9, -15, dolly);
        camera.position.set(c.mouse.x * 0.35, -c.mouse.y * 0.2, camZ - smooth(0, 1, hor) * 5);
        camera.lookAt(0, 0, camZ - 9 - smooth(0, 1, hor) * 5);

        // ---- Fundo (claro → escuro)
        cor.copy(CLARO.topo).lerp(ESCURO.topo, dk);
        cor2.copy(CLARO.base).lerp(ESCURO.base, dk);
        const bg = `radial-gradient(120% 90% at 70% 15%, #${cor.getHexString()} 0%, #${cor2.getHexString()} 100%)`;
        if (bg !== ultimoBg) {
          c.setBackground(bg);
          ultimoBg = bg;
        }

        // ---- Relógio: herói → some na travessia → chega e se desmonta
        const chegou = tra >= 0.5;
        const s = chegou
          ? smooth(0.62, 0.95, tra) * (1 - smooth(0.0, 0.4, hor))
          : 1 - smooth(0.06, 0.34, tra);
        rig.visible = s > 0.01;
        rig.scale.setScalar(Math.max(0.0001, s) * (wide ? 1 : 0.72));
        watch.strap.visible = wide; // celular: só a caixa, sem a pulseira atravessando o texto
        rig.position.z = chegou ? -24 : 0;
        const emHeroi = !chegou;
        rig.position.x = wide ? (emHeroi ? 2.6 : 2.3) : 0;
        rig.position.y = (emHeroi ? (wide ? -0.3 : -2.05) : wide ? 0 : -1.45) + Math.sin(t * 0.8) * 0.06;

        const e = smooth(0.1, 0.8, ana);
        watch.setExplode(chegou ? e : 0);
        // inclinação: de frente (herói) → de lado (explodido)
        const rotX = chegou ? lerp(1.22, 0.62, smooth(0.0, 0.25, ana)) : 1.2;
        rig.rotation.x = rotX + c.mouse.y * 0.06;
        rig.rotation.y = c.mouse.x * 0.12;
        // herói: balanço leve (pulseira sempre na vertical); anatomia: gira junto com a rolagem
        spin.rotation.y = (c.reduced ? 0 : Math.sin(t * 0.45) * 0.22) + (chegou ? ana * 2.2 : 0);

        // ponteiros: horário real
        const d = new Date();
        const seg = d.getSeconds() + d.getMilliseconds() / 1000;
        const min = d.getMinutes() + seg / 60;
        const hor12 = (d.getHours() % 12) + min / 60;
        watch.hands.second.rotation.y = -(seg / 60) * Math.PI * 2;
        watch.hands.minute.rotation.y = -(min / 60) * Math.PI * 2;
        watch.hands.hour.rotation.y = -(hor12 / 12) * Math.PI * 2;
        if (!c.reduced) for (const g of watch.gears) g.rotation.y += dt * 0.25;

        // ---- Nuvens
        cor.set('#ffffff').lerp(cor2.set('#32415e'), dk);
        fog.update(t, cor, lerp(0.95, 0.5, dk), camera.position.z);

        // ---- Engrenagens
        const ge = smooth(0.05, 0.7, hor);
        gearRig.visible = ge > 0.01;
        gearRig.scale.setScalar(0.55 + 0.45 * ge);
        gearRig.rotation.z = (1 - ge) * 0.4;
        // celular: engrenagens descem para a parte de baixo da tela, longe do texto
        gearRig.position.x = wide ? 0 : -2.2;
        gearRig.position.y = wide ? 0 : -3.6;
        gearRig.scale.multiplyScalar(wide ? 1 : 0.85);
        if (!c.reduced) for (const g of gears) g.mesh.rotation.y += g.v * dt * (1 + ge);

        if (poeira) {
          poeira.material.opacity = 0.5 * dk;
          poeira.points.rotation.y = t * 0.01;
        }
        key.intensity = lerp(2.2, 1.6, dk);
      },
      dispose() {
        watch.dispose();
        fog.dispose();
        poeira?.dispose();
        gears.forEach((g) => g.geo.dispose());
        douro.dispose();
        aco.dispose();
      },
    };
  });
}

/* 经典脚本版本；THREE 来自 lib/three.global.js，工具函数来自 helpers.js / particles.js */

/* ============ 场景基类 ============ */
class SceneBase {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    this.done = false;
  }
  update(dt, t) {}
  onDown(ray, point) {}
  onMove(ray, point, pressed) {}
  onUp(ray, point) {}
  getProgress() { return null; }
  finish(msg) {
    if (this.done) return;
    this.done = true;
    this.ctx.sfx.chime();
    if (window.toast) window.toast(msg || '完成！好解压～', 2200);
  }
  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    this.ctx.scene.remove(this.group);
  }
}

/* ============ 1. 刮鱼鳞 ============ */
class FishScene extends SceneBase {
  static label = '刮鱼鳞';
  static emoji = '🐟';
  static hint = '按住并拖动刮鳞刀，把鱼鳞刮干净';
  static bg = 'linear-gradient(160deg,#e0f4ff 0%,#c9e8ff 45%,#eaf8ff 100%)';
  static cam = { pos: [0, 3.4, 6.2], look: [0, 0.8, 0] };

  constructor(ctx) {
    super(ctx);
    this.group.add(makeStage({ top: 0xd3ecfa, side: 0x9fc6de }));
    this.group.add(makeBoard({ w: 6.2, d: 3.4 }));

    const fish = new THREE.Group();
    fish.position.set(0, 0.74, 0);
    this.fish = fish;
    this.group.add(fish);

    this.bodyMat = M(0x7fc9e8, { roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), this.bodyMat);
    body.scale.set(2.6, 1.0, 1.15);
    body.castShadow = true;
    fish.add(body);
    this.body = body;

    const finMat = M(0x5fb0d6);
    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 0);
    tailShape.lineTo(-1.12, 0.8);
    tailShape.lineTo(-0.85, 0);
    tailShape.lineTo(-1.12, -0.8);
    tailShape.closePath();
    const tail = new THREE.Mesh(new THREE.ExtrudeGeometry(tailShape, { depth: 0.1, bevelEnabled: false }), finMat);
    tail.position.set(-2.42, 0.05, -0.05);
    tail.castShadow = true;
    fish.add(tail);

    const finShape = new THREE.Shape();
    finShape.moveTo(-0.95, 0);
    finShape.quadraticCurveTo(0, 0.75, 0.95, 0);
    finShape.closePath();
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.08, bevelEnabled: false }), finMat);
    fin.position.set(0.12, 0.75, -0.04);
    fin.castShadow = true;
    fish.add(fin);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), M(0x23233d, { roughness: 0.3 }));
    eye.position.set(1.78, 0.24, 0.73);
    fish.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(1.83, 0.28, 0.8);
    fish.add(glint);

    /* 鱼鳞：贴在鱼身椭圆面上 */
    this.scales = [];
    this.scaleMeshes = [];
    this.total = 0;
    const scaleGeo = new THREE.CircleGeometry(0.1, 10);
    const a = 2.6, b = 1.0, c = 1.15;
    const Z = new THREE.Vector3(0, 0, 1);
    for (const pol of [0.3, 0.55, 0.8, 1.05, 1.3]) {
      for (let i = -9; i <= 9; i++) {
        const az = i * 0.11;
        if (Math.abs(az) > 1.05) continue;
        const sn = Math.sin(pol);
        const x = a * sn * Math.sin(az);
        const z = c * sn * Math.cos(az);
        const y = b * Math.cos(pol);
        if (x > 1.65 && z > 0.5) continue;
        const n = new THREE.Vector3(x / (a * a), y / (b * b), z / (c * c)).normalize();
        const s = new THREE.Mesh(scaleGeo, new THREE.MeshStandardMaterial({
          color: 0xd9e8f0, roughness: 0.25, metalness: 0.55, side: THREE.DoubleSide
        }));
        s.position.set(x, y, z).addScaledVector(n, 0.02);
        s.quaternion.setFromUnitVectors(Z, n);
        fish.add(s);
        const rec = { m: s, alive: true };
        s.userData.scale = rec;
        this.scales.push(rec);
        this.scaleMeshes.push(s);
        this.total++;
      }
    }

    /* 刮鳞刀 */
    this.tool = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 20), M(0xd4dde8, { metalness: 0.7, roughness: 0.3 }));
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.8, 10), M(0xff9d5c, { roughness: 0.5 }));
    grip.position.y = 0.42;
    grip.rotation.x = -0.3;
    this.tool.add(disc, grip);
    this.tool.position.set(0, 1.7, 0);
    this.tool.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(this.tool);

    this.plane = makePointerPlane(1.6);
    this.group.add(this.plane);
    this.removed = 0;
    this.lastScrape = 0;
  }

  scrapeAt(ray, point, force) {
    /* 刀贴着鱼身跟随指针：优先取鱼身射线命中点，消除高度差带来的偏移 */
    const bh = ray.intersectObject(this.body, false)[0];
    const tp = bh ? bh.point : point;
    if (tp) {
      this.tool.position.x = limit(tp.x, -3.0, 3.0);
      this.tool.position.z = limit(tp.z, -1.5, 1.5);
      this.tool.position.y = bh ? bh.point.y + 0.14 : 1.7;
    }
    if (!force || !tp) return;
    /* 只有指针真正压住的那一片鳞才会被刮掉：取鱼身命中点最近的活鳞片 */
    const v = new THREE.Vector3();
    let target = null, best = 1e9;
    for (const s of this.scales) {
      if (!s.alive) continue;
      s.m.getWorldPosition(v);
      const d = v.distanceToSquared(bh.point);
      if (d < best) { best = d; target = s; }
    }
    if (!target || best > 0.09) return;
    target.alive = false;
    target.m.visible = false;
    this.removed++;
    target.m.getWorldPosition(v);
    this.ctx.particles.spawn({
      geo: GEO_DISC, pos: v.clone(),
      vel: new THREE.Vector3(rand(-1.2, 1.2), rand(1.6, 3), rand(-1.2, 1.2)),
      color: 0xd9e8f0, size: 0.09, life: rand(0.6, 0.9), floor: 0.04
    });
    const now = performance.now();
    if (now - this.lastScrape > 90) { this.lastScrape = now; this.ctx.sfx.scrape(); }
    this.ctx.particles.burst({ pos: v.clone(), color: 0xaee2f7, count: 3, size: [0.02, 0.045], up: 1.8, speed: [0.4, 1.2] });
    if (this.removed >= this.total) {
      this.bodyMat.roughness = 0.2;
      this.bodyMat.metalness = 0.25;
      this.ctx.particles.burst({
        pos: new THREE.Vector3(0, 1.4, 0), colors: [0xffffff, 0xaee2f7, 0xfff3b0], color: 0xffffff,
        count: 26, size: [0.03, 0.08], up: 3, speed: [0.8, 2.4]
      });
      this.finish('鱼鳞刮干净啦，闪闪发光 ✨');
    }
  }

  onDown(ray, point) { this.scrapeAt(ray, point, true); }
  onMove(ray, point, pressed) { this.scrapeAt(ray, point, pressed); }
  getProgress() { return { text: `刮鳞 ${this.removed}/${this.total}`, value: this.total ? this.removed / this.total : 0 }; }
}

/* ============ 2. 烧猪毛 ============ */
class PigScene extends SceneBase {
  static label = '烧猪毛';
  static emoji = '🔥';
  static hint = '按住喷枪，对准猪皮把毛烧干净';
  static bg = 'linear-gradient(160deg,#fff1e3 0%,#ffe4d2 50%,#ffece3 100%)';
  static cam = { pos: [0, 2.6, 4.4], look: [0, 0.7, 0] };

  constructor(ctx) {
    super(ctx);
    this.group.add(makeStage({ top: 0xffe2d1, side: 0xdfaf98 }));
    this.group.add(makeBoard({ w: 6.0, d: 3.4 }));

    /* 压扁的圆润小猪：扁椭球身体，猪毛都在可达的背面上 */
    const pig = new THREE.Group();
    pig.position.y = 0.68;
    this.pig = pig;
    this.group.add(pig);

    const skinMat = M(0xf4b8c8, { roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 26), skinMat);
    body.scale.set(1.55, 0.58, 0.95);
    body.castShadow = true;
    pig.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 28, 20), M(0xf7c3d1, { roughness: 0.6 }));
    head.scale.set(1, 0.78, 1);
    head.position.set(1.32, 0.02, 0);
    head.castShadow = true;
    pig.add(head);

    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.24, 20), M(0xefa7b6, { roughness: 0.55 }));
    snout.rotation.z = Math.PI / 2;
    snout.position.set(1.88, 0, 0);
    snout.castShadow = true;
    pig.add(snout);
    const nostrilGeo = new THREE.SphereGeometry(0.045, 8, 6);
    const nostrilMat = M(0xc9788d, { roughness: 0.5 });
    for (const s of [-1, 1]) {
      const n = new THREE.Mesh(nostrilGeo, nostrilMat);
      n.position.set(2.0, 0.02, s * 0.08);
      pig.add(n);
    }

    const earGeo = new THREE.ConeGeometry(0.15, 0.28, 10);
    const earMat = M(0xf0b0c0, { roughness: 0.6 });
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, earMat);
      ear.position.set(1.25, 0.42, s * 0.28);
      ear.rotation.set(s * 0.3, 0, -0.25);
      ear.castShadow = true;
      pig.add(ear);
    }

    const eyeGeo = new THREE.SphereGeometry(0.08, 12, 10);
    const eyeMat = M(0x2e2836, { roughness: 0.3 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(1.62, 0.15, s * 0.28);
      pig.add(e);
    }

    const legGeo = new THREE.CylinderGeometry(0.17, 0.15, 0.35, 12);
    const legMat = M(0xefb3c2, { roughness: 0.65 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const l = new THREE.Mesh(legGeo, legMat);
        l.position.set(sx * 0.72, -0.45, sz * 0.42);
        l.castShadow = true;
        pig.add(l);
      }
    }

    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 8, 20, 4.4), M(0xf0b0c0, { roughness: 0.6 }));
    tail.position.set(-1.5, 0.15, 0);
    tail.rotation.y = Math.PI / 2;
    tail.castShadow = true;
    pig.add(tail);

    /* 猪毛：铺满扁猪的背面和猪头 */
    this.hairs = [];
    this.total = 0;
    const hairGeo = new THREE.ConeGeometry(0.032, 0.26, 5);
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x8a5a4e, roughness: 0.9 });
    const UP = new THREE.Vector3(0, 1, 0);
    const BA = 1.55, BB = 0.58, BC = 0.95;
    const addHair = (p, n) => {
      const h = new THREE.Mesh(hairGeo, hairMat);
      h.position.copy(p).addScaledVector(n, 0.07);
      h.quaternion.setFromUnitVectors(UP, n);
      pig.add(h);
      this.hairs.push({ m: h, alive: true, p: p.clone(), n: n.clone() });
      this.total++;
    };
    for (let i = 0; i < 100; i++) {
      const d = new THREE.Vector3(rand(-1, 1), rand(-0.1, 1), rand(-1, 1)).normalize();
      const p = new THREE.Vector3(d.x * BA, d.y * BB, d.z * BC);
      const n = new THREE.Vector3(d.x / BA, d.y / BB, d.z / BC).normalize();
      addHair(p, n);
    }
    /* 猪头背面（扁球心 (1.32,0.02,0)），避开猪鼻区域 */
    for (let i = 0; i < 32; i++) {
      const d = new THREE.Vector3(rand(-0.85, 0.6), rand(-0.1, 1), rand(-1, 1)).normalize();
      if (d.x > 0.75) continue;
      const p = new THREE.Vector3(1.32 + d.x * 0.55, 0.02 + d.y * 0.43, d.z * 0.55);
      addHair(p, d);
    }

    /* 喷枪 */
    this.torch = new THREE.Group();
    const tBody = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.85, 16), M(0x575e6d, { metalness: 0.45, roughness: 0.35 }));
    tBody.position.y = 0.62;
    const tGrip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.38, 0.28), M(0xff8760));
    tGrip.position.set(0, 0.32, 0.17);
    tGrip.rotation.x = 0.45;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.085, 0.28, 12), M(0x8a92a6, { metalness: 0.75, roughness: 0.25 }));
    nozzle.position.y = 0.1;
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.55, 12), new THREE.MeshBasicMaterial({ color: 0xffa53d, transparent: true, opacity: 0.92 }));
    this.flame.rotation.x = Math.PI;
    this.flame.position.y = -0.2;
    this.flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.34, 10), new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.95 }));
    this.flameInner.rotation.x = Math.PI;
    this.flameInner.position.y = -0.18;
    this.flameLight = new THREE.PointLight(0xff9a3d, 0, 4.5);
    this.flameLight.position.y = -0.35;
    this.torch.add(tBody, tGrip, nozzle, this.flame, this.flameInner, this.flameLight);
    this.torch.position.set(0, this.surfaceY(0, 0) + 0.48, 0);
    this.torch.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.flame.castShadow = false;
    this.group.add(this.torch);

    /* 焦痕贴片 */
    this.decalGeo = new THREE.CircleGeometry(0.09, 10);
    this.decalMat = new THREE.MeshBasicMaterial({ color: 0x9c6b4f, transparent: true, opacity: 0.28 });
    this.decals = [];

    this.plane = makePointerPlane(1.45);
    this.group.add(this.plane);
    this.on = false;
    this.fs = 0;
    this.burnt = 0;
    this.lastSiz = 0;
  }

  onDown(ray, point) { this.on = true; if (point) this.moveTorch(point); }
  onUp() { this.on = false; }
  onMove(ray, point) { if (point) this.moveTorch(point); }
  /* 猪背表面高度（世界坐标）：扁椭球身体 + 猪头凸起取最大值 */
  surfaceY(x, z) {
    const fx = (x * x) / 2.4 + (z * z) / 0.9;
    let y = 0.68;
    if (fx < 1) y = Math.max(y, 0.68 + 0.58 * Math.sqrt(1 - fx));
    const hx = (x - 1.32) / 0.62, hz = z / 0.62;
    const fh = hx * hx + hz * hz;
    if (fh < 1) y = Math.max(y, 0.7 + 0.43 * Math.sqrt(1 - fh));
    return y;
  }
  moveTorch(p) {
    this.torch.position.x = limit(p.x, -2.5, 2.6);
    this.torch.position.z = limit(p.z, -1.4, 1.4);
    /* 喷枪贴着猪背轮廓滑行，火焰尖端始终在表面附近，边缘的毛也能烧到 */
    this.torch.position.y = this.surfaceY(this.torch.position.x, this.torch.position.z) + 0.48;
  }

  update(dt, t) {
    const target = this.on ? 1 : 0;
    this.fs += (target - this.fs) * Math.min(1, dt * 9);
    const fl = Math.max(0.001, this.fs * (1 + Math.sin(t * 28) * 0.12 + Math.sin(t * 47) * 0.07));
    this.flame.scale.set(fl, fl, fl);
    this.flameInner.scale.set(fl, fl, fl);
    this.flame.visible = this.flameInner.visible = this.fs > 0.03;
    this.flameLight.intensity = this.fs * 5;
    if (!this.on || this.fs < 0.4) return;

    const tip = new THREE.Vector3(0, -0.42, 0);
    this.torch.localToWorld(tip);
    const v = new THREE.Vector3();
    let any = false;
    for (const h of this.hairs) {
      if (!h.alive) continue;
      h.m.getWorldPosition(v);
      if (v.distanceToSquared(tip) < 0.3) {
        h.alive = false;
        any = true;
        this.burnt++;
        const hm = h.m;
        this.ctx.tweens.add({
          dur: 0.16,
          onUpdate: (k) => hm.scale.setScalar(1 - k),
          onDone: () => { hm.visible = false; }
        });
        this.ctx.particles.smoke({ pos: v.clone(), count: 2 });
        if (Math.random() < 0.5) {
          this.ctx.particles.burst({ pos: v.clone(), colors: [0xffa64d, 0xff6b6b, 0xffd166], color: 0xffa64d, count: 3, size: [0.02, 0.05], up: 1.4, speed: [0.3, 0.9] });
        }
        if (this.decals.length < 90) {
          const d = new THREE.Mesh(this.decalGeo, this.decalMat.clone());
          d.position.copy(h.p).addScaledVector(h.n, 0.006);
          d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), h.n);
          this.pig.add(d);
          this.decals.push(d);
        }
      }
    }
    const now = performance.now();
    if (any && now - this.lastSiz > 170) { this.lastSiz = now; this.ctx.sfx.sizzle(); }
    if (Math.random() < 0.2) {
      this.ctx.particles.burst({ pos: tip, colors: [0xffd166], color: 0xffd166, count: 2, size: [0.015, 0.04], up: 1, speed: [0.2, 0.6], life: [0.2, 0.5] });
    }
    if (this.burnt >= this.total) this.finish('猪毛烧得干干净净 🔥');
  }

  getProgress() { return { text: `烧毛 ${this.burnt}/${this.total}`, value: this.total ? this.burnt / this.total : 0 }; }
}

/* ============ 3. 刮酸奶盖 ============ */
class YogurtScene extends SceneBase {
  static label = '刮酸奶盖';
  static emoji = '🥄';
  static hint = '按住拖动勺子，把盖子上的酸奶刮干净';
  static bg = 'linear-gradient(160deg,#fff8ec 0%,#ffeff5 50%,#f2ecff 100%)';
  static cam = { pos: [0, 3.0, 4.6], look: [0, 0.35, 0] };

  constructor(ctx) {
    super(ctx);
    this.group.add(makeStage({ top: 0xfdeff8, side: 0xdcb9cd }));

    this.lid = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.15, 0.07, 48), M(0xd9dfe7, { metalness: 0.85, roughness: 0.22 }));
    this.lid.position.y = 0.035;
    this.lid.receiveShadow = true;
    this.group.add(this.lid);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.055, 10, 60), M(0xc3ccd6, { metalness: 0.8, roughness: 0.28 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.06;
    this.group.add(rim);

    /* 旁边的酸奶杯装饰 */
    const cup = new THREE.Group();
    cup.position.set(3.35, 0, 1.55);
    const cupBody = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.48, 1.05, 24), M(0xff9ec3));
    cupBody.position.y = 0.53;
    cupBody.castShadow = true;
    const cupTop = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.09, 24), M(0xfff6ee));
    cupTop.position.y = 1.1;
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 10), M(0x7ad0ff));
    straw.position.set(0.18, 1.55, 0);
    straw.rotation.z = 0.18;
    cup.add(cupBody, cupTop, straw);
    this.group.add(cup);

    /* 酸奶残留 */
    this.blobs = [];
    this.total = 0;
    for (let i = 0; i < 85; i++) {
      const rr = Math.sqrt(Math.random()) * 1.95;
      const ang = rand(0, Math.PI * 2);
      const r = rand(0.13, 0.3);
      const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), M(0xfffdf4, { roughness: 0.35 }));
      b.scale.y = rand(0.3, 0.5);
      b.position.set(Math.cos(ang) * rr, r * 0.25, Math.sin(ang) * rr);
      b.castShadow = true;
      this.group.add(b);
      this.blobs.push({ m: b, alive: true });
      this.total++;
    }

    /* 勺子 */
    this.spoon = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.4, 10), M(0xe6ebf2, { metalness: 0.85, roughness: 0.2 }));
    handle.position.y = 0.72;
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), M(0xe6ebf2, { metalness: 0.85, roughness: 0.2 }));
    bowl.scale.set(1, 0.45, 1.35);
    this.spoon.add(handle, bowl);
    this.spoon.position.set(0, 0.22, 0);
    this.spoon.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(this.spoon);

    this.plane = makePointerPlane(0.6);
    this.group.add(this.plane);
    this.removed = 0;
    this.lastSquish = 0;
  }

  work(point, force) {
    const px = limit(point.x, -2.4, 2.4);
    const pz = limit(point.z, -1.8, 1.8);
    this.spoon.position.x = px;
    this.spoon.position.z = pz;
    if (!force) return;
    let hit = false;
    for (const b of this.blobs) {
      if (!b.alive) continue;
      const dx = b.m.position.x - px, dz = b.m.position.z - pz;
      if (dx * dx + dz * dz < 0.16) {
        b.alive = false;
        hit = true;
        this.removed++;
        const m = b.m;
        this.ctx.tweens.add({
          dur: 0.16,
          onUpdate: (k) => m.scale.set(Math.max(0.01, 1 - k), Math.max(0.01, 1 - k), Math.max(0.01, 1 - k)),
          onDone: () => { m.visible = false; }
        });
        this.ctx.particles.burst({
          pos: m.position.clone(), colors: [0xfffdf4, 0xfff3d6], color: 0xfffdf4,
          count: 3, size: [0.015, 0.04], up: 1.4, speed: [0.3, 1], life: [0.25, 0.5]
        });
      }
    }
    if (!hit) return;
    const now = performance.now();
    if (now - this.lastSquish > 130) { this.lastSquish = now; this.ctx.sfx.squish(); }
    if (this.removed >= this.total) {
      for (let i = 0; i < 2; i++) {
        this.ctx.particles.burst({
          pos: new THREE.Vector3(rand(-1.5, 1.5), 0.8, rand(-1.5, 1.5)),
          colors: [0xffffff, 0xfff3b0, 0xbfe3ff], color: 0xffffff,
          count: 14, size: [0.02, 0.06], up: 2.6, speed: [0.6, 1.8]
        });
      }
      this.finish('盖子刮得锃亮 ✨');
    }
  }

  onDown(ray, point) { if (point) this.work(point, true); }
  onMove(ray, point, pressed) { if (point) this.work(point, pressed); }
  getProgress() { return { text: `刮净 ${this.removed}/${this.total}`, value: this.total ? this.removed / this.total : 0 }; }
}

/* ============ 4. 捏方便面 ============ */
class NoodleScene extends SceneBase {
  static label = '捏方便面';
  static emoji = '🍜';
  static hint = '疯狂点击面饼，把它捏得粉碎！';
  static bg = 'linear-gradient(160deg,#fff8dd 0%,#ffedc2 55%,#ffe4d2 100%)';
  static cam = { pos: [0, 2.9, 4.9], look: [0, 0.9, 0] };

  constructor(ctx) {
    super(ctx);
    this.group.add(makeStage({ top: 0xffeccf, side: 0xd9b183 }));

    /* 包装盒（开口纸盒） */
    this.wrap = new THREE.Group();
    const wrapMat = M(0xff8fa8, { roughness: 0.8 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.52, 0.07), wrapMat);
    back.position.set(0, 0.26, -1.0);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.52, 2.05), wrapMat);
    left.position.set(-1.5, 0.26, 0);
    const right = left.clone();
    right.position.x = 1.5;
    const front = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.3, 0.07), M(0xffa9bf));
    front.position.set(0, 0.15, 1.0);
    this.wrap.add(back, left, right, front);
    this.wrap.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(this.wrap);

    /* 面饼：一根根弯弯曲曲的面条 */
    this.pieces = [];
    this.crumbGeo = new THREE.BoxGeometry(0.075, 0.06, 0.06);
    this.crumbs = [];
    for (let i = 0; i < 28; i++) {
      const pts = [];
      const amp = rand(0.05, 0.12), ph = rand(0, 6.28);
      const amp2 = rand(0.04, 0.1), ph2 = rand(0, 6.28);
      for (let k = 0; k <= 8; k++) {
        const u = k / 8;
        pts.push(new THREE.Vector3(
          -1.15 + 2.3 * u,
          Math.sin(ph + u * 9.4) * amp,
          Math.cos(ph2 + u * 7.1) * amp2
        ));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.045, 6, false), M(pick([0xffd66b, 0xf9c95c, 0xffde85]), { roughness: 0.55 }));
      m.position.set(rand(-0.08, 0.08), 0.1 + i * 0.036, rand(-0.08, 0.08));
      m.rotation.y = (i % 2 ? 0.14 : -0.12) + rand(-0.05, 0.05);
      m.castShadow = true;
      this.wrap.add(m);
      this.pieces.push({ m, curve, dead: false });
    }

    /* 捏面的大手 */
    this.hand = new THREE.Group();
    const skinMat = M(0xffd9bd, { roughness: 0.6 });
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), skinMat);
    palm.scale.set(1.15, 0.85, 1.0);
    this.hand.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.26, 4, 10), skinMat);
      f.position.set(-0.36 + i * 0.24, 0.14, 0.3);
      f.rotation.x = -1.15;
      this.hand.add(f);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.22, 4, 10), skinMat);
    thumb.position.set(0.48, 0.05, 0.12);
    thumb.rotation.z = 1.1;
    this.hand.add(thumb);
    this.hand.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.hand.position.set(0, 2.7, 0);
    this.group.add(this.hand);

    this.plane = makePointerPlane(1.7);
    this.group.add(this.plane);
    this.squeeze = 0;
    this.slamming = false;
  }

  moveHand(point) {
    this.hand.position.x = limit(point.x, -1.3, 1.3);
    this.hand.position.z = limit(point.z, -0.9, 0.9);
  }
  onDown(ray, point) {
    if (point) this.moveHand(point);
    this.slam();
  }
  onMove(ray, point) { if (point) this.moveHand(point); }

  slam() {
    if (this.slamming || this.done) return;
    this.slamming = true;
    const h = this.hand, y0 = 2.7, y1 = 1.5;
    this.ctx.tweens.add({
      dur: 0.08, ease: (k) => k,
      onUpdate: (k) => { h.position.y = y0 + (y1 - y0) * k; },
      onDone: () => {
        this.ctx.sfx.crunch();
        this.ctx.particles.burst({
          pos: new THREE.Vector3(h.position.x, 1.35, h.position.z),
          colors: [0xffd66b, 0xf9c95c, 0xfff1c2], color: 0xffd66b,
          count: 10, size: [0.025, 0.07], up: 2.4, speed: [0.6, 1.8], floor: 0.03
        });
        const w = this.wrap;
        this.ctx.tweens.add({ dur: 0.3, onUpdate: (k) => { w.rotation.z = Math.sin(k * 36) * 0.045 * (1 - k); } });
        const n = 2 + Math.floor(this.squeeze / 25);
        const whole = this.pieces.filter((p) => !p.dead);
        for (let i = 0; i < Math.min(n, whole.length); i++) {
          const p = whole.splice(Math.floor(Math.random() * whole.length), 1)[0];
          this.crumbleStrand(p);
        }
        this.squeeze = Math.min(100, this.squeeze + 9);
        if (this.squeeze >= 100) this.collapse();
        this.ctx.tweens.add({
          dur: 0.24, delay: 0.05,
          onUpdate: (k) => { h.position.y = y1 + (y0 - y1) * k; },
          onDone: () => { this.slamming = false; }
        });
      }
    });
  }

  /* 面条被捏碎：变成一堆小碎渣落在包装盒里 */
  crumbleStrand(p) {
    p.dead = true;
    p.m.visible = false;
    const pos = new THREE.Vector3();
    p.m.getWorldPosition(pos);
    for (let i = 0; i < 10; i++) {
      const local = p.curve.getPoint(Math.random()).applyEuler(p.m.rotation).add(p.m.position);
      const c = new THREE.Mesh(this.crumbGeo, p.m.material);
      c.position.copy(local);
      c.scale.setScalar(rand(0.35, 0.8));
      c.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      c.castShadow = true;
      this.wrap.add(c);
      this.crumbs.push({
        m: c,
        vel: new THREE.Vector3(rand(-1.3, 1.3), rand(1.4, 2.8), rand(-1.1, 1.1)),
        av: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9))
      });
    }
    this.ctx.particles.burst({
      pos, colors: [0xffd66b, 0xf9c95c, 0xfff1c2], color: 0xffd66b,
      count: 5, size: [0.02, 0.05], up: 1.8, speed: [0.4, 1.4], floor: 0.03
    });
  }

  collapse() {
    this.ctx.sfx.crunch();
    for (const p of this.pieces) {
      if (!p.dead) this.crumbleStrand(p);
    }
    const w = this.wrap;
    this.ctx.tweens.add({ dur: 0.3, onUpdate: (k) => { w.rotation.z = Math.sin(k * 36) * 0.05 * (1 - k); } });
    this.ctx.particles.burst({
      pos: new THREE.Vector3(0, 1.0, 0),
      colors: [0xffd66b, 0xfff1c2, 0xf9c95c], color: 0xffd66b,
      count: 30, size: [0.02, 0.06], up: 3, speed: [0.8, 2.4], floor: 0.03
    });
    this.finish('咔嚓！面饼捏成碎渣啦 🍜');
  }

  update(dt) {
    for (const c of this.crumbs) {
      if (c.vel.lengthSq() === 0 && c.av.lengthSq() === 0) continue;
      c.vel.y -= 9.5 * dt;
      c.m.position.addScaledVector(c.vel, dt);
      c.m.rotation.x += c.av.x * dt;
      c.m.rotation.y += c.av.y * dt;
      c.m.rotation.z += c.av.z * dt;
      if (c.m.position.y < 0.06) {
        c.m.position.y = 0.06;
        c.m.position.x = limit(c.m.position.x, -1.35, 1.35);
        c.m.position.z = limit(c.m.position.z, -0.88, 0.88);
        c.vel.y *= -0.3;
        c.vel.x *= 0.7;
        c.vel.z *= 0.7;
        c.av.multiplyScalar(0.6);
        if (c.vel.lengthSq() < 0.02) { c.vel.set(0, 0, 0); c.av.set(0, 0, 0); }
      }
    }
  }

  getProgress() { return { text: `捏碎度 ${this.squeeze}%`, value: this.squeeze / 100 }; }
}

/* ============ 5. 压碎饼干 ============ */
class CookieScene extends SceneBase {
  static label = '压碎饼干';
  static emoji = '🍪';
  static hint = '移动擀面杖到饼干上，点击压碎它们';
  static bg = 'linear-gradient(160deg,#fff3e2 0%,#ffe8d0 50%,#fff0dc 100%)';
  static cam = { pos: [0, 3.3, 5.9], look: [0, 0.4, 0] };

  constructor(ctx) {
    super(ctx);
    this.group.add(makeStage({ top: 0xffe9d4, side: 0xdcae87 }));

    const plate = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.55, 0.14, 48), M(0xfffdf8, { roughness: 0.35 }));
    plate.position.y = 0.07;
    plate.receiveShadow = true;
    plate.castShadow = true;
    this.group.add(plate);

    this.cookies = [];
    this.crushed = 0;
    this.total = 6;
    const chipGeo = new THREE.SphereGeometry(0.07, 8, 6);
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3 + 0.4;
      const c = new THREE.Group();
      c.position.set(Math.cos(ang) * 1.5, 0.24, Math.sin(ang) * 1.5);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.55, 0.16, 24), M(0xdfa35e, { roughness: 0.8 }));
      body.castShadow = true;
      body.receiveShadow = true;
      c.add(body);
      const chipMat = M(0x6b4226, { roughness: 0.6 });
      for (let j = 0; j < 5; j++) {
        const chip = new THREE.Mesh(chipGeo, chipMat);
        const ca = rand(0, Math.PI * 2), cr = rand(0, 0.4);
        chip.position.set(Math.cos(ca) * cr, 0.09, Math.sin(ca) * cr);
        chip.scale.y = 0.55;
        c.add(chip);
      }
      this.group.add(c);
      this.cookies.push({ g: c, alive: true });
    }

    /* 擀面杖 */
    this.pin = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.7, 20), M(0xdca66d, { roughness: 0.5 }));
    barrel.rotation.z = Math.PI / 2;
    const hMat = M(0xe9cba1, { roughness: 0.5 });
    const h1 = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.5, 12), hMat);
    h1.rotation.z = Math.PI / 2;
    h1.position.x = 1.16;
    const h2 = h1.clone();
    h2.position.x = -1.16;
    this.pin.add(barrel, h1, h2);
    this.pin.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.pin.position.set(0, 1.9, 0);
    this.group.add(this.pin);

    this.plane = makePointerPlane(1.3);
    this.group.add(this.plane);
    this.debris = [];
    this.busy = false;
  }

  onDown(ray, point) {
    if (point) this.movePin(point);
    this.tryCrush();
  }
  onMove(ray, point, pressed) {
    if (point) this.movePin(point);
    if (pressed) this.tryCrush();
  }

  movePin(p) {
    this.pin.position.x = limit(p.x, -2.2, 2.2);
    this.pin.position.z = limit(p.z, -1.6, 1.6);
  }

  tryCrush() {
    if (this.busy || this.done) return;
    const px = this.pin.position.x, pz = this.pin.position.z;
    let target = null;
    for (const c of this.cookies) {
      if (!c.alive) continue;
      const dx = c.g.position.x - px, dz = c.g.position.z - pz;
      if (dx * dx + dz * dz < 0.36) { target = c; break; }
    }
    if (!target) return;
    this.busy = true;
    const pin = this.pin, y0 = 1.9, y1 = 0.62;
    this.ctx.tweens.add({
      dur: 0.09, ease: (k) => k,
      onUpdate: (k) => { pin.position.y = y0 + (y1 - y0) * k; },
      onDone: () => {
        this.crushCookie(target);
        this.ctx.tweens.add({
          dur: 0.28, delay: 0.06,
          onUpdate: (k) => { pin.position.y = y1 + (y0 - y1) * k; },
          onDone: () => { this.busy = false; }
        });
      }
    });
  }

  crushCookie(c) {
    c.alive = false;
    c.g.visible = false;
    this.crushed++;
    this.ctx.sfx.crunch();
    const pos = c.g.position.clone();
    pos.y = 0.3;
    this.ctx.particles.burst({
      pos, colors: [0xdfa35e, 0xc98748, 0xf2c98d], color: 0xdfa35e,
      count: 14, size: [0.02, 0.06], up: 2.2, speed: [0.5, 1.8], floor: 0.03
    });
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.CylinderGeometry(0.58, 0.55, 0.15, 8, 1, false, i * 1.256, 1.256);
      const w = new THREE.Mesh(geo, M(0xdfa35e, { roughness: 0.8 }));
      w.castShadow = true;
      w.position.copy(c.g.position);
      this.group.add(w);
      const mid = i * 1.256 + 0.63;
      const dir = new THREE.Vector3(Math.sin(mid), 0, Math.cos(mid));
      this.debris.push({
        m: w,
        vel: dir.multiplyScalar(rand(1.2, 2.2)).setY(rand(1.6, 2.6)),
        av: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6))
      });
    }
    if (this.crushed >= this.total) {
      this.ctx.particles.burst({
        pos: new THREE.Vector3(0, 1.2, 0),
        colors: [0xff9ebf, 0x8fd0ff, 0xffe08a], color: 0xff9ebf,
        count: 26, size: [0.03, 0.08], up: 3.2, speed: [0.8, 2.4]
      });
      this.finish('饼干全部压碎啦，咔嚓咔嚓 🍪');
    }
  }

  update(dt) {
    for (const d of this.debris) {
      if (d.vel.lengthSq() === 0 && d.av.lengthSq() === 0) continue;
      d.vel.y -= 9.5 * dt;
      d.m.position.addScaledVector(d.vel, dt);
      d.m.rotation.x += d.av.x * dt;
      d.m.rotation.y += d.av.y * dt;
      d.m.rotation.z += d.av.z * dt;
      if (d.m.position.y < 0.09) {
        d.m.position.y = 0.09;
        d.vel.y *= -0.32;
        d.vel.x *= 0.72;
        d.vel.z *= 0.72;
        d.av.multiplyScalar(0.65);
        if (d.vel.lengthSq() < 0.02) { d.vel.set(0, 0, 0); d.av.set(0, 0, 0); }
      }
    }
  }

  getProgress() { return { text: `压碎 ${this.crushed}/${this.total}`, value: this.crushed / this.total }; }
}

/* ============ 6. 捏泡泡纸 ============ */
class BubbleScene extends SceneBase {
  static label = '捏泡泡纸';
  static emoji = '🫧';
  static hint = '点按或划过泡泡，把它们全部捏爆！';
  static bg = 'linear-gradient(160deg,#e3edff 0%,#dbe7ff 45%,#efe6ff 100%)';
  static cam = { pos: [0, 3.6, 7.2], look: [0, 0.3, 0] };

  constructor(ctx) {
    super(ctx);
    this.group.add(makeStage({ top: 0xdbe8ff, side: 0xa9bfe8 }));

    const sheet = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.16, 4.8), M(0xa9c6f2, { roughness: 0.35 }));
    sheet.position.y = 0.08;
    sheet.castShadow = true;
    sheet.receiveShadow = true;
    this.group.add(sheet);

    this.cols = 12;
    this.rows = 8;
    this.total = this.cols * this.rows;
    this.popped = 0;
    this.bubbles = [];
    const geo = new THREE.SphereGeometry(0.245, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const palette = [0xeef4ff, 0xd6e8ff, 0xffe3f1, 0xdcf7ec];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const mat = new THREE.MeshStandardMaterial({
          color: palette[(r + c) % palette.length],
          roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.92
        });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(-3.12 + c * 0.567, 0.16, -1.98 + r * 0.567);
        m.castShadow = true;
        const b = { m, alive: true, pop: false, i: r * this.cols + c };
        m.userData.bubble = b;
        this.bubbles.push(b);
        this.group.add(m);
      }
    }
    this.meshes = this.bubbles.map((b) => b.m);
    this.plane = makePointerPlane(0.4);
    this.group.add(this.plane);
  }

  popAt(ray) {
    const hits = ray.intersectObjects(this.meshes, false);
    for (const h of hits) {
      const b = h.object.userData.bubble;
      if (b && b.alive) { this.pop(b); break; }
    }
  }

  pop(b) {
    b.alive = false;
    b.pop = true;
    this.popped++;
    const m = b.m;
    this.ctx.tweens.add({
      dur: 0.16,
      onUpdate: (k) => {
        m.scale.set(1 + Math.sin(k * Math.PI) * 0.15, Math.max(0.12, 1 - k * 0.88), 1 + Math.sin(k * Math.PI) * 0.15);
      },
      onDone: () => {
        m.material.color.set(0xb4bdc9);
        m.material.opacity = 0.45;
        m.material.roughness = 0.8;
      }
    });
    const wp = new THREE.Vector3();
    m.getWorldPosition(wp);
    this.ctx.particles.ring({ pos: wp, color: 0xffffff, size: 0.35 });
    this.ctx.particles.burst({
      pos: wp, colors: [0xffffff, 0xd6e8ff], color: 0xd6e8ff,
      count: 4, size: [0.02, 0.05], up: 1.6, speed: [0.4, 1.1], life: [0.25, 0.5]
    });
    this.ctx.sfx.pop();
    if (this.popped >= this.total) {
      for (let i = 0; i < 3; i++) {
        this.ctx.particles.burst({
          pos: new THREE.Vector3(rand(-2, 2), rand(0.5, 1.5), rand(-1, 1)),
          colors: [0xff9ebf, 0x8fd0ff, 0xffe08a, 0x9ef0c5], color: 0xff9ebf,
          count: 18, size: [0.03, 0.08], up: 3, speed: [0.8, 2.5]
        });
      }
      this.finish('哇！全部捏爆啦，超解压 🎉');
    }
  }

  onDown(ray) { this.popAt(ray); }
  onMove(ray, point, pressed) { if (pressed) this.popAt(ray); }

  update(dt, t) {
    for (const b of this.bubbles) {
      if (b.alive && !b.pop) b.m.scale.y = 1 + Math.sin(t * 2.6 + b.i * 0.55) * 0.035;
    }
  }

  getProgress() { return { text: `捏爆 ${this.popped}/${this.total}`, value: this.popped / this.total }; }
}

/* ============ 7. 切肥皂 ============ */
class SoapScene extends SceneBase {
  static label = '切肥皂';
  static emoji = '🧼';
  static hint = '点击切刀，把肥皂切成一片片';
  static bg = 'linear-gradient(160deg,#e6f9f1 0%,#dcf5ea 50%,#eefcec 100%)';
  static cam = { pos: [0, 2.6, 4.2], look: [0, 0.5, 0] };

  constructor(ctx) {
    super(ctx);
    this.group.add(makeStage({ top: 0xdcf5ea, side: 0xa5d4bf }));

    const plate = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 1.7), M(0xfffdf8, { roughness: 0.35 }));
    plate.position.y = 0.05;
    plate.receiveShadow = true;
    this.group.add(plate);

    /* 圆润的长条肥皂（胶囊形），切成一片片圆片 */
    this.sliceColors = [0xa8e6cf, 0xffd3e0, 0xcfe8ff, 0xfff3b0];
    this.soapR = 0.42;
    this.sliceW = 0.3;
    this.slicesTotal = 8;
    this.barLeft = -1.25;
    this.soapColor = pick(this.sliceColors);
    this.pillGeo = new THREE.CapsuleGeometry(this.soapR, 0.08, 6, 18);
    this.pillMat = M(this.soapColor, { roughness: 0.4 });
    this.cutPills = [];
    this.bar = new THREE.Mesh(this.barGeo(this.slicesTotal), M(this.soapColor, { roughness: 0.4 }));
    this.bar.rotation.z = Math.PI / 2;
    this.bar.position.set(this.barX(this.slicesTotal), 0.44, 0);
    this.bar.castShadow = true;
    this.group.add(this.bar);

    /* 铡刀 */
    this.knife = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 1.5), M(0xdfe6ee, { metalness: 0.8, roughness: 0.2 }));
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.55), M(0x4a4458));
    handle.position.set(0, 0.12, 1.0);
    this.knife.add(blade, handle);
    this.knife.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.knife.position.set(0, 1.9, 0);
    this.group.add(this.knife);

    this.curlGeo = new THREE.TorusGeometry(0.1, 0.03, 8, 16, 4.2);
    this.debris = [];

    this.plane = makePointerPlane(1.2);
    this.group.add(this.plane);
    this.cutIndex = 0;
    this.cuts = 0;
    this.busy = false;
    this.doneAt = 0;
  }

  onDown() { this.cut(); }

  /* 剩 n 片时的肥皂条几何体（胶囊总长 = n*片厚） */
  barGeo(n) {
    return new THREE.CapsuleGeometry(this.soapR, Math.max(0.05, n * this.sliceW - this.soapR * 2), 6, 20);
  }
  barX(n) {
    return this.barLeft + (n * this.sliceW) / 2;
  }

  cut() {
    if (this.busy || this.cutIndex >= this.slicesTotal) return;
    this.busy = true;
    const remain = this.slicesTotal - this.cutIndex;
    const cutX = this.barLeft + remain * this.sliceW - this.sliceW / 2;
    const knife = this.knife;
    knife.position.x = cutX;
    const y0 = 1.9, y1 = 0.5;
    this.ctx.tweens.add({
      dur: 0.09, ease: (k) => k,
      onUpdate: (k) => { knife.position.y = y0 + (y1 - y0) * k; },
      onDone: () => {
        this.ctx.sfx.slice();
        const col = this.soapColor;
        this.ctx.particles.burst({
          pos: new THREE.Vector3(cutX, 0.6, 0), colors: [col], color: col,
          count: 6, size: [0.02, 0.05], up: 1.6, speed: [0.4, 1.2]
        });
        /* 肥皂卷屑 */
        const curl = new THREE.Mesh(this.curlGeo, M(col, { roughness: 0.4 }));
        curl.position.set(cutX, 0.85, 0);
        curl.castShadow = true;
        this.group.add(curl);
        this.debris.push({
          m: curl,
          vel: new THREE.Vector3(rand(-0.8, 0.4), rand(0.8, 1.6), rand(0.5, 1.2)),
          av: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6))
        });
        /* 切下的圆片倒向前排 */
        const pill = new THREE.Mesh(this.pillGeo, this.pillMat);
        pill.position.set(cutX, 0.46, 0);
        pill.castShadow = true;
        this.group.add(pill);
        this.cutPills.push(pill);
        const idx = this.cutIndex;
        const from = pill.position.clone();
        const to = new THREE.Vector3(-1.7 + idx * 0.46, 0.43, 1.3);
        this.ctx.tweens.add({
          dur: 0.5,
          onUpdate: (k) => {
            pill.position.lerpVectors(from, to, k);
            pill.position.y += Math.sin(k * Math.PI) * 0.5;
            pill.rotation.x = (Math.PI / 2) * k;
          }
        });
        /* 剩下的肥皂条变短 */
        this.cutIndex++;
        this.cuts++;
        const n = this.slicesTotal - this.cutIndex;
        this.bar.geometry.dispose();
        if (n > 0) {
          this.bar.geometry = this.barGeo(n);
          this.bar.position.x = this.barX(n);
        } else {
          this.bar.visible = false;
        }
        this.ctx.tweens.add({
          dur: 0.26, delay: 0.08,
          onUpdate: (k) => { knife.position.y = y1 + (y0 - y1) * k; },
          onDone: () => { this.busy = false; }
        });
        if (this.cutIndex >= this.slicesTotal) {
          this.finish('肥皂切好啦，一片一片好治愈 🧼');
          this.doneAt = performance.now();
        }
      }
    });
  }

  update(dt) {
    for (const d of this.debris) {
      if (d.vel.lengthSq() === 0) continue;
      d.vel.y -= 9 * dt;
      d.m.position.addScaledVector(d.vel, dt);
      d.m.rotation.x += d.av.x * dt;
      d.m.rotation.y += d.av.y * dt;
      d.m.rotation.z += d.av.z * dt;
      if (d.m.position.y < 0.05) {
        d.m.position.y = 0.05;
        d.vel.set(0, 0, 0);
        d.av.set(0, 0, 0);
      }
    }
    if (this.doneAt && performance.now() - this.doneAt > 1500 && this.cutIndex >= this.slicesTotal) {
      this.doneAt = 0;
      for (const p of this.cutPills) this.group.remove(p);
      this.cutPills.length = 0;
      this.cutIndex = 0;
      this.bar.geometry.dispose();
      this.bar.geometry = this.barGeo(this.slicesTotal);
      this.bar.position.x = this.barX(this.slicesTotal);
      this.bar.visible = true;
      if (window.toast) window.toast('新肥皂来啦 🧼', 1200);
    }
  }

  getProgress() { return { text: `已切 ${this.cuts} 片`, value: this.cutIndex / 8 }; }
}

/* ============ 场景注册表 ============ */
const SCENE_LIST = [
  SoapScene,
  FishScene,
  PigScene,
  YogurtScene,
  NoodleScene,
  CookieScene,
  BubbleScene
];

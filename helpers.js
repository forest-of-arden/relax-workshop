/* 经典脚本版本（可在 file:// 下直接双击打开）；THREE 来自 lib/three.global.js */

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const limit = (v, a, b) => Math.max(a, Math.min(b, v)); /* 改名避开 three.js 内部的 clamp */
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

const M = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts });

/* 轻量补间动画管理 */
class Tweens {
  constructor() { this.list = []; }
  add({ dur = 0.3, delay = 0, ease = easeOut, onUpdate, onDone } = {}) {
    const tw = { t: -delay, dur, ease, onUpdate, onDone };
    this.list.push(tw);
    return tw;
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = Math.min(1, tw.t / tw.dur);
      if (tw.onUpdate) tw.onUpdate(tw.ease(k), k);
      if (k >= 1) {
        this.list.splice(i, 1);
        if (tw.onDone) tw.onDone();
      }
    }
  }
  clear() { this.list.length = 0; }
}

/* 圆形舞台底座（可爱立体模型台） */
function makeStage({ top = 0xffe3ee, side = 0xf3c6d6, r = 5.6 } = {}) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 0.94, 0.7, 64),
    new THREE.MeshStandardMaterial({ color: top, roughness: 0.95 })
  );
  m.position.y = -0.35;
  m.receiveShadow = true;
  g.add(m);
  const b = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 1.1, r * 1.18, 0.26, 64),
    new THREE.MeshStandardMaterial({ color: side, roughness: 0.95 })
  );
  b.position.y = -0.83;
  b.receiveShadow = true;
  g.add(b);
  return g;
}

/* 木砧板 */
function makeBoard({ w = 5.2, d = 3.2, h = 0.22, color = 0xd9a066 } = {}) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  );
  board.position.y = h / 2;
  board.castShadow = true;
  board.receiveShadow = true;
  g.add(board);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.995, 0.006, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xc08a52, roughness: 0.9 })
    );
    s.position.set(0, h + 0.002, -d / 3 + (i * d) / 3);
    g.add(s);
  }
  return g;
}

/* 不可见指针拾取平面 */
function makePointerPlane(y = 0.5) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ visible: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}

/* 经典脚本版本；THREE 来自 lib/three.global.js，rand 来自 helpers.js */

const GEO_BOX = new THREE.BoxGeometry(1, 1, 1);
const GEO_SPHERE = new THREE.SphereGeometry(1, 8, 6);
const GEO_DISC = new THREE.CylinderGeometry(1, 1, 0.35, 12);
const GEO_RING = new THREE.TorusGeometry(0.5, 0.06, 8, 32);

/* 简易粒子系统：碎屑 / 水滴 / 烟雾 / 冲击光环 */
class Particles {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  spawn({ geo = GEO_BOX, pos, vel = new THREE.Vector3(), color = 0xffffff, size = 0.08,
          life = 0.8, gravity = 9, grow = 0, spin, ring = false, floor } = {}) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false }));
    m.position.copy(pos);
    m.scale.setScalar(size);
    if (ring) {
      m.rotation.x = -Math.PI / 2;
      m.position.y += 0.02;
    } else {
      m.rotation.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
    }
    this.scene.add(m);
    this.items.push({
      m, vel: vel.clone(), life, age: 0, gravity, grow,
      spin: spin === undefined ? rand(-6, 6) : spin,
      ring, size, floor
    });
    return m;
  }

  burst({ pos, color = 0xffffff, colors = null, count = 12, size = [0.04, 0.1],
          speed = [1, 2.6], up = 2.2, life = [0.4, 0.9], gravity = 9, geo = GEO_BOX, floor } = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(speed[0], speed[1]);
      this.spawn({
        geo, pos,
        vel: new THREE.Vector3(Math.cos(a) * r, rand(up * 0.3, up), Math.sin(a) * r),
        color: colors ? colors[i % colors.length] : color,
        size: rand(size[0], size[1]),
        life: rand(life[0], life[1]),
        gravity, floor
      });
    }
  }

  ring({ pos, color = 0xffffff, size = 0.4, life = 0.3 } = {}) {
    this.spawn({ geo: GEO_RING, pos, color, size, life, gravity: 0, ring: true });
  }

  smoke({ pos, count = 4, color = 0xb9b9c3 } = {}) {
    for (let i = 0; i < count; i++) {
      this.spawn({
        geo: GEO_DISC,
        pos: pos.clone().add(new THREE.Vector3(rand(-0.1, 0.1), rand(0, 0.15), rand(-0.1, 0.1))),
        vel: new THREE.Vector3(rand(-0.25, 0.25), rand(0.5, 1.1), rand(-0.25, 0.25)),
        color, size: rand(0.1, 0.18), life: rand(0.8, 1.4), gravity: -0.5, grow: 1.6
      });
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.scene.remove(p.m);
        p.m.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.m.position.addScaledVector(p.vel, dt);
      if (p.floor !== undefined && p.m.position.y < p.floor) {
        p.m.position.y = p.floor;
        p.vel.y *= -0.3;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
      }
      const k = p.age / p.life;
      p.m.material.opacity = 1 - k * k;
      if (p.ring) {
        p.m.scale.setScalar(p.size * (1 + k * 5));
      } else {
        if (p.grow) p.m.scale.multiplyScalar(1 + p.grow * dt);
        p.m.rotation.x += p.spin * dt;
        p.m.rotation.z += p.spin * 0.7 * dt;
      }
    }
  }

  clear() {
    for (const p of this.items) {
      this.scene.remove(p.m);
      p.m.material.dispose();
    }
    this.items.length = 0;
  }
}

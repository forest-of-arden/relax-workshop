/* 经典脚本版本；THREE 来自 lib/three.global.js，其余来自 helpers/scenes/particles/sfx.js */

const $ = (s) => document.querySelector(s);
const app = $('#app');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const threeScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 120);
const CAM_HOME = { pos: new THREE.Vector3(0, 5.6, 9.8), look: new THREE.Vector3(0, 0.5, 0), _look: new THREE.Vector3(0, 0.5, 0) };
camera.position.copy(CAM_HOME.pos);
camera.lookAt(CAM_HOME.look);

/* 常驻灯光 */
const hemi = new THREE.HemisphereLight(0xffffff, 0xffdce9, 1.1);
threeScene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(6, 11, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -8;
sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8;
sun.shadow.camera.bottom = -8;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 30;
sun.shadow.camera.updateProjectionMatrix();
threeScene.add(sun);
const rim = new THREE.DirectionalLight(0xcfe8ff, 0.5);
rim.position.set(-6, 4, -5);
threeScene.add(rim);

const sfx = new SFX();
const particles = new Particles(threeScene);
const tweens = new Tweens();
const ctx = { scene: threeScene, camera, renderer, sfx, particles, tweens };

let current = null;
let currentIndex = -1;

/* 场景坞 */
const dock = $('#dock');
SCENE_LIST.forEach((S, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.innerHTML = `<span class="em">${S.emoji}</span>${S.label}`;
  b.onclick = () => switchTo(i);
  dock.appendChild(b);
});
function updateDock() {
  [...dock.children].forEach((c, i) => c.classList.toggle('active', i === currentIndex));
  /* 保持选中项可见 */
  const el = dock.children[currentIndex];
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}

/* toast 提示 */
window.toast = (msg, ms = 1900) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms);
};

/* 场景切换 */
function switchTo(i) {
  if (current) {
    try { current.dispose(); } catch (e) { console.warn(e); }
  }
  tweens.clear();
  particles.clear();
  const S = SCENE_LIST[i];
  current = new S(ctx);
  currentIndex = i;
  document.body.style.background = S.bg;
  $('#scene-name').textContent = `${S.emoji} ${S.label}`;
  $('#hint').textContent = S.hint;
  updateDock();
  /* 每个场景自带取景：主体约占画面 2/3，相机平滑过渡 */
  const cam = S.cam || { pos: CAM_HOME.pos.toArray(), look: CAM_HOME.look.toArray() };
  const p0 = camera.position.clone();
  const l0 = CAM_HOME._look.clone();
  const p1 = new THREE.Vector3(...cam.pos);
  const l1 = new THREE.Vector3(...cam.look);
  tweens.add({
    dur: 0.7,
    onUpdate: (k) => {
      camera.position.lerpVectors(p0, p1, k);
      CAM_HOME._look.lerpVectors(l0, l1, k);
      camera.lookAt(CAM_HOME._look);
    }
  });
}

$('#btn-reset').onclick = () => switchTo(currentIndex);
$('#btn-sound').onclick = (e) => {
  sfx.enabled = !sfx.enabled;
  e.currentTarget.textContent = sfx.enabled ? '🔊' : '🔇';
};

/* 指针交互 */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pressed = false;

function setRay(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
}
function planePoint() {
  if (!current || !current.plane) return null;
  const h = raycaster.intersectObject(current.plane, false)[0];
  return h ? h.point : null;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  pressed = true;
  sfx.ensure();
  setRay(e);
  if (current && current.onDown) current.onDown(raycaster, planePoint());
});
window.addEventListener('pointermove', (e) => {
  setRay(e);
  if (current && current.onMove) current.onMove(raycaster, planePoint(), pressed);
});
window.addEventListener('pointerup', (e) => {
  pressed = false;
  setRay(e);
  if (current && current.onUp) current.onUp(raycaster, planePoint());
});
window.addEventListener('pointercancel', () => {
  pressed = false;
  if (current && current.onUp) current.onUp(raycaster, null);
});
window.addEventListener('keydown', (e) => {
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= SCENE_LIST.length) switchTo(n - 1);
});
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* 主循环 */
const barFill = $('#bar i');
const progText = $('#prog-text');
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  tweens.update(dt);
  particles.update(dt);
  if (current) {
    if (current.update) current.update(dt, t);
    const p = current.getProgress ? current.getProgress() : null;
    if (p) {
      barFill.style.width = (p.value * 100).toFixed(1) + '%';
      progText.textContent = p.text;
    }
  }
  renderer.render(threeScene, camera);
}

switchTo(0);
tick();

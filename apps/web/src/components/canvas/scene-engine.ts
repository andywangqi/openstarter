import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

export type SceneItem = {
  id: string;
  url: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
};
/** One renderer and one load per GLB, regardless of the number of placements. */
export function createScene(
  host: HTMLElement,
  callbacks: {
    select: (id: string | null) => void;
    move: (id: string, x: number, y: number) => void;
    dragStart: () => void;
    status: (message: string) => void;
  },
) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#303633");
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
  camera.position.set(6, 7, 9);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.target.set(0, 0, 0);
  controls.update();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667562, 3));
  const sun = new THREE.DirectionalLight(0xfff5e3, 3);
  sun.position.set(5, 10, 6);
  scene.add(sun);
  const grid = new THREE.GridHelper(200, 200, 0x63746a, 0x444d47);
  scene.add(grid);
  const selection = new THREE.BoxHelper(new THREE.Object3D(), 0xa5d6a7);
  selection.visible = false;
  scene.add(selection);
  const templates = new Map<string, Promise<THREE.Object3D>>();
  const loaded = new Set<THREE.Object3D>();
  const objects = new Map<string, THREE.Object3D>();
  const desired = new Map<string, SceneItem>();
  const pending = new Set<string>();
  const failed = new Set<string>();
  let alive = true;
  let selected: string | null = null;
  let firstFit = true;
  let drag: { id: string; offset: THREE.Vector3; start: THREE.Vector3; pointer: number } | null =
    null;
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const loader = new GLTFLoader();
  function disposeRoot(root: THREE.Object3D) {
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
  }
  function template(url: string) {
    if (!templates.has(url))
      templates.set(
        url,
        loader
          .loadAsync(url)
          .then((gltf) => {
            const source = gltf.scene;
            if (!alive) {
              disposeRoot(source);
              throw new Error("Scene closed");
            }
            const box = new THREE.Box3().setFromObject(source);
            if (box.isEmpty()) throw new Error("Empty model");
            const size = box.getSize(new THREE.Vector3());
            const factor = 1 / Math.max(size.x, size.y, size.z, 0.01);
            source.scale.multiplyScalar(factor);
            const normalized = new THREE.Box3().setFromObject(source);
            const center = normalized.getCenter(new THREE.Vector3());
            source.position.sub(new THREE.Vector3(center.x, normalized.min.y, center.z));
            const root = new THREE.Group();
            root.add(source);
            loaded.add(root);
            return root;
          })
          .catch((error) => {
            templates.delete(url);
            throw error;
          }),
      );
    return templates.get(url)!;
  }
  function updateSelection() {
    const object = selected ? objects.get(selected) : null;
    selection.visible = Boolean(object);
    if (object) selection.setFromObject(object);
  }
  function fit() {
    const box = new THREE.Box3();
    objects.forEach((o) => box.expandByObject(o));
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const extent = Math.max(box.getSize(new THREE.Vector3()).length(), 3);
    controls.target.copy(center);
    camera.position
      .copy(center)
      .add(new THREE.Vector3(1, 1.1, 1.4).normalize().multiplyScalar(extent * 1.7));
    controls.update();
  }
  function sync(items: SceneItem[], selectedId: string | null) {
    desired.clear();
    items.forEach((i) => desired.set(i.id, i));
    selected = selectedId;
    for (const [id, obj] of objects) {
      if (!desired.has(id)) {
        scene.remove(obj);
        objects.delete(id);
        failed.delete(id);
      }
    }
    for (const item of items) {
      const obj = objects.get(item.id);
      if (obj) {
        if (drag?.id !== item.id) obj.position.set(item.x, 0, item.y);
        obj.rotation.y = -item.rotation;
        obj.scale.setScalar(item.scale);
      } else if (!pending.has(item.id) && !failed.has(item.id)) {
        pending.add(item.id);
        callbacks.status("正在加载模型…");
        void template(item.url)
          .then((source) => {
            if (!alive || !desired.has(item.id)) return;
            const instance = clone(source);
            instance.userData.modelId = item.id;
            objects.set(item.id, instance);
            scene.add(instance);
            sync([...desired.values()], selected);
            if (firstFit) {
              fit();
              firstFit = false;
            }
          })
          .catch(() => {
            if (alive) {
              failed.add(item.id);
              callbacks.status("模型加载失败，点击重试");
            }
          })
          .finally(() => {
            pending.delete(item.id);
            if (alive && pending.size === 0 && failed.size === 0) callbacks.status("");
          });
      }
    }
    updateSelection();
  }
  function cast(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(mouse, camera);
  }
  function down(event: PointerEvent) {
    if (event.button !== 0 || drag) return;
    cast(event);
    const hit = ray.intersectObjects([...objects.values()], true)[0];
    let node: THREE.Object3D | null = hit?.object ?? null;
    while (node && !node.userData.modelId) node = node.parent;
    if (!node) {
      callbacks.select(null);
      return;
    }
    const point = ray.ray.intersectPlane(ground, new THREE.Vector3());
    if (!point) return;
    controls.enabled = false;
    callbacks.select(node.userData.modelId);
    callbacks.dragStart();
    drag = {
      id: node.userData.modelId,
      offset: point.sub(node.position),
      start: node.position.clone(),
      pointer: event.pointerId,
    };
    renderer.domElement.setPointerCapture(event.pointerId);
    event.stopImmediatePropagation();
  }
  function move(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return;
    cast(event);
    const p = ray.ray.intersectPlane(ground, new THREE.Vector3());
    const obj = objects.get(drag.id);
    if (p && obj) {
      obj.position.copy(p.sub(drag.offset));
      obj.position.y = 0;
      updateSelection();
    }
    event.stopImmediatePropagation();
  }
  function up(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const obj = objects.get(drag.id);
    if (obj) {
      if (event.type === "pointercancel") obj.position.copy(drag.start);
      else callbacks.move(drag.id, obj.position.x, obj.position.z);
    }
    drag = null;
    controls.enabled = true;
    if (renderer.domElement.hasPointerCapture(event.pointerId))
      renderer.domElement.releasePointerCapture(event.pointerId);
    event.stopImmediatePropagation();
  }
  renderer.domElement.addEventListener("pointerdown", down, true);
  renderer.domElement.addEventListener("pointermove", move, true);
  renderer.domElement.addEventListener("pointerup", up, true);
  renderer.domElement.addEventListener("pointercancel", up, true);
  const resize = () => {
    const w = host.clientWidth,
      h = host.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
  return {
    sync,
    fit,
    retry() {
      failed.clear();
      sync([...desired.values()], selected);
    },
    rotateAll(angle: number) {
      controls.rotateSpeed = 1;
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    },
    dispose() {
      alive = false;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", down, true);
      renderer.domElement.removeEventListener("pointermove", move, true);
      renderer.domElement.removeEventListener("pointerup", up, true);
      renderer.domElement.removeEventListener("pointercancel", up, true);
      loaded.forEach(disposeRoot);
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      selection.geometry.dispose();
      (selection.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

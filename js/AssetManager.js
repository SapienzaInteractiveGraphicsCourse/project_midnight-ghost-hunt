// AssetManager.js: loads the glTF/glb models and prepares them for the game.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function loadGLTF(loader, url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

export async function loadAssets(setMsg) {
  const loader = new GLTFLoader();

  setMsg?.('Summoning the hunter…');
  const player = await loadGLTF(loader, './assets/models/human/human.gltf');

  setMsg?.('Forging the ray gun…');
  const raygun = await loadGLTF(loader, './assets/models/raygun/Ray_Gun.glb');

  setMsg?.('Charging the ray…');
  const fireball = await loadGLTF(loader, './assets/models/fireball/fireball.glb');

  setMsg?.('Waking the restless dead…');
  const ghost = await loadGLTF(loader, './assets/models/newWraith/wraith.gltf');

  setMsg?.('Growing the dead wood…');
  const tree = await loadGLTF(loader, './assets/models/tree/scene.gltf');

  setMsg?.('Raising the tombstones…');
  const tomb = await loadGLTF(loader, './assets/models/tombstone/scene.gltf');

  let cageModel = null;
  try { cageModel = (await loadGLTF(loader, './assets/models/cage_lamp/scene.gltf')).scene; }
  catch (e) { console.warn('cage_lamp/scene.gltf not found', e); }

  const tombVariants = [];
  tomb.scene.updateMatrixWorld(true);
  tomb.scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const cx = (bb.min.x + bb.max.x) / 2;
    const cz = (bb.min.z + bb.max.z) / 2;
    geo.translate(-cx, -bb.min.y, -cz);
    geo.computeBoundingBox();
    const h = geo.boundingBox.max.y;
    const footprint = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
    const mat = o.material.clone();
    mat.metalness = 0.0;
    mat.roughness = Math.min(1, (mat.roughness ?? 0.9) + 0.05);
    mat.envMapIntensity = 0.25;
    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
    tombVariants.push({ geo, mat, height: h || 1, footprint: footprint || 0.6 });
  });

  return { player: player.scene, raygun: raygun.scene, fireball: fireball.scene, ghostModel: ghost.scene, tree: tree.scene, cageModel, tombVariants };
}

export function normalizeToHeight(root, targetH) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.set(-center.x, -box.min.y, -center.z);
  const g = new THREE.Group();
  g.add(root);
  g.scale.setScalar(targetH / (size.y || 1));
  return { group: g, size };
}

export function centerAndScale(root, targetMax) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  const g = new THREE.Group();
  g.add(root);
  g.scale.setScalar(targetMax / (Math.max(size.x, size.y, size.z) || 1));
  return { group: g, size };
}

export function enableShadows(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
}
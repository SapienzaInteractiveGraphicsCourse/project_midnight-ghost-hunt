// ProjectileManager.js: the Supernatural Ray as a travelling green fireball.

import * as THREE from 'three';
import * as TWEEN from 'tween';

const SPEED = 40; 

export class ProjectileManager {
  constructor(scene, fireballProto, effects) {
    this.scene = scene;
    this.effects = effects;
    this.proto = this._prep(fireballProto);
    this.active = [];
  }

  _prep(proto) {
    const tmp = proto.clone(true);
    tmp.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(tmp);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    tmp.position.sub(center);
    const wrap = new THREE.Group();
    wrap.add(tmp);
    wrap.scale.setScalar(0.5 / (Math.max(size.x, size.y, size.z) || 1));
    return wrap;
  }

  spawn({ from, to, homingTarget, onResolve }) {
    const mesh = this.proto.clone(true);
    const mat = new THREE.MeshBasicMaterial({ color: 0x5dff7a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    mesh.traverse((o) => { if (o.isMesh) o.material = mat; });
    mesh.position.copy(from);
    const light = new THREE.PointLight(0x5dff7a, 3, 6, 2);
    mesh.add(light);
    this.scene.add(mesh);
    this.active.push({ mesh, mat, light, pos: from.clone(), to: to.clone(), homingTarget, onResolve, dead: false });
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (p.dead) { this.active.splice(i, 1); continue; }
      p.mesh.rotation.x += dt * 9;
      p.mesh.rotation.y += dt * 12;

      const dest = (p.homingTarget && p.homingTarget.alive) ? p.homingTarget.group.position : p.to;
      const dir = dest.clone().sub(p.pos);
      const dist = dir.length();
      const step = SPEED * dt;
      if (dist <= step + 0.35) {
        p.pos.copy(dest); p.mesh.position.copy(dest);
        this._resolve(p);
        this.active.splice(i, 1);
      } else {
        dir.multiplyScalar(step / dist);
        p.pos.add(dir); p.mesh.position.copy(p.pos);
      }
    }
  }

  _resolve(p) {
    const res = p.onResolve ? p.onResolve() : { hit: false };
    if (res && res.hit) {
      this.scene.remove(p.mesh); p.light.parent?.remove(p.light);
      this._explosion(p.pos.clone(), !!res.big);
    } else {
      this._fizzle(p);
    }
  }

  _explosion(pos, big) {
    this.effects.puff(pos, 0x7dff9a, big ? 150 : 80, big ? 3.4 : 2.2);
    this.effects.puff(pos, 0xd6ffe0, big ? 80 : 44, big ? 5.2 : 3.4);
    this.effects.puff(pos, 0x4af09a, big ? 60 : 32, big ? 1.6 : 1.1);

    const shell = (r0, r1, col, op, dur, seg) => {
      const m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
      const s = new THREE.Mesh(new THREE.SphereGeometry(r0, seg, seg), m);
      s.position.copy(pos); this.scene.add(s);
      const o = { s: r0, op };
      new TWEEN.Tween(o).to({ s: r1, op: 0 }, dur).easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => { s.scale.setScalar(o.s / r0); m.opacity = o.op; })
        .onComplete(() => { this.scene.remove(s); s.geometry.dispose(); m.dispose(); }).start();
    };
    shell(0.25, big ? 3.4 : 2.0, 0xb6ffc4, 0.95, big ? 460 : 340, 20);   
    shell(0.4, big ? 5.0 : 3.0, 0x6dff9a, 0.5, big ? 620 : 460, 24);     

    const flash = new THREE.PointLight(0x86ffae, big ? 9 : 5, big ? 11 : 7, 2);
    flash.position.copy(pos); this.scene.add(flash);
    const fo = { i: flash.intensity };
    new TWEEN.Tween(fo).to({ i: 0 }, big ? 420 : 300).easing(TWEEN.Easing.Quadratic.Out)
      .onUpdate(() => { flash.intensity = fo.i; })
      .onComplete(() => this.scene.remove(flash)).start();
  }

  _fizzle(p) {
    p.mat.color.setHex(0xff2a2a);
    if (p.light) p.light.color.setHex(0xff2a2a);
    this.effects.puff(p.pos.clone(), 0xff3030, 18, 1.3);

    const flash = new THREE.PointLight(0xff2222, 0, 7, 2);
    flash.position.copy(p.pos); this.scene.add(flash);

    const o = { s: p.mesh.scale.x, op: p.mat.opacity, li: 6 };
    new TWEEN.Tween(o).to({ s: 0.001, op: 0, li: 0 }, 240).easing(TWEEN.Easing.Cubic.In)
      .onUpdate(() => { p.mesh.scale.setScalar(o.s); p.mat.opacity = o.op; flash.intensity = o.li; })
      .onComplete(() => { this.scene.remove(p.mesh); this.scene.remove(flash); p.mat.dispose(); }).start();
  }

  clear() {
    for (const p of this.active) { this.scene.remove(p.mesh); }
    this.active = [];
  }
}
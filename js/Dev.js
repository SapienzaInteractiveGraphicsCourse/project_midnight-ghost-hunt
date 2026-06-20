// Dev.js: developer-mode visualisation. Useful for testing.

import * as THREE from 'three';
import { HALF } from './World.js';

const PLAYER_R = 0.45;

export class DevMode {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;            
    this.enabled = false;
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this.staticG = new THREE.Group();
    this.dynamicG = new THREE.Group();
    this.root.add(this.staticG, this.dynamicG);
    this._builtStatic = false;
    this._box = new THREE.Box3();
  }

  setEnabled(v) {
    this.enabled = !!v;
    this.root.visible = this.enabled;
    if (this.enabled && !this._builtStatic) this._buildStatic();
  }

  _ringMat(c) { return new THREE.MeshBasicMaterial({ color: c, wireframe: true, transparent: true, opacity: 0.8 }); }

  _buildStatic() {
    const world = this.ctx.world();
    if (!world) return;
    this._builtStatic = true;

    this.staticG.add(new THREE.AxesHelper(6));
    const grid = new THREE.GridHelper(HALF * 2, HALF, 0x40c0ff, 0x204060);
    grid.position.y = 0.02; this.staticG.add(grid);

    const bounds = new THREE.Box3(new THREE.Vector3(-HALF, 0, -HALF), new THREE.Vector3(HALF, 3.2, HALF));
    this.staticG.add(new THREE.Box3Helper(bounds, 0x46ff9f));

    const mat = this._ringMat(0xffd23f);
    for (const c of world.colliders) {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, 3, 14, 1, true), mat);
      cyl.position.set(c.x, 1.5, c.z);
      this.staticG.add(cyl);
    }

    if (world.moon?.shadow?.camera) {
      this.shadowHelper = new THREE.CameraHelper(world.moon.shadow.camera);
      this.staticG.add(this.shadowHelper);
    }
  }

  _clear(g) {
    for (let i = g.children.length - 1; i >= 0; i--) {
      const o = g.children[i];
      o.geometry?.dispose?.();
      g.remove(o);
    }
  }

  update() {
    if (!this.enabled) return;
    if (!this._builtStatic) this._buildStatic();
    this.shadowHelper?.update();

    this._clear(this.dynamicG);
    const ghosts = this.ctx.ghosts;
    const player = this.ctx.player;

    if (ghosts?.ghosts) {
      for (const g of ghosts.ghosts) {
        if (!g.alive) continue;
        this._box.setFromObject(g.group);
        const col = g.boss ? 0xff5a72 : 0x66e0ff;
        this.dynamicG.add(new THREE.Box3Helper(this._box.clone(), col));
        const ax = new THREE.AxesHelper(1.6);
        ax.position.copy(g.group.position); ax.quaternion.copy(g.group.quaternion);
        this.dynamicG.add(ax);
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(g.collisionRadius, g.collisionRadius, 0.1, 16, 1, true), this._ringMat(col));
        ring.position.copy(g.group.position);
        this.dynamicG.add(ring);
      }
    }

    if (player) {
      const p = player.position;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(PLAYER_R, PLAYER_R, 3.4, 18, 1, true), this._ringMat(0xff46d0));
      ring.position.set(p.x, 1.7, p.z); this.dynamicG.add(ring);
      const ax = new THREE.AxesHelper(2);
      ax.position.set(p.x, 0.05, p.z); ax.rotation.y = player._yaw || 0;
      this.dynamicG.add(ax);
      if (player.bodyRig?.visible) { this._box.setFromObject(player.bodyRig); this.dynamicG.add(new THREE.Box3Helper(this._box.clone(), 0xff46d0)); }
    }
  }
}

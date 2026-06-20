// Player.js: first-person controller. 

import * as THREE from 'three';
import * as TWEEN from 'tween';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { HALF } from './World.js';
import { centerAndScale, normalizeToHeight, enableShadows } from './AssetManager.js';

const EYE = 1.7;
const WALK = 2.9;
const RUN = 4.6;
const PLAYER_R = 0.45;
const DEFAULT_RANGE = 15;     
const INVINCIBLE = 3.0;

const BODY_YAW_OFFSET = Math.PI;
const BODY_BACK = 0.18;      
const BODY_COLOR = 0x6c7a99;   
const GUN_POS = new THREE.Vector3(0.32, -0.30, -0.55);
const GUN_EULER = new THREE.Euler(0.05, Math.PI, 0);
const GUN_TARGET = 0.5;

const MUZZLE_FWD = 0.7, MUZZLE_RIGHT = 0.14, MUZZLE_DOWN = 0.08;

const ARM_R_AIM = new THREE.Euler(-1, 0, 0.15);
const FOREARM_R_AIM = new THREE.Euler(-0.15, 0, 0);


const HAND_GUN_SCALE = 0.5;
const HAND_GUN_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));

const RARM_UP = new THREE.Euler(-1.35, 0.12, 0.18);
const RARM_LO = new THREE.Euler(-0.70, 0.0, 0.0);

const LOOK_DOWN_POLAR = Math.PI * 0.7;
const MIN_PITCH_X = Math.PI / 2 - LOOK_DOWN_POLAR;   

export class Player {
  constructor(camera, dom, colliders, callbacks, sound, assets, scene) {
    this.camera = camera;
    this.colliders = colliders;
    this.cb = callbacks || {};
    this.sound = sound;
    this.assets = assets;
    this.scene = scene;
    this.world = null;
    this.projectiles = null;

    this.controls = new PointerLockControls(camera, dom);
    if ('maxPolarAngle' in this.controls) this.controls.maxPolarAngle = LOOK_DOWN_POLAR;  
    this._clampE = new THREE.Euler(0, 0, 0, 'YXZ');
    this.obj = this.camera;
    this.obj.position.set(0, EYE, HALF - 4);
    this.camera.lookAt(0, EYE, 0);

    this.startLives = 3; this.startRays = 5; this.maxRays = 8;
    this.rays = this.startRays; this.lives = this.startLives;
    this.invincible = 0; this.alive = true; this.cooldown = 0;

    this.keys = {};
    this.raycaster = new THREE.Raycaster();
    this.maxRange = DEFAULT_RANGE;
    this.raycaster.far = this.maxRange;

    this._knockDir = new THREE.Vector3();
    this._knockT = 0;

    this._walkPhase = 0;
    this._walkAmt = 0;
    this._strafe = 0;

    this._buildBody();
    this._buildGun();

    setTimeout(() => this._debugBones(), 1000);

    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._yaw = 0;
  }

  get position() { return this.obj.position; }
  setWorld(w) { this.world = w; }
  setProjectiles(p) { this.projectiles = p; }

  _buildBody() {
    this.bodyRig = new THREE.Group();
    this.bones = [];
    const src = this.assets?.human || this.assets?.player;   
    if (src) {
      const { group } = normalizeToHeight(src, 1.7);
      enableShadows(group, true, true);
      group.traverse((o) => {
        if (o.isMesh) {
          o.frustumCulled = false;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => { if (m && m.color) { m.color.setHex(BODY_COLOR); m.metalness = 0; m.roughness = 1; if (m.map) m.map = null; } });
        }
      });
      this.bodyRig.add(group);
      this._collectBones(group);
      // this._equipRightHandGun(group);
    }
    this.bodyRig.visible = false;
    this.scene.add(this.bodyRig);
    this._hideBodyMeshes();

  }

  _debugBones() {
    console.log('=== DEBUG BONES ===');
    console.log('Total bones:', this.bones.length);
    for (const b of this.bones) {
      console.log(`Bone: ${b.kind}, Name: ${b.bone.name}, Rotation:`, b.bone.rotation);
    }
    console.log('Hand bone:', this.handBone ? this.handBone.name : 'NOT FOUND');
  }
  
_hideBodyMeshes() {
  console.log('Hiding ALL body meshes completely...');
  let foundCount = 0;
  
  this.bodyRig.traverse((o) => {
    if (o.isMesh) {
      console.log('Hiding mesh:', o.name || 'unnamed');
      const transparentMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0,
        depthWrite: true,
        depthTest: true,
        side: THREE.DoubleSide,
        visible: true, 
      });
      
      if (Array.isArray(o.material)) {
        o.material = o.material.map(() => transparentMat.clone());
      } else {
        o.material = transparentMat;
      }
      
      o.visible = true;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      
      if (o.userData) {
        o.userData = {};
      }
      
      foundCount++;
    }
  });
  
  console.log('Total body meshes hidden:', foundCount);
}

  _equipRightHandGun(root) {
  let upR = null, loR = null, haR = null;
  root.traverse((o) => {
    if (!o.isBone) return;
    const n = o.name.toLowerCase();
    if (!upR && n.includes('upperarmr')) upR = o;
    if (!loR && n.includes('lowerarmr')) loR = o;
    if (!haR && n.includes('handr')) haR = o;
  });
  if (upR) { upR.rotation.x += RARM_UP.x; upR.rotation.y += RARM_UP.y; upR.rotation.z += RARM_UP.z; }
  if (loR) { loR.rotation.x += RARM_LO.x; loR.rotation.y += RARM_LO.y; loR.rotation.z += RARM_LO.z; }
  void haR;
}

  _collectBones(root) {
  const want = [
    { patterns: ['thigh_l', 'thigh.l', 'thigh_l', 'upleg_l', 'leg_l'], kind: 'thighL' },
    { patterns: ['thigh_r', 'thigh.r', 'thigh_r', 'upleg_r', 'leg_r'], kind: 'thighR' },
    { patterns: ['calf_l', 'calf.l', 'calf_l', 'lowleg_l', 'shin_l'], kind: 'calfL' },
    { patterns: ['calf_r', 'calf.r', 'calf_r', 'lowleg_r', 'shin_r'], kind: 'calfR' },
    { patterns: ['arm_l', 'arm.l', 'arm_l', 'upperarm_l', 'shoulder_l', 'upperarml', 'upperarm'], kind: 'armL' },
    { patterns: ['arm_r', 'arm.r', 'arm_r', 'upperarm_r', 'shoulder_r', 'upperarmr'], kind: 'armR' },
    { patterns: ['forearm_r', 'forearm.r', 'forearm_r', 'lowerarm_r', 'elbow_r', 'lowerarmr'], kind: 'forearmR' },
    { patterns: ['hand_l', 'hand.l', 'hand_l', 'wrist_l', 'handl'], kind: 'handL' }, 
  ];
  
  root.traverse((o) => {
    if (!o.isBone) return;
    const n = o.name.toLowerCase();
    
    for (const entry of want) {
      let matched = false;
      for (const pattern of entry.patterns) {
        if (n.includes(pattern)) {
          matched = true;
          break;
        }
      }
      
      if (matched) {
        if (!this.bones.find((b) => b.kind === entry.kind)) {
          const boneEntry = { bone: o, kind: entry.kind, rest: o.rotation.clone() };
          this.bones.push(boneEntry);
          
          if (entry.kind === 'handL') {
            this.handBone = o;
            this.handRestPos = o.position.clone();
          }
        }
      }
    }
  });
  
  for (const b of this.bones) {
    console.log(`  ${b.kind}: ${b.bone.name}`);
  }
}

  _buildGun() {
    this.gun = new THREE.Group();
    if (this.assets?.raygun) {
      const vm = this.assets.raygun.clone(true);
      const { group } = centerAndScale(vm, GUN_TARGET);
      enableShadows(group, true, false);
      group.traverse((o) => {
        if (o.isMesh) {
          o.frustumCulled = false;
          if (Array.isArray(o.material)) o.material = o.material.map((m) => this._reflective(m));
          else o.material = this._reflective(o.material);
        }
      });
      this.gun.add(group);
    }
    this.gun.position.copy(GUN_POS);
    this.gun.rotation.copy(GUN_EULER);
    this.gunBaseZ = GUN_POS.z;
    this.camera.add(this.gun);
  }

  _reflective(m) {
    if (!m) return m;
    const mm = m.clone();
    if ('metalness' in mm) { mm.metalness = 0.5; mm.roughness = 0.45; mm.envMapIntensity = 1.3; }
    if (mm.emissive) mm.emissive.setHex(0x000000);
    mm.needsUpdate = true;
    return mm;
  }

  showViewmodel(v) { if (this.gun) this.gun.visible = v; }

  setDifficulty(diff) {
    if (diff === 'easy') { this.startLives = 4; this.startRays = 6; this.maxRays = 10; }
    else if (diff === 'hard') { this.startLives = 2; this.startRays = 4; this.maxRays = 7; }
    else { this.startLives = 3; this.startRays = 5; this.maxRays = 8; }
  }

  setPacific(p) {
    this.pacific = !!p;
    if (p) { this.maxRays = 50; this.startRays = 50; this.startLives = Math.max(this.startLives, 5); }
  }

  reset() {
    this.rays = this.startRays; this.lives = this.startLives;
    this.invincible = 0; this.alive = true; this._knockT = 0; this.cooldown = 0;
    this.obj.position.set(0, EYE, HALF - 4);
    this.obj.lookAt(0, EYE, 0);            
    this._yaw = 0;
    this.bodyRig.visible = true;
    this.cb.onRays?.(this.rays, this.maxRays);
    this.cb.onLives?.(this.lives);
  }

  lock() { this.controls.lock(); }
  unlock() { this.controls.unlock(); }
  get isLocked() { return this.controls.isLocked; }

  addRay(n = 1) { this.rays = Math.min(this.maxRays, this.rays + n); this.cb.onRays?.(this.rays, this.maxRays); }
  fillRays() { this.rays = this.maxRays; this.cb.onRays?.(this.rays, this.maxRays); }
  addLife(n = 1) { this.lives = Math.min(this.startLives, this.lives + n); this.cb.onLives?.(this.lives); }
  get healthFull() { return this.lives >= this.startLives; }
  setMaxRange(r) { this.maxRange = r; this.raycaster.far = r; }

  attack(ghostManager) {
    if (!this.alive) return;
    if (this.cooldown > 0) return;                  
    if (this.invincible > 0) { this.cb.onBlocked?.('Spirit-touched — ray suppressed'); return; }
    if (this.rays <= 0) { this.cb.onEmpty?.(); this.sound?.empty(); return; }

    this.cooldown = 0.5;
    this.rays--;
    this.cb.onRays?.(this.rays, this.maxRays);
    this.sound?.shoot();
    this._recoil();

    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    const camPos = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(dir, this.camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    const muzzle = camPos.clone()
      .addScaledVector(dir, MUZZLE_FWD)
      .addScaledVector(right, MUZZLE_RIGHT)
      .addScaledVector(up, -MUZZLE_DOWN);

    const range = this.maxRange;
    const blastDir = new THREE.Vector3(dir.x, 0, dir.z);
    if (blastDir.lengthSq() > 0) blastDir.normalize();
    const gHits = this.raycaster.intersectObjects(ghostManager.hitMeshes, false);
    const solids = this.world?.solidMeshes || [];
    const sHits = solids.length ? this.raycaster.intersectObjects(solids, false) : [];
    const gDist = gHits.length ? gHits[0].distance : Infinity;
    const sDist = sHits.length ? sHits[0].distance : Infinity;

    if (sHits.length && sHits[0].object.userData && sHits[0].object.userData.torchCage && sDist <= range && sDist < gDist) {
      this.world?.hitTorchCage?.(blastDir);     
    }

    let target = null, impact;
    if (gDist <= Math.min(range, sDist)) {
      target = gHits[0].object.userData.ghost || null;
      impact = gHits[0].point.clone();
    } else if (sDist <= range) {
      impact = sHits[0].point.clone();
    } else {
      impact = camPos.clone().addScaledVector(dir, range);
    }

    const to = target ? target.group.position.clone() : impact;
    this.projectiles?.spawn({
      from: muzzle, to, homingTarget: target,
      onResolve: () => {
        if (target && target.alive) {
          const died = ghostManager.damage(target, blastDir);
          if (died) {
            this.sound?.kill();
            this.addRay(target.boss ? 3 : 1);   
          }
          this.cb.onKill?.(died);
          return { hit: true, big: died };
        }
        return { hit: false };
      },
    });
  }

  aimGhost(ghostManager) {
    if (!this.alive || this.invincible > 0) return null;
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    const gHits = this.raycaster.intersectObjects(ghostManager.hitMeshes, false);
    if (!gHits.length) return null;
    const solids = this.world?.solidMeshes || [];
    const sHits = solids.length ? this.raycaster.intersectObjects(solids, false) : [];
    const sDist = sHits.length ? sHits[0].distance : Infinity;
    if (gHits[0].distance <= Math.min(this.maxRange, sDist)) return gHits[0].object.userData.ghost || null;
    return null;
  }

  _recoil() {
    const o = { z: this.gunBaseZ + 0.12 };
    this.gun.position.z = o.z;
    new TWEEN.Tween(o).to({ z: this.gunBaseZ }, 140).easing(TWEEN.Easing.Quadratic.Out)
      .onUpdate(() => { this.gun.position.z = o.z; }).start();
  }

  takeHit(ghost) {
    if (this.invincible > 0 || !this.alive) return;
    this.lives--;
    this.cb.onLives?.(this.lives);
    this.invincible = INVINCIBLE;
    this.sound?.hurt();
    this.cb.onHurt?.(ghost);
    ghost.onHitPlayer?.();          
    ghost.recoilFrom(this.obj.position);
    this._knockDir.set(this.obj.position.x - ghost.group.position.x, 0, this.obj.position.z - ghost.group.position.z);
    if (this._knockDir.lengthSq() < 0.001) this._knockDir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    this._knockDir.normalize();
    this._knockT = 0.34;
    if (this.lives <= 0) { this.alive = false; this.cb.onDead?.(); }
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.invincible > 0) this.invincible = Math.max(0, this.invincible - dt);

    const p = this.obj.position;
    if (this._knockT > 0) {
      const k = 14 * (this._knockT / 0.34);
      p.x += this._knockDir.x * k * dt;
      p.z += this._knockDir.z * k * dt;
      this._knockT = Math.max(0, this._knockT - dt);
      this._resolveCollisions(p);
      p.x = THREE.MathUtils.clamp(p.x, -HALF + 0.6, HALF - 0.6);
      p.z = THREE.MathUtils.clamp(p.z, -HALF + 0.6, HALF - 0.6);
    }

    let moving = false, running = false, strafeSign = 0, backSign = 1;
    if (this.isLocked && this.alive) {
      this._clampE.setFromQuaternion(this.camera.quaternion, 'YXZ');
      if (this._clampE.x < MIN_PITCH_X) { this._clampE.x = MIN_PITCH_X; this.camera.quaternion.setFromEuler(this._clampE); }
      running = false;   
      const speed = WALK;
      this.camera.getWorldDirection(this._fwd);
      this._yaw = Math.atan2(this._fwd.x, this._fwd.z);
      this._fwd.y = 0; this._fwd.normalize();
      this._right.crossVectors(this._fwd, this.camera.up).normalize();

      this._dir.set(0, 0, 0);
      let f = 0, r = 0;
      if (this.keys['KeyW'] || this.keys['ArrowUp']) { this._dir.add(this._fwd); f += 1; }
      if (this.keys['KeyS'] || this.keys['ArrowDown']) { this._dir.sub(this._fwd); f -= 1; }
      if (this.keys['KeyD'] || this.keys['ArrowRight']) { this._dir.add(this._right); r += 1; }
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) { this._dir.sub(this._right); r -= 1; }
      strafeSign = r;
      if (f < 0) backSign = -1;

      if (this._dir.lengthSq() > 0) {
        moving = true;
        this._dir.normalize().multiplyScalar(speed * dt);
        p.x += this._dir.x; p.z += this._dir.z;
        this._resolveCollisions(p);
        p.x = THREE.MathUtils.clamp(p.x, -HALF + 0.6, HALF - 0.6);
        p.z = THREE.MathUtils.clamp(p.z, -HALF + 0.6, HALF - 0.6);
      }
      p.y = EYE;

      this.bodyRig.visible = true;
    }

    this._animateWalk(dt, moving, running, backSign, strafeSign);
    this._syncBody();
    this._fixHandPosition();
  }

_animateWalk(dt, moving, running, backSign, strafeSign) {
  const targetAmt = moving ? (running ? 1.0 : 0.7) : 0;
  this._walkAmt += (targetAmt - this._walkAmt) * Math.min(1, dt * 8);
  const rate = running ? 9 : 6.5;
  if (moving) this._walkPhase += dt * rate * backSign;
  this._strafe += ((strafeSign * 0.12) - this._strafe) * Math.min(1, dt * 6);

  const ph = this._walkPhase;
  const amt = this._walkAmt;
  const swing = Math.sin(ph) * amt;
  const swing2 = Math.sin(ph + Math.PI) * amt;
  
  for (const b of this.bones) {
    if (b.kind === 'handL') continue;    
    const r = b.rest;
    switch (b.kind) {

      case 'armR': 
        b.bone.rotation.set(r.x, r.y, r.z, r.order); 
        break;
      case 'armL': 
        b.bone.rotation.set(r.x + ARM_R_AIM.x, r.y + ARM_R_AIM.y, r.z + ARM_R_AIM.z, r.order); 
        break;
    }
  }
}

  _syncBody() {
    if (!this.bodyRig) return;
    const yaw = this._yaw + BODY_YAW_OFFSET;
    const bx = this.obj.position.x - Math.sin(this._yaw) * BODY_BACK;
    const bz = this.obj.position.z - Math.cos(this._yaw) * BODY_BACK;
    this.bodyRig.position.set(bx, 0, bz);
    // this.bodyRig.rotation.set(0, yaw, this._strafe);
    this.bodyRig.rotation.set(0, yaw, 0);
  }

  _fixHandPosition() {
    if (!this.handBone) return;
    
    const handPos = new THREE.Vector3(-0.7, -2.15, -1.35);  
    
    const worldPos = handPos.clone().applyQuaternion(this.camera.quaternion).add(this.camera.position);    
    const localPos = this.bodyRig.worldToLocal(worldPos);
    this.handBone.position.copy(localPos);
    const gunEuler = new THREE.Euler(0.05, Math.PI, 0);
    const gunQuat = new THREE.Quaternion().setFromEuler(gunEuler);
    const worldQuat = new THREE.Quaternion().copy(this.camera.quaternion).multiply(gunQuat);
    const localQuat = new THREE.Quaternion().copy(this.bodyRig.quaternion).invert().multiply(worldQuat);
    this.handBone.quaternion.copy(localQuat);
  }

  _resolveCollisions(p) {
    for (const c of this.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + PLAYER_R;
      if (d < min && d > 0.0001) { const push = (min - d); p.x += (dx / d) * push; p.z += (dz / d) * push; }
    }
  }
}
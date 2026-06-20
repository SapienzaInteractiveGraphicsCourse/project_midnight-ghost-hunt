// Ghosts.js: spectres. Normal ghosts are wisps; 
// Mini-bosses use the imported ghost model.


import * as THREE from 'three';
import * as TWEEN from 'tween';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { HALF } from './World.js';
import { centerAndScale } from './AssetManager.js';

const CYAN = new THREE.Color(0x56e7ff);
const MAGENTA = new THREE.Color(0xff5ce0);
const RED = new THREE.Color(0xff2a3a);
const BOSS_COL = new THREE.Color(0xff4d6a);

const DETECT = 15;
const PLAYER_R = 0.45;
const BOSS_Y = 2.0;        

const _AX_X = new THREE.Vector3(1, 0, 0);
const _AX_Y = new THREE.Vector3(0, 1, 0);
const _AX_Z = new THREE.Vector3(0, 0, 1);
const _tmpV = new THREE.Vector3();
const _SHADOW_DIR = new THREE.Vector3(0.4, -0.7, 0.5).normalize();   
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _qd = new THREE.Quaternion();
const _qID = new THREE.Quaternion();

function ghostGeometry() {
  const pts = [
    [0.0, 1.05], [0.18, 1.04], [0.34, 0.98], [0.46, 0.85], [0.53, 0.68], [0.57, 0.45], [0.585, 0.22],
    [0.6, -0.05], [0.6, -0.25], [0.55, -0.45], [0.4, -0.5], [0.27, -0.44], [0.14, -0.5], [0.0, -0.46],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
  const g = new THREE.LatheGeometry(pts, 48);
  g.computeVertexNormals();
  return g;
}

const _blobTexCache = {};
function blobTexture(center) {            
  if (_blobTexCache[center]) return _blobTexCache[center];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  const mid = Math.round(center + (255 - center) * 0.4);
  grd.addColorStop(0, `rgb(${center},${center},${center})`);
  grd.addColorStop(0.5, `rgb(${mid},${mid},${mid})`);
  grd.addColorStop(1, 'rgb(255,255,255)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  _blobTexCache[center] = t;
  return t;
}
let _smokeTex = null;
function smokeTexture() {
  if (_smokeTex) return _smokeTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const x = 64 + (Math.random() * 2 - 1) * 30, y = 64 + (Math.random() * 2 - 1) * 24, r = 16 + Math.random() * 28;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  _smokeTex = new THREE.CanvasTexture(c);
  return _smokeTex;
}

function addBottomFade(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying float vWy;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWy = position.y;');
    sh.fragmentShader = 'varying float vWy;\n' + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * smoothstep(-0.5, 0.45, vWy) * smoothstep(-0.5, 0.45, vWy) );');
  };
  mat.needsUpdate = true;
}

const BOSS_HP3 = new THREE.Color(0xff8a8a);
const BOSS_HP2 = new THREE.Color(0xe23a48);
const BOSS_HP1 = new THREE.Color(0x7c1521);
function bossHpColor(hp) { return hp >= 3 ? BOSS_HP3 : (hp === 2 ? BOSS_HP2 : BOSS_HP1); }

class ThreatAlarm {
  constructor() {
    this._mounted = false; this.t = 0;
    this._v = new THREE.Vector3(); this._p = new THREE.Vector3(); this._cs = new THREE.Vector3();
    if (typeof document !== 'undefined') {
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttribute('preserveAspectRatio', 'none');
      this.svg.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:18;display:none';
    }
  }
  _mount() { if (this._mounted || typeof document === 'undefined') return; document.body.appendChild(this.svg); this._mounted = true; }
  hide() { if (this.svg) this.svg.style.display = 'none'; }
  _arc(cx, cy, R, a0, a1) {
    const sx = cx + Math.sin(a0) * R, sy = cy - Math.cos(a0) * R;
    const ex = cx + Math.sin(a1) * R, ey = cy - Math.cos(a1) * R;
    return `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  }
  update(camera, playerPos, ghosts, pacific) {
    if (!this.svg) return;
    this._mount();
    this.t += 0.05;
    camera.updateMatrixWorld();
    const f = camera.getWorldDirection(this._v); const fl = Math.hypot(f.x, f.z);
    if (fl < 1e-4) { this.hide(); return; }
    const nfx = f.x / fl, nfz = f.z / fl;
    const threats = [];
    for (const g of ghosts) {
      if (!g.alive || !g.chasing) continue;
      const gp = g.group.position;
      const dx = gp.x - playerPos.x, dz = gp.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 15) continue;                                  
      this._cs.copy(gp).applyMatrix4(camera.matrixWorldInverse);
      let onScreen = false;
      if (this._cs.z < 0) { this._p.copy(gp).project(camera); onScreen = Math.abs(this._p.x) < 0.96 && Math.abs(this._p.y) < 0.96; }
      if (onScreen) continue;                                    
      const dot = nfx * dx + nfz * dz, crs = nfx * dz - nfz * dx;
      threats.push({ theta: Math.atan2(crs, dot) - Math.PI*3/4, prox: 1 - dist / 15 });
    }
    if (!threats.length) { this.hide(); return; }
    this.svg.style.display = 'block';
    const W = window.innerWidth, H = window.innerHeight, cx = W / 2, cy = H / 2, Rm = Math.min(W, H) * 0.5;
    const pulse = 0.55 + 0.45 * Math.sin(this.t * 6);
    const span = 0.32;
    let html = '';
    for (const th of threats) {
      const prox = Math.max(0, Math.min(1, th.prox));
      for (let k = 0; k < 3; k++) {
        const R = Rm * (0.6 + k * 0.055);
        const op = (0.3 + 0.55 * prox) * pulse * (1 - k * 0.18);
        const col = `rgba(255,${Math.round(70 - 50 * prox)},${Math.round(80 - 55 * prox)},${op.toFixed(3)})`;
        const w = (6 - k) * 1.7;
        html += `<path d="${this._arc(cx, cy, R, th.theta - span + k * 0.02, th.theta + span - k * 0.02)}" fill="none" stroke="${col}" stroke-width="${w.toFixed(1)}" stroke-linecap="round"/>`;
      }
    }
    this.svg.innerHTML = html;
  }
}

class Ghost {
  constructor(scene, sharedGeo, opts = {}) {
    this.scene = scene;
    this.alive = true;
    this.boss = !!opts.boss;
    this.warm = Math.random() > 0.5;
    this.group = new THREE.Group();
    this.hitParts = [];
    this.detect = DETECT;
    this.speedMul = 1;
    this.bob = Math.random() * Math.PI * 2;
    this.pulse = Math.random() * Math.PI * 2;
    this.recoil = 0;
    this.flash = 0;
    this.painT = 0;
    this.enrage = 1;

    if (this.boss) {
      this.hp = this.maxHp = 3;
      this.collisionRadius = 1.0;
      this.speedPatrol = 1.5; this.speedChase = 4.3;
      this._buildBoss(opts.model);
    } else {
      this.hp = this.maxHp = 1;
      this.collisionRadius = 0.7;
      this.speedPatrol = 1.2 + Math.random() * 0.4;
      this.speedChase = 3.2 + Math.random() * 0.4;
      this._buildNormal(sharedGeo);
    }
    if (!this.boss) this._buildTrail(this.warm ? MAGENTA : CYAN);   
    this._buildBlobShadow();
    this.scene.add(this.group);
  }

  _buildBlobShadow() {
    this.blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(36), transparent: true, depthWrite: false, blending: THREE.MultiplyBlending });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.blobMat);
    this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.05; this.blob.renderOrder = 1;
    this.scene.add(this.blob);
    if (!this.boss) {                       
      this.trailBlobs = [];
      for (let k = 0; k < 2; k++) {
        const mat = new THREE.MeshBasicMaterial({ map: blobTexture(150), transparent: true, depthWrite: false, blending: THREE.MultiplyBlending });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.05; mesh.renderOrder = 1;
        this.scene.add(mesh);
        this.trailBlobs.push({ mesh, mat });
      }
    }
  }

  _updateBlobs() {
    const p = this.group.position;
    const d = _SHADOW_DIR;
    let ox = 0, oz = 0;
    if (d.y < -0.05) { const s = Math.min(p.y * (-1 / d.y), 4); ox = d.x * s; oz = d.z * s; }  
    if (this.blob) {
      const r = this.collisionRadius * (this.boss ? 3.0 : 2.4) * this.group.scale.x;
      this.blob.position.set(p.x + ox, 0.05, p.z + oz);
      this.blob.scale.set(r, r, r);
    }
    if (this.trailBlobs && this.trail) {
      for (let k = 0; k < this.trailBlobs.length; k++) {
        const idx = Math.floor((k + 1) / (this.trailBlobs.length + 1) * (this.trailN - 1));
        const tb = this.trailBlobs[k];
        const sc = this.collisionRadius * 1.6 * this.group.scale.x;
        tb.mesh.position.set(this.trailPos[idx * 3] + ox * 0.5, 0.05, this.trailPos[idx * 3 + 2] + oz * 0.5);
        tb.mesh.scale.set(sc, sc, sc);
      }
    }
  }

  _buildNormal(sharedGeo) {
    const baseCol = this.warm ? MAGENTA : CYAN;
    this.mat = new THREE.MeshBasicMaterial({ color: baseCol.clone(), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.body = new THREE.Mesh(sharedGeo, this.mat); this.body.userData.ghost = this;
    this.coreMat = new THREE.MeshBasicMaterial({ color: baseCol.clone(), transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false });
    this.core = new THREE.Mesh(sharedGeo, this.coreMat); this.core.scale.setScalar(0.7); this.core.userData.ghost = this;
    this.auraMat = new THREE.MeshBasicMaterial({ color: baseCol.clone(), transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
    this.aura = new THREE.Mesh(sharedGeo, this.auraMat); this.aura.scale.setScalar(1.18);
    // addBottomFade(this.mat); addBottomFade(this.coreMat); addBottomFade(this.auraMat);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x020308, transparent: true, opacity: 0.9 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), eyeMat);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), eyeMat);
    eyeL.position.set(-0.16, 0.45, 0.5); eyeR.position.set(0.16, 0.45, 0.5);
    this.group.add(this.aura, this.body, this.core, eyeL, eyeR);
    this.scaleBase = 0.9 + Math.random() * 0.4;
    this.group.scale.setScalar(this.scaleBase);
    this.hitParts = [this.body, this.core];
  }

  _buildBoss(model) {
    let m;
    if (model) {
      const clone = skeletonClone(model);   
      clone.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true; o.material.opacity = 0.92;
          if ('emissive' in o.material) { o.material.emissive = BOSS_COL.clone(); o.material.emissiveIntensity = 0.55; }
          o.castShadow = false;        
          o.frustumCulled = false;
          o.userData.ghost = this;
          this.hitParts.push(o);
        }
      });
      const { group } = centerAndScale(clone, 2.4);
      this.model = group;
      m = group;
    } else {
      this.mat = new THREE.MeshBasicMaterial({ color: BOSS_COL.clone(), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const body = new THREE.Mesh(ghostGeometry(), this.mat); body.scale.setScalar(2.0); body.userData.ghost = this;
      this.hitParts.push(body); m = body;
    }
    this.group.add(m);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 12), new THREE.MeshBasicMaterial({ color: BOSS_COL.clone(), transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(glow); this.glow = glow;
    this.bossLight = new THREE.PointLight(0xff5a72, 3, 9, 2);
    this.group.add(this.bossLight);

    this.armBones = null;
    if (this.model) {
      const byName = {};
      this.model.traverse((o) => { if (o.isBone) byName[o.name.toLowerCase()] = o; });
      const pick = (n) => { const b = byName[n]; return b ? { bone: b, q: b.quaternion.clone() } : null; };
      const upperL = pick('upperarml'), upperR = pick('upperarmr');
      if (upperL && upperR) {
        this.armBones = {
          upper: [upperL, upperR],
          lower: [pick('lowerarml'), pick('lowerarmr')].filter(Boolean),
          hand:  [pick('handl'),  pick('handr')].filter(Boolean),
        };
        this.group.updateMatrixWorld(true);
        const down = new THREE.Vector3(0, -1, 0);
        for (const a of this.armBones.upper) {
          const qw = a.bone.getWorldQuaternion(new THREE.Quaternion());
          const armDir = new THREE.Vector3(0, 1, 0).applyQuaternion(qw).normalize();
          const toDown = new THREE.Quaternion().setFromUnitVectors(armDir, down).multiply(qw);
          const parentW = a.bone.parent.getWorldQuaternion(new THREE.Quaternion());
          a.down = parentW.invert().multiply(toDown);
        }
      }
    }
    this._reach = 0;
    this.scaleBase = 1;
    this._buildBossAura();
  }

  _buildBossAura() {
    this.baseAura = new THREE.Group();
    this.baseAuraSprites = [];
    const tex = smokeTexture();
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: 0x2a1620, transparent: true, opacity: 0.90, depthWrite: false });
      const s = new THREE.Sprite(mat);
      const baseY = -1.12 - (i % 2) * 0.06;
      s.position.set((Math.random() * 2 - 1) * 0.18, baseY, (Math.random() * 2 - 1) * 0.12);
      s.scale.set(1.15, 0.8, 1);
      this.baseAura.add(s);
      this.baseAuraSprites.push({ s, mat, phase: Math.random() * Math.PI * 2, baseY });
    }
    this.group.add(this.baseAura);
  }

  _buildTrail(col) {
    this.trailN = this.boss ? 64 : 52;
    this.trailPos = new Float32Array(this.trailN * 3);
    this.trailAlpha = new Float32Array(this.trailN);
    this.trailSize = new Float32Array(this.trailN);
    const tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    tgeo.setAttribute('alpha', new THREE.BufferAttribute(this.trailAlpha, 1));
    tgeo.setAttribute('pSize', new THREE.BufferAttribute(this.trailSize, 1));
    const tmat = new THREE.PointsMaterial({ size: this.boss ? 0.7 : 0.5, color: col.clone(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    tmat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float alpha;\nattribute float pSize;\nvarying float vA;\n'
        + sh.vertexShader
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n vA=alpha;')
          .replace('gl_PointSize = size;', 'gl_PointSize = size * pSize;');
      sh.fragmentShader = 'varying float vA;\n'
        + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'float _d = length( gl_PointCoord - vec2( 0.5 ) ); vec4 diffuseColor = vec4( diffuse, opacity * vA * ( 1.0 - smoothstep( 0.2, 0.5, _d ) ) );');
    };
    this.trail = new THREE.Points(tgeo, tmat); this.trail.frustumCulled = false;
    this.scene.add(this.trail);
  }

  setZone(center, radius) {
    this.zone = center.clone(); this.zoneR = radius;
    this.group.position.set(center.x, this.boss ? BOSS_Y : 1.4, center.z);
    this.target = this._randomTarget();
    if (this.trail) for (let i = 0; i < this.trailN; i++) {
      this.trailPos[i * 3] = this.group.position.x; this.trailPos[i * 3 + 1] = this.group.position.y; this.trailPos[i * 3 + 2] = this.group.position.z;
    }
  }

  _randomTarget() {
    const a = Math.random() * Math.PI * 2, r = Math.random() * this.zoneR;
    return new THREE.Vector3(
      THREE.MathUtils.clamp(this.zone.x + Math.cos(a) * r, -HALF + 2, HALF - 2), this.boss ? BOSS_Y : 1.4,
      THREE.MathUtils.clamp(this.zone.z + Math.sin(a) * r, -HALF + 2, HALF - 2));
  }

  _roamTarget() {
    return new THREE.Vector3(
      THREE.MathUtils.clamp((Math.random() * 2 - 1) * (HALF - 2), -HALF + 2, HALF - 2), this.boss ? BOSS_Y : 1.4,
      THREE.MathUtils.clamp((Math.random() * 2 - 1) * (HALF - 2), -HALF + 2, HALF - 2));
  }

  update(dt, t, playerPos, playerInvincible, pacific) {
    if (!this.alive) return Infinity;
    if (this.painT > 0) this.painT = Math.max(0, this.painT - dt);
    const p = this.group.position;
    const baseY = this.boss ? BOSS_Y : 1.4;
    const dist = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
    const dir = new THREE.Vector3();
    let speed;

    if (this.recoil > 0) {
      this.recoil -= dt; speed = 0;
    } else if (pacific) {
      this.chasing = false;
      dir.set(this.target.x - p.x, 0, this.target.z - p.z);
      if (dir.length() < 0.8) this.target = this._roamTarget();
      dir.normalize(); speed = this.speedPatrol * 1.35 * this.speedMul;
    } else if (playerInvincible && dist < this.detect + 3) {
      dir.set(p.x - playerPos.x, 0, p.z - playerPos.z).normalize();
      speed = this.speedPatrol * this.speedMul; this.chasing = false;
    } else if (!playerInvincible && dist < this.detect) {
      dir.set(playerPos.x - p.x, 0, playerPos.z - p.z).normalize();
      speed = this.speedChase * this.speedMul; this.chasing = true;
    } else {
      this.chasing = false;
      dir.set(this.target.x - p.x, 0, this.target.z - p.z);
      if (dir.length() < 0.8) this.target = this._roamTarget();
      dir.normalize(); speed = this.speedPatrol * this.speedMul;
    }

    p.x += dir.x * speed * dt; p.z += dir.z * speed * dt;
    this._resolveObstacles(p);
    p.x = THREE.MathUtils.clamp(p.x, -HALF + 1, HALF - 1);
    p.z = THREE.MathUtils.clamp(p.z, -HALF + 1, HALF - 1);
    p.y = baseY + Math.sin(t * 2 + this.bob) * 0.28;

    if (dir.lengthSq() > 0.001) {
      const yaw = Math.atan2(dir.x, dir.z);
      this.group.rotation.y += (yaw - this.group.rotation.y) * Math.min(1, dt * 4);
    }

    this.pulse += dt * (this.chasing ? 3.2 : 1.6);
    const mix = (Math.sin(this.pulse) + 1) * 0.5;
    if (this.boss) {
      let c = bossHpColor(this.hp).clone();
      if (this.painT > 0) {
        c = new THREE.Color().setHSL((t * 2.5) % 1, 1, 0.62);
        this.group.rotation.z = Math.sin(t * 55) * 0.18 * Math.min(1, this.painT / 0.6);
      } else {
        this.group.rotation.z = 0;
        if (this.flash > 0) { this.flash -= dt; c.lerp(new THREE.Color(0xffffff), Math.min(1, this.flash * 3)); }
      }
      if (this.glow) { this.glow.material.opacity = (0.08 + mix * 0.08) * this.enrage; this.glow.material.color.copy(c); }
      if (this.bossLight) { this.bossLight.intensity = (2.6 + mix * 1.1) * this.enrage; this.bossLight.color.copy(c); }
      if (this.model) this.model.traverse((mm) => {
        if (mm.isMesh && mm.material) {
          if (mm.material.color) mm.material.color.copy(c);                
          if (mm.material.emissive) { mm.material.emissive.copy(c); mm.material.emissiveIntensity = 0.9 * this.enrage; }
        }
      });

      const target = this.chasing ? 1 : 0;
      const REACH_TIME = 1.0;
      if (this._reach < target) this._reach = Math.min(target, this._reach + dt / REACH_TIME);
      else if (this._reach > target) this._reach = Math.max(target, this._reach - dt / REACH_TIME);
      const e = this._reach * this._reach * (3 - 2 * this._reach);
      if (this.armBones) {
        const UPPER = 1.4, LOWER = 0.15, HAND = 0.4;
        const sway = Math.sin(t * 5 + this.bob) * 0.12 * e;
        const ub = this.armBones.upper;
        for (let i = 0; i < ub.length; i++) {
          const a = ub[i], side = i === 0 ? -1 : 1;
          _qc.copy(a.q).multiply(_qd.setFromAxisAngle(_AX_X, UPPER));   
          a.bone.quaternion.slerpQuaternions(a.down, _qc, e);          
          if (e > 0.001) a.bone.quaternion.multiply(_qb.setFromAxisAngle(_AX_Z, sway * side));
        }
        const setReach = (a, xang) => { a.bone.quaternion.copy(a.q); if (xang) a.bone.quaternion.multiply(_qa.setFromAxisAngle(_AX_X, xang)); };
        for (const a of this.armBones.lower) {                
          _qc.copy(a.q).multiply(_qd.setFromAxisAngle(_AX_X, LOWER));
          a.bone.quaternion.slerpQuaternions(_qID, _qc, e);
        }
        for (const a of this.armBones.hand)  setReach(a, e * HAND);
      } else if (this.model) {
        const grab = Math.sin(t * 5 + this.bob) * 0.16 * e;
        this.model.rotation.x = e * 0.5 + grab;
        this.model.position.z = e * 0.25 + Math.sin(t * 5 + this.bob) * 0.12 * e;
        this.model.position.y = Math.abs(Math.sin(t * 5 + this.bob)) * 0.15 * e;
      }

      if (!this.chasing && this.recoil <= 0) {
        this._spinT = (this._spinT || 0) + dt;
        if (!this._spinning && this._spinT > 3.5 + this.bob) { this._spinning = true; this._spinP = 0; }
        if (this._spinning && this.model) {
          this._spinP += dt / 0.9;
          const se = this._spinP < 1 ? this._spinP * this._spinP * (3 - 2 * this._spinP) : 1;
          this.model.rotation.y = se * Math.PI * 2;
          if (this._spinP >= 1) { this._spinning = false; this._spinT = 0; this.model.rotation.y = 0; }
        }
      } else {
        this._spinning = false; this._spinT = 0;
        if (this.model) this.model.rotation.y += (0 - this.model.rotation.y) * Math.min(1, dt * 6);
      }

      if (this.baseAura) {
        for (let k = 0; k < this.baseAuraSprites.length; k++) {
          const a2 = this.baseAuraSprites[k];
          const ph = t * 0.9 + a2.phase;
          a2.mat.rotation = ph * 0.3 * (k % 2 ? 1 : -1);
          const pls = 1 + Math.sin(ph * 1.5) * 0.14;
          a2.s.scale.set((1.05 + (k % 3) * 0.12) * pls, (0.72 + (k % 3) * 0.08) * pls, 1);
          a2.mat.opacity = 0.7 + Math.sin(ph * 1.8 + k) * 0.12;
          a2.s.position.y = a2.baseY + Math.sin(ph) * 0.05;
          a2.mat.color.copy(c).lerp(new THREE.Color(0x140810), 0.6);
        }
      }
    } else {
      this.group.rotation.z = Math.sin(t * 1.5 + this.bob) * 0.08;
      const c = CYAN.clone().lerp(MAGENTA, this.warm ? 1 - mix * 0.6 : mix * 0.6);
      if (this.flash > 0) { this.flash -= dt; c.lerp(RED, Math.min(1, this.flash * 3)); }
      this.mat.color.copy(c); this.coreMat.color.copy(c);
      this.mat.opacity = 0.24 + mix * 0.12 + (this.chasing ? 0.08 : 0);
      this.trail.material.color.copy(c);
    }

    if (this.trail) {
      for (let i = this.trailN - 1; i > 0; i--) {
        this.trailPos[i * 3] = this.trailPos[(i - 1) * 3];
        this.trailPos[i * 3 + 1] = this.trailPos[(i - 1) * 3 + 1];
        this.trailPos[i * 3 + 2] = this.trailPos[(i - 1) * 3 + 2];
        const f = 1 - i / this.trailN;
        this.trailAlpha[i] = Math.pow(f, 1.4) * 0.9;
        this.trailSize[i] = 0.25 + f * 1.05;
      }
      this.trailPos[0] = p.x + (Math.random() - 0.5) * 0.08;
      this.trailPos[1] = p.y - 0.28 + (Math.random() - 0.5) * 0.08;
      this.trailPos[2] = p.z + (Math.random() - 0.5) * 0.08;
      this.trailAlpha[0] = 0.95; this.trailSize[0] = 1.35;
      this.trail.geometry.attributes.position.needsUpdate = true;
      this.trail.geometry.attributes.alpha.needsUpdate = true;
      this.trail.geometry.attributes.pSize.needsUpdate = true;
    }

    this._updateBlobs();
    return dist;
  }

  _resolveObstacles(p) {
    if (!this.colliders) return;
    const pr = this.collisionRadius;
    for (const c of this.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + pr;
      if (d < min && d > 0.0001) { const push = (min - d); p.x += (dx / d) * push; p.z += (dz / d) * push; }
    }
  }

  hit() { this.flash = 0.35; this.recoil = 0.28; }
  onHitPlayer() { if (this.boss) this.hp = Math.min(this.maxHp, this.hp + 1); }

  recoilBlast(dir, tiles = 1) {
    const dist = 2.0 * tiles;
    this.recoil = Math.max(this.recoil, 0.3);
    const x = THREE.MathUtils.clamp(this.group.position.x + dir.x * dist, -HALF + 2, HALF - 2);
    const z = THREE.MathUtils.clamp(this.group.position.z + dir.z * dist, -HALF + 2, HALF - 2);
    new TWEEN.Tween(this.group.position).to({ x, z }, 260).easing(TWEEN.Easing.Cubic.Out).start();
  }

  enrageHit(dir) {
    this.painT = 0.6;
    this.flash = 0.6;
    this.enrage = Math.min(2.0, this.enrage + 0.18);
    if (dir) this.recoilBlast(dir, 5);   
    const tgt = this.scaleBase * this.enrage;
    new TWEEN.Tween(this.group.scale).to({ x: tgt, y: tgt, z: tgt }, 320).easing(TWEEN.Easing.Back.Out).start();
    if (this.model) this.model.traverse((mm) => { if (mm.isMesh && mm.material && mm.material.emissive) mm.material.emissiveIntensity = Math.min(2.4, (mm.material.emissiveIntensity || 0.8) + 0.5); });
    if (this.bossLight) this.bossLight.distance += 1.5;
  }

  recoilFrom(playerPos) {
    this.flash = 0.4; this.recoil = 0.45;
    const away = new THREE.Vector3(this.group.position.x - playerPos.x, 0, this.group.position.z - playerPos.z).normalize();
    const dest = {
      x: THREE.MathUtils.clamp(this.group.position.x + away.x * 2.2, -HALF + 2, HALF - 2),
      z: THREE.MathUtils.clamp(this.group.position.z + away.z * 2.2, -HALF + 2, HALF - 2),
    };
    new TWEEN.Tween(this.group.position).to({ x: dest.x, z: dest.z }, 320).easing(TWEEN.Easing.Cubic.Out).start();
  }

  dispose() {
    this.scene.remove(this.group);
    if (this.trail) { this.scene.remove(this.trail); this.trail.geometry.dispose(); }
    if (this.blob) { this.scene.remove(this.blob); this.blob.geometry.dispose(); this.blobMat.dispose(); }
    if (this.trailBlobs) for (const tb of this.trailBlobs) { this.scene.remove(tb.mesh); tb.mesh.geometry.dispose(); tb.mat.dispose(); }
  }
}

export class GhostManager {
  constructor(scene, effects) {
    this.scene = scene; this.effects = effects;
    this.sharedGeo = ghostGeometry();
    this.ghosts = [];
    this.colliders = null;
    this.model = null;
    this.pacific = false;
    this.alarm = new ThreatAlarm();
    this._cam = null;
    this._light = null;
  }

  setColliders(arr) { this.colliders = arr; }
  setModel(m) { this.model = m; }
  setPacific(p) { this.pacific = !!p; }

  spawn(n, opts = {}) {
    this.clear();
    const speedMul = opts.speedMul ?? 1;
    const detect = opts.detect ?? DETECT;
    const bosses = opts.bosses ?? 0;
    const playerStart = new THREE.Vector3(0, 0, HALF - 4);
    const minFromPlayer = (detect + 4);
    const chosen = [];
    const minApart = 5.5;   
    const pickCenter = () => {
      let x, z, tries = 0, best = null, bestD = -1;
      do {
        const ang = Math.random() * Math.PI * 2;
        const rad = HALF * 0.25 + Math.random() * HALF * 0.55;
        x = Math.cos(ang) * rad; z = Math.sin(ang) * rad;
        x = THREE.MathUtils.clamp(x, -HALF + 2, HALF - 2);
        z = THREE.MathUtils.clamp(z, -HALF + 2, HALF - 2);
        tries++;
        const farFromPlayer = Math.hypot(x - playerStart.x, z - playerStart.z) >= minFromPlayer;
        let nearest = Infinity;
        for (const c of chosen) nearest = Math.min(nearest, Math.hypot(x - c.x, z - c.z));
        if (farFromPlayer && nearest >= minApart) { best = { x, z }; break; }
        if (farFromPlayer && nearest > bestD) { bestD = nearest; best = { x, z }; }  
      } while (tries < 60);
      best = best || { x, z };
      chosen.push(best);
      return new THREE.Vector3(best.x, 1.4, best.z);
    };
    const make = (boss, i) => {
      const g = new Ghost(this.scene, this.sharedGeo, { boss, model: this.model });
      g.speedMul = boss ? speedMul * 1.15 : speedMul;
      g.detect = boss ? detect + 2 : detect;
      g.colliders = this.colliders;
      g.setZone(pickCenter(), HALF * 0.32);
      this.ghosts.push(g);
    };
    for (let i = 0; i < n; i++) make(false, i);
    for (let i = 0; i < bosses; i++) make(true, i + 2);
  }

  clear() { for (const g of this.ghosts) g.dispose(); this.ghosts = []; this.alarm?.hide(); }

  get hitMeshes() {
    const arr = [];
    for (const g of this.ghosts) if (g.alive) arr.push(...g.hitParts);
    return arr;
  }
  get aliveCount() { return this.ghosts.filter((g) => g.alive).length; }

  damage(ghost, blastDir) {
    if (!ghost.alive) return false;
    if (ghost.boss && ghost.painT > 0) return false;   
    ghost.hp -= 1;
    if (ghost.hp > 0) {
      if (ghost.boss) ghost.enrageHit(blastDir);
      else ghost.hit();
      this.effects.puff(ghost.group.position.clone().add(new THREE.Vector3(0, 0.2, 0)), 0x9fffb0, 24, 2.2);
      return false;
    }
    this._dissolve(ghost);
    return true;
  }

  _dissolve(ghost) {
    ghost.alive = false;
    ghost.group.visible = false;
    if (ghost.blob) ghost.blob.visible = false;
    if (ghost.trailBlobs) for (const tb of ghost.trailBlobs) tb.mesh.visible = false;
    if (ghost.trail) { ghost.trail.visible = false; }
    const col = ghost.boss ? 0xff6a80 : (ghost.mat ? ghost.mat.color.getHex() : 0x9fffb0);
    this.effects.puff(ghost.group.position.clone().add(new THREE.Vector3(0, 0.2, 0)), col, ghost.boss ? 120 : 80, ghost.boss ? 5 : 4);
  
    setTimeout(() => { ghost.dispose();}, 100);
  }

  update(dt, t, playerPos, playerInvincible) {
    if (!this._light) {
      this.scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow && !this._light) this._light = o; });
      if (!this._light) this.scene.traverse((o) => { if (o.isDirectionalLight && !this._light) this._light = o; });
    }
    if (this._light) {
      this._light.getWorldPosition(_tmpV);
      if (_tmpV.lengthSq() > 1e-6) _SHADOW_DIR.set(-_tmpV.x, -_tmpV.y, -_tmpV.z).normalize();   
    }
    let touching = null;
    for (const g of this.ghosts) {
      if (!g.alive) continue;
      const d = g.update(dt, t, playerPos, playerInvincible, this.pacific);
      if (!this.pacific && !playerInvincible && touching === null && g.recoil <= 0 && d < g.collisionRadius + PLAYER_R) touching = g;
    }
    this._separate();
    if (!this._cam) this._cam = this.scene.getObjectByProperty('isCamera', true);
    if (this._cam && !this.pacific) this.alarm.update(this._cam, playerPos, this.ghosts);
    else this.alarm?.hide();
    return touching;
  }

  _separate() {
    const a = this.ghosts.filter((g) => g.alive);
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j < a.length; j++) {
        const p1 = a[i].group.position, p2 = a[j].group.position;
        const dx = p1.x - p2.x, dz = p1.z - p2.z;
        const d = Math.hypot(dx, dz);
        const min = a[i].collisionRadius + a[j].collisionRadius;
        if (d < min && d > 0.0001) {
          const push = (min - d) / 2, nx = dx / d, nz = dz / d;
          p1.x += nx * push; p1.z += nz * push;
          p2.x -= nx * push; p2.z -= nz * push;
        }
      }
    }
  }
}
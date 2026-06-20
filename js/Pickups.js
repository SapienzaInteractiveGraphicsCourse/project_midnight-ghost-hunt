// Pickups.js: there are three power-up types, each with its own icon and colour.

import * as THREE from 'three';
import * as TWEEN from 'tween';
import { HALF } from './World.js';

const PICK_R = 1.3;
const RAY_COL = 0x66f0ff;
const FULL_COL = 0xffd23f;
const HP_COL = 0xff5a78;

const PLAYER_SPAWN = { x: 0, z: HALF - 4 };
const MIN_DIST_FROM_PLAYER = 6;
const MIN_DIST_BETWEEN = 6; 

function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.25);
  s.bezierCurveTo(0, 0.25, -0.25, 0.55, -0.5, 0.25);
  s.bezierCurveTo(-0.85, -0.1, -0.2, -0.45, 0, -0.6);
  s.bezierCurveTo(0.2, -0.45, 0.85, -0.1, 0.5, 0.25);
  s.bezierCurveTo(0.25, 0.55, 0, 0.25, 0, 0.25);
  return _extrude(s, 0.6);
}

function boltGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0.14, 0.55);
  s.lineTo(-0.22, 0.05);
  s.lineTo(0.0, 0.05);
  s.lineTo(-0.14, -0.55);
  s.lineTo(0.24, 0.02);
  s.lineTo(0.02, 0.02);
  s.closePath();
  return _extrude(s, 0.75);
}

function starGeometry(spikes = 5, outer = 0.5, inner = 0.22) {
  const s = new THREE.Shape();
  for (let i = 0; i <= spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  return _extrude(s, 0.8);
}

function _extrude(shape, scale) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, steps: 1 });
  geo.center(); geo.scale(scale, scale, scale);
  return geo;
}

const GEO = { ray: boltGeometry, full: starGeometry, hp: heartGeometry };
const COL = { ray: RAY_COL, full: FULL_COL, hp: HP_COL };

class Pickup {
  constructor(scene, type, colliders) {
    this.scene = scene;
    this.type = type;
    this.colliders = colliders || [];
    this.group = new THREE.Group();
    const col = COL[type];
    this.coreMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.3, metalness: 0.25, roughness: 0.45, envMapIntensity: 0.4 });
    const symbol = new THREE.Mesh(GEO[type](), this.coreMat);
    symbol.castShadow = true;
    const rimMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.45, envMapIntensity: 0.4 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.075, 14, 40), rimMat);
    rim.castShadow = true;
    this.core = new THREE.Group();
    this.core.add(symbol, rim);
    this.light = new THREE.PointLight(col, 6, 7, 2);
    this.group.add(this.core, this.light);
    scene.add(this.group);
    this.active = true;
    this.bob = Math.random() * Math.PI * 2;
    this.baseY = 1.1;
  }

  _blocked(x, z) {
    for (const c of this.colliders) {
      if (Math.hypot(x - c.x, z - c.z) < c.r + 1.3) return true;  
    }
    return false;
  }

  _isValidPosition(x, z, existingPositions) {
    const distFromPlayer = Math.hypot(x - PLAYER_SPAWN.x, z - PLAYER_SPAWN.z);
    if (distFromPlayer < MIN_DIST_FROM_PLAYER) return false;
    
    if (existingPositions) {
      for (const pos of existingPositions) {
        const dist = Math.hypot(x - pos.x, z - pos.z);
        if (dist < MIN_DIST_BETWEEN) return false;
      }
    }
    
    if (Math.abs(x) > HALF - 2 || Math.abs(z) > HALF - 2) return false;
    
    if (this._blocked(x, z)) return false;
    
    return true;
  }

  _findValidPosition(existingPositions, maxAttempts = 200) {
    let attempts = 0;
    while (attempts < maxAttempts) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const radius = 5 + Math.random() * (HALF - 8);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (this._isValidPosition(x, z, existingPositions)) {
        return { x, z };
      }
    }
    
    const step = 3;
    for (let x = -HALF + 3; x <= HALF - 3; x += step) {
      for (let z = -HALF + 3; z <= HALF - 3; z += step) {
        if (this._isValidPosition(x, z, existingPositions)) {
          return { x, z };
        }
      }
    }
    
    const angle = Math.random() * Math.PI * 2;
    const radius = 8 + Math.random() * (HALF - 10);
    return { 
      x: Math.cos(angle) * radius, 
      z: Math.sin(angle) * radius 
    };
  }

  place(existingPositions) {
    const pos = this._findValidPosition(existingPositions);
    this.group.position.set(pos.x, this.baseY, pos.z);
    this.group.scale.setScalar(0.01);
    this.active = true;
    new TWEEN.Tween(this.group.scale).to({ x: 1, y: 1, z: 1 }, 400).easing(TWEEN.Easing.Back.Out).start();
    return pos;
  }

  placeAt(x, z) {
    if (!this._isValidPosition(x, z, null)) {
      const pos = this._findValidPosition(null);
      x = pos.x;
      z = pos.z;
    }
    this.group.position.set(x, this.baseY, z);
    this.group.scale.setScalar(0.01);
    this.active = true;
    new TWEEN.Tween(this.group.scale).to({ x: 1, y: 1, z: 1 }, 400).easing(TWEEN.Easing.Back.Out).start();
  }

  update(dt, t) {
    if (!this.active) return;
    this.group.position.y = this.baseY + Math.sin(t * 1.6 + this.bob) * 0.22;
    this.core.rotation.y += dt * 1.8; this.core.rotation.x += dt * 0.4;
    this.light.intensity = 5 + Math.sin(t * 5 + this.bob) * 1.2;
  }

  collect(onDone) {
    this.active = false;
    const o = { s: this.group.scale.x };
    new TWEEN.Tween(o).to({ s: 0.01 }, 260).easing(TWEEN.Easing.Quadratic.In)
      .onUpdate(() => this.group.scale.setScalar(o.s))
      .onComplete(() => onDone && onDone()).start();
  }
}

export class PickupManager {
  constructor(scene, effects) { 
    this.scene = scene; 
    this.effects = effects; 
    this.pickups = []; 
    this.colliders = []; 
  }

  setColliders(arr) { 
    this.colliders = arr || []; 
    for (const p of this.pickups) p.colliders = this.colliders; 
  }

  spawn(rayCount = 5, hpCount = 2, fullCount = 1) {
    this.clear();
    
    const types = [];
    for (let i = 0; i < rayCount; i++) types.push('ray');
    for (let i = 0; i < hpCount; i++) types.push('hp');
    for (let i = 0; i < fullCount; i++) types.push('full');
    
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    
    const placedPositions = [];
    for (const type of types) {
      const p = new Pickup(this.scene, type, this.colliders);
      const pos = p.place(placedPositions);
      placedPositions.push(pos);
      this.pickups.push(p);
    }
  }

  clear() { 
    for (const p of this.pickups) {
      if (p.group) this.scene.remove(p.group);
    }
    this.pickups = []; 
  }

  update(dt, t, playerPos, api) {
    const getExistingPositions = () => {
      return this.pickups
        .filter(p => p !== this && p.active)
        .map(p => ({ x: p.group.position.x, z: p.group.position.z }));
    };

    for (const p of this.pickups) {
      p.update(dt, t);
      if (!p.active) continue;
      const d = Math.hypot(p.group.position.x - playerPos.x, p.group.position.z - playerPos.z);
      if (d >= PICK_R || !api) continue;

      if (p.type === 'hp') {
        if (api.hpFull && api.hpFull()) continue; 
        api.hpGet && api.hpGet();
      } else if (p.type === 'full') {
        api.fullGet && api.fullGet();
      } else {
        api.rayGet && api.rayGet();
      }
      this.effects.puff(p.group.position.clone(), COL[p.type], 30, 2);
      
      const pickup = p;
      p.collect(() => { 
        setTimeout(() => { 
          if (pickup) {
            const existingPositions = this.pickups
              .filter(p2 => p2 !== pickup && p2.active)
              .map(p2 => ({ x: p2.group.position.x, z: p2.group.position.z }));
            
            let found = false;
            for (let attempts = 0; attempts < 100; attempts++) {
              const angle = Math.random() * Math.PI * 2;
              const radius = 5 + Math.random() * (HALF - 8);
              const x = Math.cos(angle) * radius;
              const z = Math.sin(angle) * radius;
              
              let valid = true;
              const distFromPlayer = Math.hypot(x - PLAYER_SPAWN.x, z - PLAYER_SPAWN.z);
              if (distFromPlayer < MIN_DIST_FROM_PLAYER) valid = false;
              
              if (valid) {
                for (const pos of existingPositions) {
                  if (Math.hypot(x - pos.x, z - pos.z) < MIN_DIST_BETWEEN) {
                    valid = false;
                    break;
                  }
                }
              }
              
              if (valid && Math.abs(x) <= HALF - 2 && Math.abs(z) <= HALF - 2) {
                if (!pickup._blocked(x, z)) {
                  pickup.placeAt(x, z);
                  found = true;
                  break;
                }
              }
            }
            
            if (!found) {
              pickup.place(existingPositions);
            }
          }
        }, 6000 + Math.random() * 6000); 
      });
    }
  }
}
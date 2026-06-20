// World.js: the graveyard map surrounded by a forest. 

import * as THREE from 'three';

// important for map dimension and exported across multiple files
export const HALF = 17; 

export class World {
  constructor(scene, renderer, physics, settings, assets) {
    this.scene = scene;
    this.renderer = renderer;
    this.physics = physics;
    this.settings = settings;
    this.assets = assets;

    this.colliders = [];
    this.wisps = [];
    this.torches = [];
    this.solidMeshes = [];
    this._t = 0;
    this._flicker = 0;
    this.moonDir = new THREE.Vector3(-0.32, 0.66, -0.42).normalize();
    this._trM = new THREE.Matrix4(); this._trQ = new THREE.Quaternion(); this._trE = new THREE.Euler();

    this._buildSky();
    this._buildLights();
    this._buildStars();
    this._buildMoon();
    this._buildGround();
    this._buildTorchTree();
    this._buildSmoke();
    this._buildFence();
    this._buildLabyrinth();
    this._buildLightning();
  }

  _buildSky() {
    const c = document.createElement('canvas');
    c.width = 2048; c.height = 1024;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0.0, '#0a1124');
    grad.addColorStop(0.5, '#111d38');
    grad.addColorStop(0.78, '#1b2c4a');
    grad.addColorStop(1.0, '#243757');
    g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = tex;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
  }

  _buildLights() {
    const moon = new THREE.DirectionalLight(0xbcd2ff, 4.2);
    moon.position.copy(this.moonDir).multiplyScalar(200); 
    moon.target.position.set(0, 0, 0);
    moon.castShadow = true;
    
    const s = moon.shadow;
    s.mapSize.set(this.settings.shadow, this.settings.shadow);
    
    s.camera.near = 1;
    s.camera.far = 300; 
    const d = 25; 
    s.camera.left = -d;
    s.camera.right = d;
    s.camera.top = d;
    s.camera.bottom = -d;
    s.bias = -0.0004; s.normalBias = 0.06;
    this.scene.add(moon, moon.target);
    this.moon = moon;

    this.hemi = new THREE.HemisphereLight(0x9fb6e0, 0x3a2f22, 1.15);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x5a6a8a, 0.7);
    this.scene.add(this.ambient);

    this.fill = new THREE.DirectionalLight(0x8ca2d2, 1.9);
    this.fill.position.copy(this.moonDir).multiplyScalar(-46); this.fill.position.y = 50;
    this.scene.add(this.fill, this.fill.target);

    this.bounce = new THREE.DirectionalLight(0x7a5e3a, 0.7);
    this.bounce.position.set(0, -10, 0);
    this.bounce.target.position.set(0, 4, 0);
    this.scene.add(this.bounce, this.bounce.target);
  }

  _buildStars() {
    const R = 1500;                                   
    const N = 1500;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random(), v = Math.random() * 1.0;
      const theta = u * Math.PI * 2;
      const phi = Math.acos(1 - v);                   
      const y = Math.cos(phi);
      const s = Math.sin(phi);
      pos[i * 3] = Math.cos(theta) * s * R;
      pos[i * 3 + 1] = Math.abs(y) * R * 0.96 + 30;   
      pos[i * 3 + 2] = Math.sin(theta) * s * R;
      const b = 0.5 + Math.random() * 0.5;
      col[i * 3] = 0.86 * b; col[i * 3 + 1] = 0.9 * b; col[i * 3 + 2] = b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const gg = c.getContext('2d');
    const grd = gg.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = grd; gg.fillRect(0, 0, 32, 32);
    const dot = new THREE.CanvasTexture(c);
    const mat = new THREE.PointsMaterial({
      size: 5, map: dot, vertexColors: true, transparent: true, opacity: 0.95,
      sizeAttenuation: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.stars = new THREE.Points(geo, mat);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  _buildMoon() {
    const R = 1500;
    const pos = this.moonDir.clone().multiplyScalar(R);
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const halo = g.createRadialGradient(128, 128, 30, 128, 128, 128);
    halo.addColorStop(0, 'rgba(220,232,255,0.55)');
    halo.addColorStop(0.35, 'rgba(150,180,230,0.16)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo; g.fillRect(0, 0, 256, 256);
    const disk = g.createRadialGradient(110, 110, 8, 128, 128, 70);
    disk.addColorStop(0, '#ffffff');
    disk.addColorStop(0.7, '#eaf1ff');
    disk.addColorStop(1, '#cdd9f0');
    g.fillStyle = disk; g.beginPath(); g.arc(128, 128, 70, 0, Math.PI * 2); g.fill();
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.NormalBlending });
    const moon = new THREE.Sprite(mat);
    moon.position.copy(pos);
    moon.scale.setScalar(R * 0.35);                   
    moon.frustumCulled = false;
    this.scene.add(moon);
    this.moonMesh = moon;
  }

  _dirtTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#5a4632'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 150; i++) {                
      const x = Math.random() * 512, y = Math.random() * 512, r = 30 + Math.random() * 90;
      g.globalAlpha = 0.05 + Math.random() * 0.08;
      g.fillStyle = Math.random() > 0.5 ? '#4a3a26' : '#675139';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 11000; i++) {               
      const x = Math.random() * 512, y = Math.random() * 512, r = Math.random() * 7;
      const v = Math.random();
      g.globalAlpha = 0.05 + Math.random() * 0.13;
      g.fillStyle = v > 0.6 ? '#33271a' : (v > 0.3 ? '#6f5639' : '#473726');
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 280; i++) {                 
      const x = Math.random() * 512, y = Math.random() * 512, r = 1 + Math.random() * 2.4;
      g.globalAlpha = 0.4; g.fillStyle = '#241a11';
      g.beginPath(); g.arc(x + 0.8, y + 0.8, r, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.55 + Math.random() * 0.4;
      g.fillStyle = Math.random() > 0.5 ? '#8c785c' : '#6b5b42';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 40; i++) {                  
      g.globalAlpha = 0.1 + Math.random() * 0.1; g.strokeStyle = '#231a10'; g.lineWidth = 0.6 + Math.random();
      let x = Math.random() * 512, y = Math.random() * 512;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  _buildGround() {
    const REPEAT = 24;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6b5236,
      roughness: 0.95, metalness: 0.0, envMapIntensity: 0.08,
    });
    new THREE.TextureLoader().load('./assets/textures/muddy.png', (tex) => {
      tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;   
      tex.repeat.set(REPEAT, REPEAT);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy ? this.renderer.capabilities.getMaxAnisotropy() : 1;
      mat.map = tex; mat.bumpMap = tex; mat.bumpScale = 0.22;
      mat.color.setHex(0xffffff);
      mat.needsUpdate = true;
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;
    this.solidMeshes.push(ground);
    this.physics.addBox({ x: 160, y: 1, z: 160 }, { x: 0, y: -1, z: 0 }, null, 0, { friction: 1 });
  }

  _buildTorchTree() {
    const treeSrc = this.assets?.tree;
    const cageSrc = this.assets?.cageModel;
    if (!treeSrc && !cageSrc) return;

    const TREE_H = 6.5;
    const group = new THREE.Group();
    group.position.set(0, 0, 0);                          
    this.scene.add(group);

    if (treeSrc) {
      const root = treeSrc.clone(true);
      const kill = []; root.traverse((o) => { if (o.isLight || o.isCamera) kill.push(o); });
      kill.forEach((o) => o.parent && o.parent.remove(o));
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      root.position.set(-center.x, -box.min.y, -center.z); 
      const tg = new THREE.Group();
      tg.add(root);
      tg.scale.setScalar(TREE_H / (size.y || 1));
      group.add(tg);
      tg.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; this.solidMeshes.push(o); } });
    }
    group.updateMatrixWorld(true);
    this.torchTree = group;
    this.colliders.push({ x: 0, z: 0, r: 1.0 });          

    this.physics.addCylinder(0.5, TREE_H, { x: 0, y: TREE_H / 2, z: 0 }, undefined, 0, { friction: 0.9 });

    if (cageSrc) {
      const cage = cageSrc.clone(true);
      const kill = []; cage.traverse((o) => { if (o.isLight || o.isCamera) kill.push(o); });
      kill.forEach((o) => o.parent && o.parent.remove(o));
      cage.updateMatrixWorld(true);
      const cb = new THREE.Box3().setFromObject(cage);
      const cs = cb.getSize(new THREE.Vector3());
      const ccenter = cb.getCenter(new THREE.Vector3());
      const scale = 1.4 / (cs.y || 1);
      const hy = (cs.y * scale) / 2;                         
      const hx = (cs.x * scale) / 2, hz = (cs.z * scale) / 2;

      cage.position.set(-ccenter.x, -ccenter.y, -ccenter.z); 
      const holder = new THREE.Group();
      holder.scale.setScalar(scale);
      holder.add(cage);
      holder.rotation.y = Math.PI / 2;

      const dyn = new THREE.Group();
      dyn.add(holder);
      const PIVOT = new THREE.Vector3(-0.73, TREE_H * 0.495, -1.72); 
      dyn.position.set(PIVOT.x, PIVOT.y - hy, PIVOT.z);      
      this.scene.add(dyn);

      const body = this.physics.addBox({ x: hx, y: hy, z: hz }, dyn.position, undefined, 1.0, { mesh: dyn, friction: 0.4, restitution: 0.35 });
      body.setDamping(0.05, 0.6);
      this.physics.addPoint2Point(body, { x: 0, y: hy, z: 0 });

      cage.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.userData.torchCage = true; this.solidMeshes.push(o); } });
      this.torchCage = { body, hy, dyn, pivot: PIVOT.clone(), maxAng: 1.2, rest: 0.5 };
    }
  }

  hitTorchCage(dir) {
    const c = this.torchCage;
    if (!c || !c.body) return;
    const J = 2.6;
    const jx = (dir && dir.x ? dir.x : 0) * J + (Math.random() - 0.5) * 0.4;
    const jz = (dir && dir.z ? dir.z : 0) * J + (Math.random() - 0.5) * 0.4;
    this.physics.applyImpulse(c.body, { x: jx, y: 0, z: jz }, { x: 0, y: -c.hy, z: 0 });
  }

  updateTorchCage() {
    const c = this.torchCage;
    if (!c || !c.body) return;
    
    const p = c.dyn.position;
    const rx = p.x - c.pivot.x, ry = p.y - c.pivot.y, rz = p.z - c.pivot.z;
    const len = Math.hypot(rx, ry, rz) || 1e-6;
    const ang = Math.acos(THREE.MathUtils.clamp(-ry / len, -1, 1));
    
    const hl = Math.hypot(rx, rz) || 1e-6;
    const ox = rx / hl, oz = rz / hl;
    const v = this.physics.getLinearVelocity(c.body);
    const vOut = v.x * ox + v.z * oz;
    
    if (ang > c.maxAng) {
      if (vOut > 0) {
        const dv = -(1 + c.rest) * vOut;
        this.physics.setLinearVelocity(c.body, v.x + dv * ox, v.y * 0.5, v.z + dv * oz);
      }
      const targetR = len * Math.sin(c.maxAng);
      const scale = Math.min(0.95, targetR / hl);
      this.physics.applyImpulse(c.body,
        { x: (rx * scale - rx) * 0.5, y: 0, z: (rz * scale - rz) * 0.5 },
        { x: 0, y: 0, z: 0 }
      );
    }
    
    if (ry > 0.5) {
      this.physics.setLinearVelocity(c.body, v.x * 0.8, Math.min(v.y, 0), v.z * 0.8);
      this.physics.applyImpulse(c.body, { x: 0, y: -1.5, z: 0 }, { x: 0, y: 0, z: 0 });
    }
  }

  _smokeTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    const blobs = [
      { x: 128, y: 128, r: 108, o: 0.40 },
      { x: 92, y: 108, r: 64, o: 0.20 },
      { x: 168, y: 150, r: 70, o: 0.18 },
      { x: 108, y: 178, r: 54, o: 0.15 },
      { x: 178, y: 88, r: 64, o: 0.20 },
    ];
    for (const b of blobs) {
      const grad = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      grad.addColorStop(0, `rgba(205,218,242,${b.o})`);
      grad.addColorStop(0.4, `rgba(170,188,220,${b.o * 0.32})`);
      grad.addColorStop(0.75, `rgba(140,158,196,${b.o * 0.1})`);
      grad.addColorStop(1, 'rgba(120,140,180,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    }
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(200,215,240,${Math.random() * 0.05})`;
      g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, Math.random() * 3, 0, Math.PI * 2); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }
  
  _buildSmoke() {
    if (this.smoke) { this.scene.remove(this.smoke); }
    this.smoke = new THREE.Group();
    const tex = this._smokeTexture();
    this.smokeData = [];
    const P = this.settings.particles;

    const wa = Math.PI * 0.18;
    this.windDir = new THREE.Vector2(Math.cos(wa), Math.sin(wa));
    this.windSpeed = 0.55;
    this._fogSpan = (HALF - 1) * 2;
    this._fogScatter = new THREE.Color(0xeaf1ff);          

    const make = (x, y, z, s, opacity, color, L) => {
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity, depthWrite: false,
        color, blending: THREE.NormalBlending, fog: false, toneMapped: false,
        rotation: Math.random() * Math.PI * 2,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(x, y, z);
      sp.scale.set(s, s, 1);
      this.smoke.add(sp);
      this.smokeData.push({
        sp, x, z, y0: y, baseScale: s, base: opacity,
        baseColor: new THREE.Color(color),
        phase: Math.random() * Math.PI * 2,
        windMul: L.windMul * (0.7 + Math.random() * 0.6),
        undAmp: L.undAmp * (0.6 + Math.random() * 0.8),
        undRate: L.undRate * (0.7 + Math.random() * 0.6),
        swayAmp: L.swayAmp * (0.6 + Math.random() * 0.8),
        swayRate: 0.15 + Math.random() * 0.35,
        breathAmp: 0.12 + Math.random() * 0.14,
        breathRate: 0.25 + Math.random() * 0.4,
        spin: (Math.random() - 0.5) * 0.05,
      });
    };

    const layers = [
      { count: 90,  yLo: 0.10, yHi: 1.6, sLo: 4.0, sHi: 7.0, op: 0.13, col: 0xb3c2da, windMul: 0.45, undAmp: 0.18, undRate: 0.50, swayAmp: 1.6 },
      { count: 96,  yLo: 0.60, yHi: 2.8, sLo: 3.2, sHi: 5.5, op: 0.18, col: 0xc2cfe6, windMul: 1.00, undAmp: 0.40, undRate: 0.70, swayAmp: 2.4 },
      { count: 52,  yLo: 2.20, yHi: 4.4, sLo: 2.6, sHi: 4.2, op: 0.12, col: 0xaab7d0, windMul: 1.70, undAmp: 0.60, undRate: 0.95, swayAmp: 3.0 },
    ];

    for (const L of layers) {
      const n = Math.floor(L.count * P);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() * 2 - 1) * (HALF - 1);
        const z = (Math.random() * 2 - 1) * (HALF - 1);
        const y = L.yLo + Math.random() * (L.yHi - L.yLo);
        make(x, y, z, L.sLo + Math.random() * (L.sHi - L.sLo), L.op, L.col, L);
      }
    }

    this.scene.add(this.smoke);
  }

  _buildFence() {
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2f39, roughness: 0.22, metalness: 0.95, envMapIntensity: 1.6 });
    const postGeo = new THREE.CylinderGeometry(0.09, 0.11, 2.6, 6);
    const spikeGeo = new THREE.ConeGeometry(0.12, 0.35, 6);
    const picketGeo = new THREE.CylinderGeometry(0.045, 0.045, 2.2, 5);
    const railGeo = new THREE.BoxGeometry(1, 0.07, 0.07);

    const span = HALF * 2, perSide = Math.max(16, Math.round(span / 0.92)), step = span / perSide;   
    const N = perSide * 4 + 4;
    const posts = new THREE.InstancedMesh(postGeo, ironMat, N);
    const spikes = new THREE.InstancedMesh(spikeGeo, ironMat, N);
    posts.castShadow = spikes.castShadow = true;
    const m = new THREE.Matrix4(); let idx = 0;
    const place = (x, z) => {
      m.makeTranslation(x, 1.3, z); posts.setMatrixAt(idx, m);
      m.makeTranslation(x, 2.75, z); spikes.setMatrixAt(idx, m); idx++;
    };
    for (let i = 0; i <= perSide; i++) {
      const o = -HALF + i * step; place(o, -HALF); place(o, HALF); place(-HALF, o); place(HALF, o);
    }
    posts.count = spikes.count = idx;
    posts.instanceMatrix.needsUpdate = spikes.instanceMatrix.needsUpdate = true;
    this.scene.add(posts, spikes);
    this.solidMeshes.push(posts);

    const pickets = new THREE.InstancedMesh(picketGeo, ironMat, perSide * 4 + 4);
    pickets.castShadow = true;
    let pidx = 0;
    const picket = (x, z) => { m.makeTranslation(x, 1.1, z); pickets.setMatrixAt(pidx++, m); };
    for (let i = 0; i < perSide; i++) {
      const o = -HALF + (i + 0.5) * step;
      picket(o, -HALF); picket(o, HALF); picket(-HALF, o); picket(HALF, o);
    }
    pickets.count = pidx; pickets.instanceMatrix.needsUpdate = true;
    this.scene.add(pickets);
    this.solidMeshes.push(pickets);

    const rails = new THREE.Group();
    const yLevels = [0.5, 1.0, 1.6, 2.15];
    [-HALF, HALF].forEach((z) => yLevels.forEach((y) => {
      const r = new THREE.Mesh(railGeo, ironMat); r.scale.x = span; r.position.set(0, y, z); r.castShadow = true;
      rails.add(r); this.solidMeshes.push(r);
    }));
    [-HALF, HALF].forEach((x) => yLevels.forEach((y) => {
      const r = new THREE.Mesh(railGeo, ironMat); r.scale.x = span; r.rotation.y = Math.PI / 2; r.position.set(x, y, 0); r.castShadow = true;
      rails.add(r); this.solidMeshes.push(r);
    }));
    this.scene.add(rails);

    const t = 0.4;
    this.physics.addBox({ x: HALF + t, y: 1.5, z: t }, { x: 0, y: 1.3, z: -HALF }, null, 0);
    this.physics.addBox({ x: HALF + t, y: 1.5, z: t }, { x: 0, y: 1.3, z: HALF }, null, 0);
    this.physics.addBox({ x: t, y: 1.5, z: HALF + t }, { x: -HALF, y: 1.3, z: 0 }, null, 0);
    this.physics.addBox({ x: t, y: 1.5, z: HALF + t }, { x: HALF, y: 1.3, z: 0 }, null, 0);
  }

  _buildLabyrinth() {
    const variants = this.assets.tombVariants;
    const perVariant = variants.map(() => []);
    const torchSpots = [];
    const cell = 3.1;
    const start = { x: 0, z: HALF - 4 };
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3();
    const euler = new THREE.Euler();

    for (let gx = -HALF + 3; gx <= HALF - 3; gx += cell) {
      for (let gz = -HALF + 3; gz <= HALF - 3; gz += cell) {
        const x = gx + (Math.random() - 0.5) * 1.4;
        const z = gz + (Math.random() - 0.5) * 1.4;
        const dStart = Math.hypot(x - start.x, z - start.z);
        const dCenter = Math.hypot(x, z);
        if (dStart < 4 || dCenter < 3) continue;
        if (Math.random() > 0.46) {
          if (Math.random() < 0.06 && !this._tooClose(x, z, 0.5)) torchSpots.push({ x, z });
          continue;
        }
        if (!variants.length) continue;
        const vi = Math.floor(Math.random() * variants.length);
        const v = variants[vi];
        const targetH = 1.3 + Math.random() * 1.1;
        const s = targetH / v.height;
        const r = v.footprint * s * 0.5 + 0.3;
        if (this._tooClose(x, z, r)) continue;  
        const yaw = Math.random() * Math.PI * 2;
        const tilt = Math.random() < 0.3 ? (Math.random() - 0.5) * 0.28 : 0;
        perVariant[vi].push({ x, z, yaw, tilt, s });
        this.colliders.push({ x, z, r });
      }
    }

    this.tombMeshes = [];
    this.tombs = [];
    variants.forEach((v, vi) => {
      const list = perVariant[vi];
      if (!list.length) return;
      const inst = new THREE.InstancedMesh(v.geo, v.mat, list.length);
      inst.castShadow = true; inst.receiveShadow = true;
      list.forEach((it, i) => {
        euler.set(it.tilt, it.yaw, it.tilt * 0.6); q.setFromEuler(euler); sc.set(it.s, it.s, it.s);
        const pos = new THREE.Vector3(it.x, 0, it.z);
        m.compose(pos, q, sc); inst.setMatrixAt(i, m);
        this.tombs.push({ mesh: inst, index: i, pos, baseQuat: q.clone(), scale: sc.clone(), x: it.x, z: it.z, phase: Math.random() * Math.PI * 2, active: false });
      });
      inst.instanceMatrix.needsUpdate = true;
      this.scene.add(inst);
      this.tombMeshes.push(inst);
      this.solidMeshes.push(inst);
    });

  }

  _tooClose(x, z, r, gap = 1.65) {
    for (const c of this.colliders) {
      if (Math.hypot(x - c.x, z - c.z) < r + c.r + gap) return true;
    }
    return false;
  }

  _torch(x, z) {
    const group = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x2c1f12, roughness: 1, metalness: 0 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.0, 6), woodMat);
    pole.position.y = 1.0; pole.castShadow = true; group.add(pole);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.25, 8), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, metalness: 0.5 }));
    bowl.position.y = 2.05; group.add(bowl);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb24d, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    flame.scale.set(1, 1.7, 1); flame.position.y = 2.28; group.add(flame);
    const light = new THREE.PointLight(0xffa23c, 9, 15, 2);
    light.position.set(0, 2.3, 0); group.add(light);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.colliders.push({ x, z, r: 0.35 });
    this.torches.push({ group, light, flame, base: 9, phase: Math.random() * Math.PI * 2 });
  }
  
  _buildLightning() {
    this.lightningLight = new THREE.DirectionalLight(0x39ff14, 0);
    this.lightningLight.position.set(0, 70, 0);
    this.scene.add(this.lightningLight, this.lightningLight.target);
  }

  _makeBolt(x, z) {
    const pts = []; let cy = 34, cx = x, cz = z;
    pts.push(new THREE.Vector3(cx, cy, cz));
    while (cy > 1) {
      cy -= 2 + Math.random() * 3;
      cx += (Math.random() - 0.5) * 3.2;
      cz += (Math.random() - 0.5) * 3.2;
      pts.push(new THREE.Vector3(cx, Math.max(1, cy), cz));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0x39ff14, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
    return new THREE.Line(geo, mat);
  }

  lightning() {
    const x = (Math.random() * 2 - 1) * HALF, z = (Math.random() * 2 - 1) * HALF;
    const bolt = this._makeBolt(x, z);
    this.scene.add(bolt);
    const L = this.lightningLight;
    L.position.set(x, 70, z); L.target.position.set(x, 0, z);
    const seq = [[0, 9], [70, 0.5], [120, 7], [180, 0.5], [260, 4], [340, 0]];
    seq.forEach(([t, v]) => setTimeout(() => { L.intensity = v; }, t));
    setTimeout(() => { this.scene.remove(bolt); bolt.geometry.dispose(); bolt.material.dispose(); }, 360);
    this.flicker(1.0);
  }

  flicker(strength = 0.6) { this._flicker = Math.max(this._flicker, strength); }

  setWispCount(n) {
    for (const w of this.wisps) this.scene.remove(w.group);
    this.wisps = [];
    return;
  }

  update(dt, camPos) {
    this._t += dt;
    this.updateTorchCage();

    if (this._flicker > 0) this._flicker = Math.max(0, this._flicker - dt * 1.6);

    for (const w of this.wisps) {
      w.phase += dt * w.speed;
      w.group.position.set(w.base.x + Math.cos(w.phase) * w.radius, w.base.y + Math.sin(w.phase * 1.6) * 0.7, w.base.z + Math.sin(w.phase * 0.8) * w.radius);
      w.light.intensity = 4 + Math.sin(this._t * 7 + w.flick) * 1.2 + Math.random() * 0.8;
      w.core.material.opacity = 0.6 + Math.random() * 0.4;
    }

    for (const tr of this.torches) {
      const base = tr.base * (0.82 + Math.sin(this._t * 11 + tr.phase) * 0.12 + Math.random() * 0.08);
      const ev = this._flicker > 0 ? (1 + (Math.random() - 0.5) * this._flicker * 1.6) : 1;
      tr.light.intensity = Math.max(0.5, base * ev);
      tr.flame.scale.y = 1.5 + Math.sin(this._t * 13 + tr.phase) * 0.25 + Math.random() * 0.15;
      tr.flame.material.opacity = 0.8 + Math.random() * 0.2;
    }

    for (const s of this.smokeData) {
      const sp = s.sp;
      s.x += this.windDir.x * this.windSpeed * s.windMul * dt;
      s.z += this.windDir.y * this.windSpeed * s.windMul * dt;
      const span = this._fogSpan, lim = HALF - 1;
      if (s.x > lim) s.x -= span; else if (s.x < -lim) s.x += span;
      if (s.z > lim) s.z -= span; else if (s.z < -lim) s.z += span;
      sp.position.x = s.x + Math.sin(this._t * s.swayRate + s.phase) * s.swayAmp;
      sp.position.z = s.z + Math.cos(this._t * s.swayRate * 0.8 + s.phase) * s.swayAmp * 0.8;
      sp.position.y = s.y0 + Math.sin(this._t * s.undRate + s.phase) * s.undAmp;
      const breath = 1 + Math.sin(this._t * s.breathRate + s.phase) * s.breathAmp;
      sp.scale.set(s.baseScale * breath, s.baseScale * breath, 1);
      sp.material.rotation += dt * s.spin;
      const dxc = sp.position.x - camPos.x, dyc = sp.position.y - camPos.y, dzc = sp.position.z - camPos.z;
      const d = Math.hypot(dxc, dzc);
      const il = 1 / (Math.hypot(dxc, dyc, dzc) || 1e-6);
      const align = Math.max(0, dxc * il * this.moonDir.x + dyc * il * this.moonDir.y + dzc * il * this.moonDir.z);
      const scat = align * align * align;
      sp.material.color.copy(s.baseColor).lerp(this._fogScatter, scat * 0.8);
      const near = THREE.MathUtils.clamp((d - 1.2) / 8.0, 0, 1);
      sp.material.opacity = s.base * near * (1 + scat * 0.7);
      sp.visible = near > 0.01;
    }

    if (this.tombs) {
      const dirty = new Set();
      for (const tb of this.tombs) {
        const d = Math.hypot(tb.x - camPos.x, tb.z - camPos.z);
        const f = d < 3.4 ? 1 - d / 3.4 : 0;
        if (f <= 0 && !tb.active) continue;
        tb.active = f > 0;
        const amp = 0.075 * f;
        this._trE.set(Math.sin(this._t * 38 + tb.phase) * amp, 0, Math.cos(this._t * 33 + tb.phase) * amp);
        this._trQ.setFromEuler(this._trE).multiply(tb.baseQuat);
        this._trM.compose(tb.pos, this._trQ, tb.scale);
        tb.mesh.setMatrixAt(tb.index, this._trM);
        dirty.add(tb.mesh);
      }
      for (const mesh of dirty) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  setShadow(size) { this.moon.shadow.mapSize.set(size, size); this.moon.shadow.map?.dispose(); this.moon.shadow.map = null; }
}
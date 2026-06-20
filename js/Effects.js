// Effects.js: used for the animation of the killed ghosts

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 1.15 },
    darkness: { value: 1.25 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float offset; uniform float darkness;
    varying vec2 vUv;
    void main(){
      vec4 tex = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * offset;
      float v = clamp(1.0 - dot(uv,uv)*darkness, 0.0, 1.0);
      gl_FragColor = vec4(tex.rgb * v, tex.a);
    }`,
};

export class Effects {
  constructor(renderer, scene, camera, settings) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.settings = settings;

    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(size, settings.bloomStrength, 0.55, 0.6);
    this.bloom.enabled = settings.bloom;
    this.composer.addPass(this.bloom);

    this.vignette = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignette);

    this.composer.addPass(new OutputPass());

    this._initParticles();
  }

  setSize(w, h) { this.composer.setSize(w, h); this.bloom.setSize(w, h); }
  setBloom(on) { this.bloom.enabled = on; }
  setBloomStrength(v) { this.bloom.strength = v; }

  rebuildParticles() {
    if (this.points) { this.scene.remove(this.points); this.points.geometry.dispose(); this.points.material.dispose(); }
  }

  _initParticles() {
    const tex = this._makeSprite();

    this.MAX = Math.floor(900 * this.settings.particles);
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(this.MAX * 3);
    this.pCol = new Float32Array(this.MAX * 3);
    this.pAlpha = new Float32Array(this.MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.pAlpha, 1));
    const mat = new THREE.PointsMaterial({
      size: 0.5, map: tex, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float alpha;\nvarying float vA;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vA=alpha;');
      sh.fragmentShader = 'varying float vA;\n' +
        sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );',
          'vec4 diffuseColor = vec4( diffuse, opacity * vA );');
    };
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.parts = [];      
    this.free = [];
    for (let i = 0; i < this.MAX; i++) { this.free.push(i); this.pAlpha[i] = 0; }
  }

  _makeSprite() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  puff(pos, color = 0x56e7ff, count = 60, spread = 3.2) {
    count = Math.floor(count * this.settings.particles);
    const col = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      if (this.free.length === 0) break;
      const i = this.free.pop();
      this.pPos[i * 3] = pos.x; this.pPos[i * 3 + 1] = pos.y; this.pPos[i * 3 + 2] = pos.z;
      this.pCol[i * 3] = col.r; this.pCol[i * 3 + 1] = col.g; this.pCol[i * 3 + 2] = col.b;
      this.pAlpha[i] = 1;
      const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      const speed = (0.5 + Math.random()) * spread;
      this.parts.push({ i, vel: dir.multiplyScalar(speed), life: 0, max: 0.6 + Math.random() * 0.7 });
    }
  }

  update(dt, t) {
    for (let k = this.parts.length - 1; k >= 0; k--) {
      const p = this.parts[k];
      p.life += dt;
      const i = p.i;
      this.pPos[i * 3] += p.vel.x * dt;
      this.pPos[i * 3 + 1] += p.vel.y * dt + 0.4 * dt; 
      this.pPos[i * 3 + 2] += p.vel.z * dt;
      p.vel.multiplyScalar(0.94);
      const f = 1 - p.life / p.max;
      this.pAlpha[i] = Math.max(0, f);
      if (p.life >= p.max) { this.pAlpha[i] = 0; this.free.push(i); this.parts.splice(k, 1); }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.alpha.needsUpdate = true;
  }

  render() { this.composer.render(); }
}

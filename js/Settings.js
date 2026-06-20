// Settings.js: used to personalize the user's experience. 
// Gives the possibility to modify graphics quality and difficulty

import * as THREE from 'three';

export const defaultSettings = () => ({
  preset: 'medium',
  scale: 1.0,
  shadow: 2048,
  bloom: true,
  bloomStrength: 0.7,
  exposure: 1.3,
  ghosts: 8,
  wisps: 3,
  particles: 1.0,
  soft: true,
  sound: false,
  dev: false,
  pacific: false,
  difficulty: 'normal',
});

const PRESETS = {
  low:    { scale: 0.7,  shadow: 512,  bloom: false, particles: 0.5, wisps: 2, soft: false },
  medium: { scale: 1.0,  shadow: 2048, bloom: true,  particles: 1.0, wisps: 3, soft: true },
  high:   { scale: 1.25, shadow: 4096, bloom: true,  particles: 1.3, wisps: 5, soft: true },
};

export class SettingsUI {
  constructor(settings, ctx) {
    this.s = settings;
    this.ctx = ctx;
    this._bind();
    this._reflectToUI();
  }

  el(id) { return document.getElementById(id); }

  _bind() {
    const s = this.s;
    this.el('presetSeg')?.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        const p = b.dataset.preset;
        Object.assign(s, { preset: p }, PRESETS[p]);
        this._reflectToUI();
        this._applyAll(true);
      });
    });

    const onCheck = (id, key, apply) => {
      const e = this.el(id); if (!e) return;
      e.addEventListener('change', () => { s[key] = e.checked; apply && apply(); });
    };
    onCheck('setSound', 'sound', () => this.ctx.sound?.setEnabled(s.sound));
    onCheck('setDev', 'dev', () => this.ctx.setDev?.(s.dev));
  }

  _reflectToUI() {
    const s = this.s;
    if (this.el('setSound')) this.el('setSound').checked = s.sound;
    if (this.el('setDev')) this.el('setDev').checked = s.dev;
    this.el('presetSeg')?.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.preset === s.preset));
  }

  _applyRenderer() {
    const r = this.ctx.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.0) * this.s.scale);
    r.shadowMap.type = this.s.soft ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
    r.shadowMap.needsUpdate = true;
    r.toneMappingExposure = this.s.exposure;
    this.ctx.onResize?.();
  }

  _applyAll(rebuild) {
    this._applyRenderer();
    this.ctx.getWorld()?.setShadow(this.s.shadow);
    this.ctx.getEffects()?.setBloom(this.s.bloom);
    this.ctx.getEffects()?.setBloomStrength(this.s.bloomStrength);
    this.ctx.sound?.setEnabled(this.s.sound);
    if (rebuild) { this.ctx.rebuildEffects?.(); this.ctx.getWorld()?.setWispCount(this.s.wisps); }
  }
}
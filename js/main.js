// main.js: used to boot the entire game

import * as THREE from 'three';
import * as TWEEN from 'tween';
import { Physics } from './Physics.js';
import { World } from './World.js';
import { Effects } from './Effects.js';
import { GhostManager } from './Ghosts.js';
import { PickupManager } from './Pickups.js';
import { Player } from './Player.js';
import { ProjectileManager } from './ProjectileManager.js';
import { Sound } from './Sound.js';
import { defaultSettings, SettingsUI } from './Settings.js';
import { loadAssets } from './AssetManager.js';
import { DevMode } from './Dev.js';

const $ = (id) => document.getElementById(id);

const settings = defaultSettings();
settings.pacific = false;
const sound = new Sound();

const DIFF = {
  easy:   { ghosts: 5,  bosses: 1, speedMul: 0.85, detect: 8,  ray: 6, hp: 3, full: 1 },
  normal: { ghosts: 8,  bosses: 1, speedMul: 1.0,  detect: 9,  ray: 5, hp: 2, full: 1 },
  hard:   { ghosts: 11, bosses: 2, speedMul: 1.2,  detect: 10, ray: 4, hp: 2, full: 1 },
};

let renderer, scene, camera, physics, world, effects, ghosts, pickups, player, projectiles, dev, settingsUI;
let assets = null;
let AmmoLib = null;
let state = 'menu'; 
let clearing = false;
const clock = new THREE.Clock();
let lightningTimer = 0;

boot();

async function boot() {
  $('start').classList.add('hidden');
  $('loading').classList.remove('hidden');
  try {
    if (typeof Ammo === 'undefined') throw new Error('Ammo not present');
    AmmoLib = (typeof Ammo === 'function') ? await Ammo() : Ammo;
    if (!AmmoLib || !AmmoLib.btVector3) throw new Error('Ammo runtime missing classes');
  } catch (e) {
    $('loadingText').textContent = 'Could not load the physics engine (Ammo.js). Check your network/CDN access, then reload.';
    console.error(e); return;
  }

  try {
    assets = await loadAssets((msg) => { $('loadingText').textContent = msg; });
  } catch (e) {
    $('loadingText').textContent = 'Could not load the 3D models. Make sure the "assets/" folder sits next to index.html and you are running a local server.';
    console.error(e); return;
  }

  buildRenderer();
  buildScene();

  settingsUI = new SettingsUI(settings, {
    renderer,
    getWorld: () => world,
    getEffects: () => effects,
    getGhosts: () => ghosts,
    sound,
    rebuildEffects: () => effects?.rebuildParticles(),
    respawnGhosts: () => respawnGhosts(),
    setDev: (v) => dev?.setEnabled(v),
    onResize,
  });

  wireUI();
  $('loading').classList.add('hidden');
  $('start').classList.remove('hidden');

  clock.start();
  renderer.setAnimationLoop(loop);
}

function buildRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5) * settings.scale);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = settings.soft ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = settings.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

function buildScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2000);

  physics = new Physics(AmmoLib);
  world = new World(scene, renderer, physics, settings, assets);
  effects = new Effects(renderer, scene, camera, settings);
  ghosts = new GhostManager(scene, effects);
  ghosts.setColliders(world.colliders);
  ghosts.setModel(assets.ghostModel);
  pickups = new PickupManager(scene, effects);
  projectiles = new ProjectileManager(scene, assets.fireball, effects);

  player = new Player(camera, renderer.domElement, world.colliders, {
    onRays: updateRaysHUD,
    onLives: updateLivesHUD,
    onKill: onGhostKilled,
    onEmpty: () => { flashCrosshair('empty'); banner('No charge — find a mote', true); },
    onBlocked: (msg) => banner(msg, true),
    onHurt: onPlayerHurt,
    onDead: onPlayerDead,
    onShootFx: () => flashCrosshair('fire'),
  }, sound, assets, scene);
  player.setWorld(world);
  player.setProjectiles(projectiles);

  dev = new DevMode(scene, { world: () => world, ghosts, player });

  scene.add(camera);
  player.showViewmodel(false); 

  camera.position.set(0, 2.2, 18);
  camera.lookAt(0, 2, 0);

  updateLivesHUD(player.lives);
  updateRaysHUD(player.rays, player.maxRays);
}

function wireUI() {
  $('beginBtn').addEventListener('click', startGame);
  $('restartBtn').addEventListener('click', startGame);
  $('resumeBtn').addEventListener('click', () => player.lock());

  $('rulesBtn').addEventListener('click', () => $('rules').classList.remove('hidden'));
  document.querySelector('.close-rules').addEventListener('click', () => $('rules').classList.add('hidden'));
  $('gameplayBtn').addEventListener('click', () => $('gameplay').classList.remove('hidden'));
  document.querySelector('.close-gameplay').addEventListener('click', () => $('gameplay').classList.add('hidden'));
  $('gfxBtn').addEventListener('click', () => $('settings').classList.remove('hidden'));

  $('diffSeg').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      settings.difficulty = b.dataset.diff;
      $('diffSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    });
  });

  const pacSeg = $('pacSeg');
  if (pacSeg) pacSeg.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      settings.pacific = b.dataset.pac === 'on';
      pacSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    });
  });

  $('openSettings').addEventListener('click', () => { if (state === 'playing') { state = 'paused'; player.unlock(); } $('settings').classList.remove('hidden'); });
  $('closeSettings').addEventListener('click', () => { $('settings').classList.add('hidden'); if (state === 'paused') $('pause').classList.remove('hidden'); });
  $('pauseSettingsBtn').addEventListener('click', () => { $('pause').classList.add('hidden'); $('settings').classList.remove('hidden'); });

  $('quitBtn').addEventListener('click', quitToMenu);
  $('overQuitBtn').addEventListener('click', quitToMenu);

  window.addEventListener('resize', onResize);

  player.controls.addEventListener('lock', () => {
    if (state === 'over') return;
    state = 'playing';
    $('start').classList.add('hidden'); $('pause').classList.add('hidden');
    $('hud').classList.remove('hidden'); $('crosshair').classList.remove('hidden');
  });
  player.controls.addEventListener('unlock', () => {
    if (state === 'over' || state === 'menu') return;
    if (!$('settings').classList.contains('hidden')) return;
    state = 'paused';
    $('pause').classList.remove('hidden');
  });

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (state === 'playing' && player.isLocked && e.button === 0) player.attack(ghosts);
  });
}

function curDiff() { return DIFF[settings.difficulty] || DIFF.normal; }

function respawnGhosts() {
  const d = curDiff();
  ghosts.spawn(settings.ghosts, { speedMul: d.speedMul, detect: d.detect, bosses: d.bosses });
  updateGhostHUD();
}

function startGame() {
  $('start').classList.add('hidden'); $('gameover').classList.add('hidden');
  $('pause').classList.add('hidden'); $('rules').classList.add('hidden'); $('gameplay').classList.add('hidden');
  state = 'playing';
  clearing = false;

  ghosts.clear();
  pickups.clear();
  projectiles.clear();
  
  if (effects) {
    effects.parts = [];
    effects.free = [];
    for (let i = 0; i < effects.MAX; i++) {
      effects.free.push(i);
      effects.pAlpha[i] = 0;
    }
  }

  const d = curDiff();
  settings.ghosts = d.ghosts;
  const gEl = $('setGhosts'), gOut = $('outGhosts');
  if (gEl) gEl.value = d.ghosts; if (gOut) gOut.textContent = String(d.ghosts);

  player.setDifficulty(settings.difficulty);
  player.setPacific(settings.pacific);
  player.setMaxRange(d.detect);
  player.reset();
  player.showViewmodel(true);
  projectiles.clear();
  ghosts.setPacific(settings.pacific);
  ghosts.spawn(d.ghosts, { speedMul: d.speedMul, detect: d.detect, bosses: d.bosses });
  pickups.setColliders(world.colliders);
  pickups.spawn(d.ray, d.hp, d.full);
  document.querySelector('#app').classList.remove('hurt');
  updateGhostHUD();
  player.lock();
  banner(settings.pacific ? 'Pacific mode — spirits will not harm you' : 'The grounds are restless…');
  setTimeout(() => clearBanner(), 2600);
}

function quitToMenu() {
  state = 'menu';
  player.unlock();
  player.showViewmodel(false);
  player.bodyRig.visible = false;
  ghosts.clear();
  pickups.clear();
  projectiles.clear();
  $('pause').classList.add('hidden'); $('gameover').classList.add('hidden');
  $('settings').classList.add('hidden'); $('hud').classList.add('hidden'); $('crosshair').classList.add('hidden');
  $('start').classList.remove('hidden');
  camera.position.set(0, 2.2, 18); camera.lookAt(0, 2, 0);
}

function updateLivesHUD(lives) {
  const box = $('lives'); box.innerHTML = '';
  const total = Math.max(3, player ? player.startLives : 3);
  for (let i = 0; i < total; i++) {
    const h = document.createElement('div');
    h.className = 'heart' + (i >= lives ? ' lost' : '');
    box.appendChild(h);
  }
}
function updateRaysHUD(rays, max) {
  const box = $('rays'); box.innerHTML = '';
  for (let i = 0; i < max; i++) {
    const p = document.createElement('div');
    p.className = 'pip' + (i >= rays ? ' spent' : '');
    box.appendChild(p);
  }
  $('crosshair').classList.toggle('empty', rays <= 0);
}
function updateGhostHUD() { $('ghostCount').textContent = ghosts.aliveCount; }

function flashCrosshair(cls) { const c = $('crosshair'); c.classList.add(cls); setTimeout(() => c.classList.remove(cls), 120); }
let bannerTimer = null;
function banner(text, bad = false) {
  const b = $('banner'); b.textContent = text; b.classList.toggle('bad', bad); b.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => clearBanner(), 1800);
}
function clearBanner() { $('banner').classList.remove('show'); }

function onGhostKilled(died) {
  updateGhostHUD();
  if (died) {
    world.flicker(0.6);
    if (ghosts.aliveCount === 0 && !clearing) {
      clearing = true;
      banner('The last spirit fades…');
      setTimeout(() => { if (state === 'playing') onCleared(); }, 1500);   
    }
  }
}
function onPlayerHurt() {
  const app = document.querySelector('#app');
  app.classList.remove('hurt'); void app.offsetWidth; app.classList.add('hurt');
  world.flicker(0.8);
  banner('A spectre claimed a fragment of your soul', true);
  const bar = $('invincibleBar'); bar.classList.remove('hidden');
  const span = bar.querySelector('span'); span.style.animation = 'none'; void bar.offsetWidth; span.style.animation = 'drain 3s linear forwards';
  setTimeout(() => bar.classList.add('hidden'), 3000);
}
function onPlayerDead() {
  state = 'over'; player.unlock(); player.showViewmodel(false);
  if (player.bodyRig) player.bodyRig.visible = false;
  $('overTitle').textContent = 'CONSUMED';
  $('overText').textContent = 'The dark took what remained of you. The moor falls silent.';
  $('gameover').classList.remove('hidden'); $('hud').classList.add('hidden'); $('crosshair').classList.add('hidden');
}
function onCleared() {
  state = 'over'; player.unlock(); player.showViewmodel(false);
  $('overTitle').textContent = 'CLEANSED';
  $('overText').textContent = 'Every restless spirit is laid to rest. The moon shines a little brighter.';
  $('gameover').classList.remove('hidden'); $('hud').classList.add('hidden'); $('crosshair').classList.add('hidden');
}

function doLightning() {
  world.lightning();
  const f = $('flash'); f.classList.remove('bolt'); void f.offsetWidth; f.classList.add('bolt');
  sound.thunder();
}

let fpsAcc = 0, fpsFrames = 0;
function loop() {
  let dt = clock.getDelta(); dt = Math.min(dt, 0.05);
  const t = clock.elapsedTime; const now = performance.now();
  const active = state === 'playing' && player.isLocked;

  TWEEN.update(now);   

  if (active) {
    physics.step(dt);

    const camPos = camera.getWorldPosition(new THREE.Vector3());
    world.update(dt, camPos, ghosts);
    effects.update(dt, t);
    projectiles.update(dt);

    lightningTimer += dt;
    if (lightningTimer >= 30) { lightningTimer = 0; doLightning(); }

    const pInv = player.invincible > 0;
    player.update(dt);
    const cdEl = $('crosshair');
    const cd = player.cooldown || 0;
    cdEl.style.setProperty('--cd', (1 - cd / 0.5).toFixed(3));   
    cdEl.classList.toggle('cooling', cd > 0.001);
    cdEl.classList.toggle('aim', !!player.aimGhost(ghosts));
    const touching = ghosts.update(dt, t, player.position, pInv);
    if (touching) player.takeHit(touching);
    updateGhostHUD();

    pickups.update(dt, t, player.position, {
      rayGet: () => { player.addRay(1); sound.pickup(); banner('+1 ray charge'); },
      fullGet: () => { player.fillRays(); sound.pickup(); banner('Ray fully recharged'); },
      hpGet: () => { player.addLife(1); sound.pickup(); banner('+1 soul fragment'); },
      hpFull: () => player.healthFull,
    });
  }

  dev?.update();
  effects.render();

  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.5) { $('fps').textContent = Math.round(fpsFrames / fpsAcc); $('draws').textContent = renderer.info.render.calls; fpsAcc = 0; fpsFrames = 0; }
}

function onResize() {
  if (!renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5) * settings.scale);
  renderer.setSize(window.innerWidth, window.innerHeight);
  effects.setSize(window.innerWidth, window.innerHeight);
}
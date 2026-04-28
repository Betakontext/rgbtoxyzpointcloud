/*
# For further developments and participations
# visit and fork: https://github.com/betakontext/rgbtoxyzpointcloud
# Copyright (c) 2026 Christoph Medicus
# Licensed under the MIT License

=====================================================================
  rgbtoxyzpointcloud / 3D‑Pixel‑Point‑Cloud – Main Script
=====================================================================*/

////////////////////////////////////////////////////////////
// 1️⃣ Constants & global state
////////////////////////////////////////////////////////////
const CACHE_NAME          = 'pointcloud-cache';
const BIN_KEY_PREFIX      = '/pointcloud_';
const META_KEY_PREFIX     = '/pointcloud_meta_';
const LOCAL_STORAGE_KEY   = 'pointcloudJsonBackup';
const LAST_IMAGE_KEY      = 'pc_last_image_dataurl';

const APP_VERSION         = '2025-12-06-01';               // changes with every build
const STORAGE_VERSION_KEY = 'pc_storage_version';

// default: 0 = original size, otherwise longest side → maxDimension
const pcConfig = { maxDimension: 0 };

let currentProcessToken = 0;   // image-processing token
let transformToken      = 0;   // XYZ-/RGB-animation token
let isAnimatingTransform = false;
let isXYZMode           = false;   // current mode (RGB = false, XYZ = true)

////////////////////////////////////////////////////////////
// 2️⃣ Helper / utility functions
////////////////////////////////////////////////////////////
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/*--- Cache version check -------------------------------------------------
    On the first load after a build, the entire cache + storage
    is cleared so no old image from a previous build is shown. */
async function ensureFreshStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_VERSION_KEY);
    if (stored !== APP_VERSION) {
      await clearCacheAndStorage();
      localStorage.setItem(STORAGE_VERSION_KEY, APP_VERSION);
      console.log('[PC] Storage cleared – new app version');
    }
  } catch (e) {
    console.warn('[PC] ensureFreshStorage failed', e);
  }
}

/*--- UI helpers ----------------------------------------------------------*/
function setXYZButtonState() {
  const btn = document.getElementById('pc-xyz-transform');
  if (!btn) return;
  if (isXYZMode) {
    btn.textContent = 'RGB pointcloud';
    btn.style.background = '#FF9800';
  } else {
    btn.textContent = 'XYZ pointcloud';
    btn.style.background = '#4CAF00';
  }
}
function setXYZButtonEnabled(enabled) {
  const btn = document.getElementById('pc-xyz-transform');
  if (btn) btn.disabled = !enabled;
}
function cancelActiveTransform() {
  // increase the token → running animation loops terminate themselves
  transformToken++;
  isAnimatingTransform = false;
  const ent = document.getElementById('current-pointcloud');
  if (ent) ent.removeAttribute('animation__rotate');
}

/*--- Cache key helpers ---------------------------------------------------*/
function getKeysFor(maxDim) {
  const dim = typeof maxDim === 'number' ? maxDim : pcConfig.maxDimension;
  return {
    binKey:  `${BIN_KEY_PREFIX}${dim}.bin`,
    metaKey: `${META_KEY_PREFIX}${dim}.json`
  };
}

/*--- Pixel packing -------------------------------------------------------*/
function packPixels(imageData) {
  const { width, height, data } = imageData;   // data = RGBA Uint8ClampedArray
  const out = new Uint8Array(width * height * 3);
  let p = 0;
  for (let i = 0; i < data.length; i += 4) {
    out[p++] = data[i];       // R
    out[p++] = data[i + 1];   // G
    out[p++] = data[i + 2];   // B
  }
  return out;
}

/*--- Cache I/O -----------------------------------------------------------*/
async function storeBinaryToCache(pixels, w, h, maxDim) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = getKeysFor(maxDim);
    const meta = { width: w, height: h, format: 'rgb8' };
    await cache.put(keys.metaKey, new Response(JSON.stringify(meta), {
      headers: { 'Content-Type': 'application/json' }
    }));
    await cache.put(keys.binKey, new Response(pixels.buffer, {
      headers: { 'Content-Type': 'application/octet-stream' }
    }));

    // small backup option for very small images (optional)
    const maxBackup = 200_000; // pixel count
    if (w * h <= maxBackup) {
      const str = JSON.stringify({ width: w, height: h, pixels: Array.from(pixels) });
      localStorage.setItem(LOCAL_STORAGE_KEY, LZString.compressToUTF16(str));
    }
    return true;
  } catch (e) {
    console.error('[PC] storeBinaryToCache failed', e);
    return false;
  }
}


async function readBinaryFromCache(maxDim) {
  const keys = getKeysFor(maxDim);
  if ('caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const metaResp = await cache.match(keys.metaKey);
      const binResp = await cache.match(keys.binKey);
      if (metaResp && binResp) {
        const meta = await metaResp.json();
        const ab = await binResp.arrayBuffer();
        const pix = new Uint8Array(ab);
        if (pix.length !== meta.width * meta.height * 3) {
          console.warn('[PC] pixelsize mismatch');
          return null;
        }
        return { width: meta.width, height: meta.height, pixels: pix };
      }
    } catch (e) {
      console.warn('[PC] Cache read error, falling back to localStorage', e);
    }
  }

  // Fallback: localStorage backup (as before)
  try {
    const comp = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (comp) {
      const obj = JSON.parse(LZString.decompressFromUTF16(comp));
      return { width: obj.width, height: obj.height, pixels: new Uint8Array(obj.pixels) };
    }
  } catch (e) {
    console.warn('[PC] localStorage restore error', e);
  }
  return null;
}

async function clearCacheAndStorage() {
  try {
    if ('caches' in window) {
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      for (const req of keys) {
        const url = req.url || '';
        if (url.includes(BIN_KEY_PREFIX) || url.includes(META_KEY_PREFIX)) {
          await cache.delete(req);
        }
      }
    }
  } catch (e) {
    console.warn('[PC] clearCache failed', e);
  }
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    sessionStorage.removeItem(LAST_IMAGE_KEY);
    localStorage.removeItem(LAST_IMAGE_KEY);
  } catch (e) {
    console.warn('[PC] clear storage failed', e);
  }
}

/*--- A‑Frame component ---------------------------------------------------*/
AFRAME.registerComponent('point-cloud', {
  schema: { size: { default: 0.02 } },
  update(old) {
    if (old.size !== this.data.size) {
      const obj = this.el.getObject3D('mesh');
      if (obj && obj.material) obj.material.size = this.data.size;
    }
  },
  remove() {
    const obj = this.el.getObject3D('mesh');
    if (obj) {
      obj.geometry?.dispose();
      obj.material?.dispose();
      this.el.removeObject3D('mesh');
    }
  }
});

////////////////////////////////////////////////////////////
// 3️⃣ Geometry fit and render helpers
////////////////////////////////////////////////////////////
function fitPointCloudToView(entity, padding = 1.1) {
  const camEl = document.getElementById('main-camera');
  if (!camEl) return;
  const camObj = camEl.getObject3D('camera');
  if (!camObj) return;
  const mesh = entity.getObject3D('mesh');
  if (!mesh) return;

  const geom = mesh.geometry;
  if (!geom.boundingSphere) geom.computeBoundingSphere();
  const r = Math.max(geom.boundingSphere?.radius || 1, 0.0001);

  const fovV   = THREE.MathUtils.degToRad(camObj.fov || 60);
  const aspect = camObj.aspect || (window.innerWidth / Math.max(1, window.innerHeight));
  const fovH   = 2 * Math.atan(Math.tan(fovV / 2) * aspect);

  const distV = r / Math.tan(fovV / 2);
  const distH = r / Math.tan(fovH / 2);
  const dist  = Math.max(distV, distH) * padding;

  const camY = camEl.object3D.position.y || 0;
  entity.object3D.position.set(0, camY, -dist);
  entity.object3D.updateMatrixWorld(true);
}

/*=====================================================================
  renderPointCloudFromBytes – render a new image
=====================================================================*/
function renderPointCloudFromBytes(w, h, pixels, { maxPoints = 300_000 } = {}) {
  const scene = document.querySelector('a-scene');
  if (!scene) {
    console.error('[PC] no A‑Frame scene');
    return;
  }

  // --------------------------------------------------------------
  // 1️⃣ Get or create entity
  // --------------------------------------------------------------
  let entity = document.getElementById('current-pointcloud');
  if (!entity) {
    entity = document.createElement('a-entity');
    entity.id = 'current-pointcloud';
    entity.setAttribute('point-cloud', { size: 0.02 });
    scene.appendChild(entity);
  }

  // --------------------------------------------------------------
  // 2️⃣ Dispose old GPU resources & remove rotation
  // --------------------------------------------------------------
  disposePointCloudEntity(entity);               // free old geometry/material
  entity.removeAttribute('animation__rotate');   // stop ongoing rotation animation

  // IMPORTANT: Reset rotation matrix, otherwise the old rotation
  // angle remains. Afterwards, position will be recomputed by
  // fitPointCloudToView.
  entity.object3D.rotation.set(0, 0, 0);         // <-- reset to identity
  // (optional) also reset position so fit… doesn't rely on a
  // previously shifted starting position:
  // entity.object3D.position.set(0, 0, 0);

  // --------------------------------------------------------------
  // 3️⃣ Decimation (Quest‑friendly)
  // --------------------------------------------------------------
  const total   = w * h;
  const stride  = Math.max(1, Math.ceil(Math.sqrt(total / maxPoints)));
  const outW    = Math.ceil(w / stride);
  const outH    = Math.ceil(h / stride);
  const count   = outW * outH;
  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);
  const scale = 5;
  let k = 0;

  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const idx = (y * w + x) * 3;
      positions[k]     = (x / w - 0.5) * scale;
      positions[k + 1] = -(y / h - 0.5) * scale * (h / w);
      positions[k + 2] = 0;
      colors[k]     = pixels[idx] / 255;
      colors[k + 1] = pixels[idx + 1] / 255;
      colors[k + 2] = pixels[idx + 2] / 255;
      k += 3;
    }
  }

  // --------------------------------------------------------------
  // 4️⃣ Build BufferGeometry
  // --------------------------------------------------------------
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
  geometry.userData.gridW = outW;
  geometry.userData.gridH = outH;
  geometry.computeBoundingSphere();

  const size = parseFloat(entity.getAttribute('point-cloud')?.size) || 0.02;
  const material = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    sizeAttenuation: true
  });
  const points = new THREE.Points(geometry, material);
  entity.setObject3D('mesh', points);

  // --------------------------------------------------------------
  // 5️⃣ Fit to view – always after render!
  // --------------------------------------------------------------
  fitPointCloudToView(entity, 1.1);   // 10% padding, centered in front of camera
}

/*--- Entity dispose ------------------------------------------------------*/
function disposePointCloudEntity(entity) {
  const obj = entity?.getObject3D('mesh');
  if (obj) {
    obj.geometry?.dispose();
    obj.material?.dispose();
    entity.removeObject3D('mesh');
  }
}

/*--- Image loading -------------------------------------------------------*/
async function loadImageBitmap(url, maxDim) {
  const wantResize = typeof maxDim === 'number' && maxDim > 0;
  if (url.startsWith('data:')) {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.crossOrigin = 'Anonymous';
      i.src = url;
      i.onload = () => res(i);
      i.onerror = rej;
    });
    if (wantResize && (img.width > maxDim || img.height > maxDim)) {
      const scale = maxDim / Math.max(img.width, img.height);
      const rw = Math.max(1, Math.floor(img.width * scale));
      const rh = Math.max(1, Math.floor(img.height * scale));
      return await createImageBitmap(img, { resizeWidth: rw, resizeHeight: rh, resizeQuality: 'medium' });
    }
    return await createImageBitmap(img);
  }

  const resp = await fetch(url, { mode: 'cors' });
  const blob = await resp.blob();
  const bmp = await createImageBitmap(blob);
  if (wantResize && (bmp.width > maxDim || bmp.height > maxDim)) {
    const scale = maxDim / Math.max(bmp.width, bmp.height);
    const rw = Math.max(1, Math.floor(bmp.width * scale));
    const rh = Math.max(1, Math.floor(bmp.height * scale));
    const resized = await createImageBitmap(bmp, { resizeWidth: rw, resizeHeight: rh, resizeQuality: 'medium' });
    bmp.close();
    return resized;
  }
  return bmp;
}

/* --------------------------------------------------------------
   Image → Canvas → ImageData → RGB bytes
   -------------------------------------------------------------- */
async function processImage(imageUrl, options = {}) {
  const token = ++currentProcessToken; // cancel token
  const maxDim = typeof options.maxDimension === 'number'
                 ? options.maxDimension
                 : pcConfig.maxDimension;   // ← new line

  try {
    // 1️⃣ Get bitmap (including optional downscale)
    const bitmap = await loadImageBitmap(imageUrl, maxDim);
    if (token !== currentProcessToken) { bitmap?.close?.(); return; }

    const w = bitmap.width, h = bitmap.height;

    // 2️⃣ Canvas → ImageData → RGB bytes (fallback, works everywhere)
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      throw new Error('2D canvas context not available');
    }

    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const imgData    = ctx.getImageData(0, 0, w, h);
    const pixelBytes = packPixels(imgData);

    // free canvas
    canvas.width = canvas.height = 0;

    // 3️⃣ Store in cache … and render immediately
    await storeBinaryToCache(pixelBytes, w, h, maxDim);
    // Render directly without reading again from cache
    renderPointCloudFromBytes(w, h, pixelBytes, { maxPoints: 300_000 });
  } catch (e) {
    console.error('[PC] processImage error', e);
    setXYZButtonEnabled(true);
    throw e; // IMPORTANT: propagate error to caller
  }
}

//*--- Load from storage on startup (tab reload) --------------------------*/
async function loadPointCloudFromStorage() {
  const data = await readBinaryFromCache(pcConfig.maxDimension);
  if (data) {
    cancelActiveTransform(); // ensure no rotation is running
    isXYZMode = false;
    setXYZButtonState();
    renderPointCloudFromBytes(data.width, data.height, data.pixels, { maxPoints: 300_000 });
  } else {
    console.log('[PC] no cached pointcloud – waiting for user upload');
  }
}

/*--- Cache pruning (keep only current resolution) -----------------------*/
async function pruneCacheExcept(maxDimKeep) {
  if (!('caches' in window)) return;
  const cache = await caches.open(CACHE_NAME);
  const reqs = await cache.keys();
  const { binKey: keepBin, metaKey: keepMeta } = getKeysFor(maxDimKeep);
  for (const r of reqs) {
    const url = r.url || '';
    const del = (url.includes(BIN_KEY_PREFIX) && !url.endsWith(keepBin)) ||
                (url.includes(META_KEY_PREFIX) && !url.endsWith(keepMeta));
    if (del) await cache.delete(r);
  }
}

/*--- Rotation ------------------------------------------------------------*/
function startRotation(entity) {
  entity.removeAttribute('animation__rotate');
  entity.setAttribute('animation__rotate', {
    property: 'rotation',
    to: '360 360 0',
    loop: true,
    dur: 60000,
    easing: 'linear'
  });
}

/*--- RGB → XYZ -----------------------------------------------------------*/
function transformToXYZ() {
  const entity = document.getElementById('current-pointcloud');
  if (!entity) return;
  const mesh = entity.getObject3D('mesh');
  if (!mesh) return;

  const myToken = ++transformToken;
  isAnimatingTransform = true;
  setXYZButtonEnabled(false);

  const geom = mesh.geometry;
  const pos = geom.attributes.position.array;
  const col = geom.attributes.color.array;

  const original = new Float32Array(pos);
  const target   = new Float32Array(pos.length);

  for (let i = 0; i < pos.length; i += 3) {
    const r = col[i] * 255;
    const g = col[i + 1] * 255;
    const b = col[i + 2] * 255;
    target[i]     = ((r / 255) * 50 - 25) + (Math.random() - 0.5);
    target[i + 1] = ((g / 255) * 50 - 25) + (Math.random() - 0.5);
    target[i + 2] = ((b / 255) * 50 - 25) + (Math.random() - 0.5);
  }

  const start = Date.now();
  const dur   = 2000;

  function animate() {
    if (myToken !== transformToken) return; // was cancelled
    const t = Math.min((Date.now() - start) / dur, 1);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic

    for (let i = 0; i < pos.length; i++) {
      pos[i] = original[i] + (target[i] - original[i]) * e;
    }
    geom.attributes.position.needsUpdate = true;

    if (t < 1) requestAnimationFrame(animate);
    else {
      if (myToken !== transformToken) return;
      geom.computeBoundingSphere();
      startRotation(entity);
      isAnimatingTransform = false;
      setXYZButtonEnabled(true);
    }
  }
  animate();
}

/*--- XYZ → RGB -----------------------------------------------------------*/
function revertToRGB() {
  const entity = document.getElementById('current-pointcloud');
  if (!entity) return;
  const mesh = entity.getObject3D('mesh');
  if (!mesh) return;

  const myToken = ++transformToken;
  isAnimatingTransform = true;
  setXYZButtonEnabled(false);

  const geom = mesh.geometry;
  const pos  = geom.attributes.position.array;

  const xyzPos = new Float32Array(pos);
  const target = new Float32Array(pos.length);

  const gridW = geom.userData.gridW || Math.sqrt(pos.length / 3) | 0;
  const gridH = geom.userData.gridH || Math.sqrt(pos.length / 3) | 0;
  const scale = 5;
  let idx = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const x = idx % gridW;
    const y = Math.floor(idx / gridW);
    target[i]     = (x / gridW - 0.5) * scale;
    target[i + 1] = -(y / gridH - 0.5) * scale * (gridH / gridW);
    target[i + 2] = 0;
    idx++;
  }

  entity.removeAttribute('animation__rotate');

  const start = Date.now();
  const dur   = 2000;

  function animate() {
    if (myToken !== transformToken) return;
    const t = Math.min((Date.now() - start) / dur, 1);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    for (let i = 0; i < pos.length; i++) {
      pos[i] = xyzPos[i] + (target[i] - xyzPos[i]) * e;
    }
    geom.attributes.position.needsUpdate = true;

    if (t < 1) requestAnimationFrame(animate);
    else {
      if (myToken !== transformToken) return;
      geom.computeBoundingSphere();
      isXYZMode = false;               // back to RGB
      setXYZButtonState();             // update button label
      setXYZButtonEnabled(true);
      fitPointCloudToView(entity, 1.1); // center again
      isAnimatingTransform = false;
    }
  }
  animate();
}

/*--- UI panel (max-dim, XYZ button, clear cache) ------------------------*/
function createVRControlPanel() {
  const existing = document.getElementById('vr-control-panel');
  if (existing) return;

  const panel = document.createElement('div');
  panel.id = 'vr-control-panel';
  panel.style.cssText = `
    position:fixed;top:30px;right:30px;
    background:rgba(0,0,0,0.8);color:#fff;
    padding:15px;border-radius:8px;
    font-family:sans-serif;font-size:12px;
    z-index:10000;max-width:260px;
  `;

  //* ----- existing content (max-dim, Upload image, Load from URL, XYZ button, Clear cache) -----*/

  panel.innerHTML = `
    <div style="margin-bottom:10px;"><strong>RGB to XYZ pointcloud</strong></div>

    <label style="display:block;margin-bottom:8px;">
      Max Dimension (px):
      <input id="pc-max-dim" type="number" min="0" value="\${pcConfig.maxDimension}"
             style="width:80px;padding:4px;">
    </label>

    <div class="button-row">
      <!-- Upload button (label, opens the hidden <input>) -->
      <label for="fileInput" class="btn"
             style="margin:0;">Upload image</label>

      <!-- Load-from-URL button -->
      <button id="loadUrlBtn" class="btn"
              style="margin:0;">Load from URL</button>
    </div>

    <label style="display:block;margin:8px 0 4px 0;">
      <input id="imageUrlInput" type="url"
             placeholder="https://input:your-img-url-to.xyz"
             class="url-input"
             style="width:100%;margin-top:4px;">
    </label>

    <button id="pc-xyz-transform"
            style="width:100%;padding:6px;margin-bottom:8px;background:#4CAF00;color:#fff;">
      XYZ Pointcloud
    </button>

    <button id="pc-clear-cache"
            style="width:100%;padding:6px;margin-bottom:8px;">Clear Cache</button>
  `;

  document.body.appendChild(panel);

  /* ---------- Button handlers (as before) ---------- */
  const xyzBtn = document.getElementById('pc-xyz-transform');
  xyzBtn.addEventListener('click', () => {
    if (isAnimatingTransform) return;
    if (!isXYZMode) {
      transformToXYZ();
      isXYZMode = true;
    } else {
      revertToRGB();               // resets isXYZMode internally
    }
    setXYZButtonState();
  });

  const maxDimInput = document.getElementById('pc-max-dim');
  maxDimInput.addEventListener('input', debounce(() => {
    const v = parseInt(maxDimInput.value, 10);
    pcConfig.maxDimension = isNaN(v) ? 0 : Math.max(0, v);
    cancelActiveTransform();
    isXYZMode = false;
    setXYZButtonState();

    const last = sessionStorage.getItem(LAST_IMAGE_KEY) ||
                 localStorage.getItem(LAST_IMAGE_KEY);
    if (last) processImage(last, { maxDimension: pcConfig.maxDimension });
  }, 300));

  const clearBtn = document.getElementById('pc-clear-cache');
  clearBtn.addEventListener('click', async () => {
    await clearCacheAndStorage();
    cancelActiveTransform();
    isXYZMode = false;
    setXYZButtonState();
    const inp = document.getElementById('fileInput');
    if (inp) inp.value = '';
    const ent = document.getElementById('current-pointcloud');
    if (ent) disposePointCloudEntity(ent);
    alert('Cache cleared.');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');

  // Hide/show UI only after the scene has fully loaded
  scene.addEventListener('loaded', () => {
    scene.addEventListener('enter-vr', () => {
      ['vr-control-panel', 'fileInput', 'loading', 'message', 'sample-thumbs'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    });

    scene.addEventListener('exit-vr', () => {
      ['vr-control-panel', 'fileInput', 'message', 'sample-thumbs'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'block';
      });
      const ent = document.getElementById('current-pointcloud');
      if (ent) fitPointCloudToView(ent, 1.1);
    });
  });
});

/*--- Initialization ------------------------------------------------------*/
  createVRControlPanel();        // create UI panel
  ensureFreshStorage().then(() => {

  // If something is in the cache, use it; otherwise load default image
  loadPointCloudFromStorage().then(() => {
    // Check if something has already been rendered
    const hasCloud = !!document.getElementById('current-pointcloud');
    if (!hasCloud) {
      const scene = document.querySelector('a-scene');
      if (!scene) return;
      const startDefault = () => {
        // Choose 0 (original) or e.g. 1024 for headsets
        const options = { maxDimension: 0 };
        processImage('img/Berg.webp', options);
      };
      if (scene.hasLoaded) startDefault();
      else scene.addEventListener('loaded', startDefault, { once: true });
    }
  });
});

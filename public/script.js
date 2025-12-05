// Binary pointcloud storage and rendering
// Stores pixels as RGB8 bytes in the Cache API; includes a small UI for controls and reload support.

const CACHE_NAME = 'pointcloud-cache';
const BIN_KEY_PREFIX = '/pointcloud_'; // keys will be /pointcloud_<maxDim>.bin
const META_KEY_PREFIX = '/pointcloud_meta_'; // keys will be /pointcloud_meta_<maxDim>.json
const LOCAL_STORAGE_KEY = 'pointcloudJsonBackup';
const LAST_IMAGE_KEY = 'pc_last_image_dataurl';

// App-Version -> beim Rebuild einmalig Cache leeren
const APP_VERSION = '2025-12-05-02';
const STORAGE_VERSION_KEY = 'pc_storage_version';

// Default config (0 = full resolution)
const pcConfig = {
  maxDimension: 0 // 0 = keep original, otherwise scale longest side to this
};

// Tokens/State
let currentProcessToken = 0;   // für Bildverarbeitung
let transformToken = 0;        // für XYZ/Back Animation
let isAnimatingTransform = false;
let isXYZMode = false;

// Simple debounce helper
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Initialer Storage-Reset nach Versionswechsel
async function ensureFreshStorage() {
  try {
    const v = localStorage.getItem(STORAGE_VERSION_KEY);
    if (v !== APP_VERSION) {
      await clearCacheAndStorage();
      localStorage.setItem(STORAGE_VERSION_KEY, APP_VERSION);
      console.log('Storage cleared due to app version change:', APP_VERSION);
    }
  } catch (e) {
    console.warn('ensureFreshStorage failed', e);
  }
}

// UI: Button-State Helfer
function setXYZButtonState() {
  const btn = document.getElementById('pc-xyz-transform');
  if (!btn) return;
  if (isXYZMode) {
    btn.textContent = 'Back to RGB';
    btn.style.background = '#FF9800';
  } else {
    btn.textContent = 'XYZ Pointcloud';
    btn.style.background = '#4CAF50';
  }
}
function setXYZButtonEnabled(enabled) {
  const btn = document.getElementById('pc-xyz-transform');
  if (btn) btn.disabled = !enabled;
}
function cancelActiveTransform() {
  transformToken++;
  isAnimatingTransform = false;
  const entity = document.getElementById('current-pointcloud');
  if (entity) entity.removeAttribute('animation__rotate');
}

// UI: VR Control Panel
function createVRControlPanel() {
  const existingPanel = document.getElementById('vr-control-panel');
  if (existingPanel) return;

  const panel = document.createElement('div');
  panel.id = 'vr-control-panel';
  panel.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 15px;
    border-radius: 8px;
    font-family: sans-serif;
    font-size: 12px;
    z-index: 10000;
    max-width: 220px;
  `;

  panel.innerHTML = `
    <div style="margin-bottom: 10px;"><strong>PointCloud VR</strong></div>
    <label style="display: block; margin-bottom: 8px;">
      Max Dimension (px):
      <input id="pc-max-dim" type="number" min="0" value="${pcConfig.maxDimension}" style="width: 80px; padding: 4px;">
    </label>
    <button id="pc-xyz-transform" style="width: 100%; padding: 6px; cursor: pointer; margin-bottom: 8px; background: #4CAF50; color: white;">
      XYZ Pointcloud
    </button>
    <button id="pc-clear-cache" style="width: 100%; padding: 6px; cursor: pointer;">
      Clear Cache
    </button>
  `;

  document.body.appendChild(panel);

  // XYZ Toggle
  const xyzBtn = document.getElementById('pc-xyz-transform');
  if (xyzBtn) {
    xyzBtn.addEventListener('click', () => {
      if (isAnimatingTransform) return; // während Animation nicht toggeln
      const entity = document.getElementById('current-pointcloud');
      if (!entity || !entity.getObject3D('mesh')) return;

      if (!isXYZMode) {
        transformToXYZ();
        isXYZMode = true;
      } else {
        revertToRGB(); // setzt isXYZMode am Ende wieder auf false
      }
      setXYZButtonState();
    });
  }

  // Max Dimension Handler (debounced)
  const maxDimInput = document.getElementById('pc-max-dim');
  maxDimInput.addEventListener('input', debounce(() => {
    const v = parseInt(maxDimInput.value, 10);
    pcConfig.maxDimension = isNaN(v) ? 0 : Math.max(0, v);

    // laufende Animation abbrechen, UI zurücksetzen
    cancelActiveTransform();
    isXYZMode = false;
    setXYZButtonState();

    const lastImage = sessionStorage.getItem(LAST_IMAGE_KEY) || localStorage.getItem(LAST_IMAGE_KEY);
    if (lastImage) {
      processImage(lastImage, { maxDimension: pcConfig.maxDimension });
    }
  }, 300));

  // Clear Cache Handler
  const clearBtn = document.getElementById('pc-clear-cache');
  clearBtn.addEventListener('click', async () => {
    await clearCacheAndStorage();
    cancelActiveTransform();
    isXYZMode = false;
    setXYZButtonState();
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
    const entity = document.getElementById('current-pointcloud');
    if (entity) disposePointCloudEntity(entity);
    alert('Cache cleared.');
  });
}

// Cache keys
function getKeysFor(maxDim) {
  const dim = (typeof maxDim === 'number') ? maxDim : pcConfig.maxDimension;
  return { binKey: `${BIN_KEY_PREFIX}${dim}.bin`, metaKey: `${META_KEY_PREFIX}${dim}.json` };
}

// Pack pixels as RGB8
function packPixels(imageData, width, height) {
  const pixels = new Uint8Array(width * height * 3);
  const data = imageData.data; // RGBA
  let p = 0;
  for (let i = 0; i < data.length; i += 4) {
    pixels[p++] = data[i];
    pixels[p++] = data[i + 1];
    pixels[p++] = data[i + 2];
  }
  return pixels;
}

async function storeBinaryToCache(pixelBytes, width, height, maxDim) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = getKeysFor(maxDim);
    const meta = { width, height, format: 'rgb8' };
    await cache.put(keys.metaKey, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
    await cache.put(keys.binKey, new Response(pixelBytes.buffer, { headers: { 'Content-Type': 'application/octet-stream' } }));
    try {
      const maxBackupPixels = 200000;
      if (width * height <= maxBackupPixels) {
        const str = JSON.stringify({ width, height, pixels: Array.from(pixelBytes) });
        const compressed = LZString.compressToUTF16(str);
        localStorage.setItem(LOCAL_STORAGE_KEY, compressed);
      }
    } catch (e) {
      console.warn('localStorage backup failed:', e);
    }
    return true;
  } catch (e) {
    console.error('Error storing binary to cache:', e);
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
        const pixelBytes = new Uint8Array(ab);
        if (pixelBytes.length !== meta.width * meta.height * 3) return null;
        return { width: meta.width, height: meta.height, pixels: pixelBytes };
      }
    } catch (e) {
      console.warn('Cache read failed, will attempt localStorage backup:', e);
    }
  }
  try {
    const compressed = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (compressed) {
      const str = LZString.decompressFromUTF16(compressed);
      const obj = JSON.parse(str);
      return { width: obj.width, height: obj.height, pixels: new Uint8Array(obj.pixels) };
    }
  } catch (e) {
    console.warn('localStorage restore failed:', e);
  }
  return null;
}

async function clearCacheAndStorage() {
  try {
    if ('caches' in window) {
      const cache = await caches.open(CACHE_NAME);
      const requests = await cache.keys();
      for (const req of requests) {
        const url = req.url || '';
        if (url.includes(BIN_KEY_PREFIX) || url.includes(META_KEY_PREFIX)) {
          await cache.delete(req);
        }
      }
    }
  } catch (e) {
    console.warn('Failed clearing cache:', e);
  }
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    sessionStorage.removeItem(LAST_IMAGE_KEY);
    localStorage.removeItem(LAST_IMAGE_KEY);
  } catch (e) {
    console.warn('Failed clearing localStorage backup:', e);
  }
}

// Minimal-Komponente: Größe/Dispose
AFRAME.registerComponent('point-cloud', {
  schema: { size: { default: 0.02 } },
  update: function (oldData) {
    if (oldData.size !== this.data.size) {
      const obj = this.el.getObject3D('mesh');
      if (obj && obj.material) obj.material.size = this.data.size;
    }
  },
  remove: function () {
    const obj = this.el.getObject3D('mesh');
    if (obj) {
      obj.geometry?.dispose();
      obj.material?.dispose();
      this.el.removeObject3D('mesh');
    }
  }
});

// Fit-to-View: komplette Punktwolke im Bild
function fitPointCloudToView(entity, padding = 1.1) {
  const camEl = document.getElementById('main-camera');
  if (!camEl) return;
  const camObj = camEl.getObject3D('camera');
  if (!camObj) return;
  const points = entity.getObject3D('mesh');
  if (!points) return;

  const geom = points.geometry;
  if (!geom.boundingSphere) geom.computeBoundingSphere();
  const r = Math.max(geom.boundingSphere?.radius || 1, 0.0001);

  const fovV = THREE.MathUtils.degToRad(camObj.fov || 60);
  const aspect = camObj.aspect || (window.innerWidth / Math.max(1, window.innerHeight));
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect);

  const distV = r / Math.tan(fovV / 2);
  const distH = r / Math.tan(fovH / 2);
  const dist = Math.max(distV, distH) * padding;
  const camY = camEl.object3D.position.y || 0;

  entity.object3D.position.set(0, camY, -dist);
  entity.object3D.updateMatrixWorld(true);
}

// Animation: RGB → XYZ
function transformToXYZ() {
  const entity = document.getElementById('current-pointcloud');
  if (!entity) return;
  const points = entity.getObject3D('mesh');
  if (!points) return;

  const myToken = ++transformToken;
  isAnimatingTransform = true;
  setXYZButtonEnabled(false);

  const geometry = points.geometry;
  const positions = geometry.attributes.position.array;
  const colors = geometry.attributes.color.array;

  const originalPositions = new Float32Array(positions);
  const targetPositions = new Float32Array(positions.length);

  for (let i = 0; i < positions.length; i += 3) {
    const r = colors[i] * 255;
    const g = colors[i + 1] * 255;
    const b = colors[i + 2] * 255;
    targetPositions[i]     = ((r / 255) * 50 - 25) + (Math.random() - 0.5);
    targetPositions[i + 1] = ((g / 255) * 50 - 25) + (Math.random() - 0.5);
    targetPositions[i + 2] = ((b / 255) * 50 - 25) + (Math.random() - 0.5);
  }

  let progress = 0;
  const duration = 2000;
  const startTime = Date.now();

  function animate() {
    if (myToken !== transformToken) return; // abgebrochen
    const elapsed = Date.now() - startTime;
    progress = Math.min(elapsed / duration, 1);
    const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    for (let i = 0; i < positions.length; i++) {
      positions[i] = originalPositions[i] + (targetPositions[i] - originalPositions[i]) * eased;
    }
    geometry.attributes.position.needsUpdate = true;

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      if (myToken !== transformToken) return; // abgebrochen
      geometry.computeBoundingSphere();
      startRotation(entity);
      isAnimatingTransform = false; // Animation beendet
      setXYZButtonEnabled(true); // Button wieder aktiv
    }
  }
  animate();
}

// Animation: XYZ → RGB
function revertToRGB() {
  const entity = document.getElementById('current-pointcloud');
  if (!entity) return;
  const points = entity.getObject3D('mesh');
  if (!points) return;

  const myToken = ++transformToken;
  isAnimatingTransform = true;
  setXYZButtonEnabled(false);

  const geometry = points.geometry;
  const positions = geometry.attributes.position.array;

  const xyzPositions = new Float32Array(positions);
  const targetPositions = new Float32Array(positions.length);

  const gridW = geometry.userData.gridW || Math.sqrt(positions.length / 3) | 0;
  const gridH = geometry.userData.gridH || Math.sqrt(positions.length / 3) | 0;

  const scale = 5;
  let gridIndex = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const x = gridIndex % gridW;
    const y = Math.floor(gridIndex / gridW);
    targetPositions[i]     = (x / gridW - 0.5) * scale;
    targetPositions[i + 1] = -(y / gridH - 0.5) * scale * (gridH / gridW);
    targetPositions[i + 2] = 0;
    gridIndex++;
  }

  entity.removeAttribute('animation__rotate');

  let progress = 0;
  const duration = 2000;
  const startTime = Date.now();

  function animateReverse() {
    if (myToken !== transformToken) return; // abgebrochen
    const elapsed = Date.now() - startTime;
    progress = Math.min(elapsed / duration, 1);
    const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    for (let i = 0; i < positions.length; i++) {
      positions[i] = xyzPositions[i] + (targetPositions[i] - xyzPositions[i]) * eased;
    }
    geometry.attributes.position.needsUpdate = true;

    if (progress < 1) {
      requestAnimationFrame(animateReverse);
    } else {
      if (myToken !== transformToken) return; // abgebrochen
      geometry.computeBoundingSphere();
      isXYZMode = false; // zurücksetzen
      setXYZButtonState();
      setXYZButtonEnabled(true); // Button wieder aktiv
      fitPointCloudToView(entity, 1.1); // Sichtfeld anpassen
    }
  }
  animateReverse();
}

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

// Top-level loader from cache
async function loadPointCloudFromStorage() {
  const data = await readBinaryFromCache(pcConfig.maxDimension);
  if (data) {
    renderPointCloudFromBytes(data.width, data.height, data.pixels, { maxPoints: (window.PC_MAX_POINTS || 300000) });
  } else {
    console.error('No pointcloud data found in cache/localStorage for current resolution.');
  }
}

// ImageBitmap laden – optional früh skalieren
async function loadImageBitmap(imageUrl, targetMaxDim) {
  const wantResize = typeof targetMaxDim === 'number' && targetMaxDim > 0;
  if (imageUrl.startsWith('data:')) {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.src = imageUrl;
      im.crossOrigin = 'Anonymous';
      im.onload = () => resolve(im);
      im.onerror = reject;
    });
    if (wantResize && (img.width > targetMaxDim || img.height > targetMaxDim)) {
      const scale = targetMaxDim / Math.max(img.width, img.height);
      const rw = Math.max(1, Math.floor(img.width * scale));
      const rh = Math.max(1, Math.floor(img.height * scale));
      return await createImageBitmap(img, { resizeWidth: rw, resizeHeight: rh, resizeQuality: 'medium' });
    }
    return await createImageBitmap(img);
  } else {
    const resp = await fetch(imageUrl, { mode: 'cors' });
    const blob = await resp.blob();
    const bmp = await createImageBitmap(blob);
    if (wantResize && (bmp.width > targetMaxDim || bmp.height > targetMaxDim)) {
      const scale = targetMaxDim / Math.max(bmp.width, bmp.height);
      const rw = Math.max(1, Math.floor(bmp.width * scale));
      const rh = Math.max(1, Math.floor(bmp.height * scale));
      const resized = await createImageBitmap(bmp, { resizeWidth: rw, resizeHeight: rh, resizeQuality: 'medium' });
      bmp.close();
      return resized;
    }
    return bmp;
  }
}

// Bild verarbeiten (Downscale, packen, cachen, rendern)
async function processImage(imageUrl, options = {}) {
  const token = ++currentProcessToken; // Cancel-Token
  try {
    const maxDim = (typeof options.maxDimension === 'number') ? options.maxDimension : pcConfig.maxDimension;

    // Jede neue Verarbeitung: Animation abbrechen, Button sperren, Modus reset
    cancelActiveTransform();
    isXYZMode = false;
    setXYZButtonState();
    setXYZButtonEnabled(false);

    if (imageUrl && imageUrl.startsWith('data:')) {
      try {
        sessionStorage.setItem(LAST_IMAGE_KEY, imageUrl);
      } catch {
        try { localStorage.setItem(LAST_IMAGE_KEY, imageUrl); } catch {}
      }
    }

    const imageBitmap = await loadImageBitmap(imageUrl, maxDim);
    if (token !== currentProcessToken) { imageBitmap?.close?.(); return; }
    if (!imageBitmap) throw new Error('Failed to create ImageBitmap');

    const targetWidth = imageBitmap.width;
    const targetHeight = imageBitmap.height;

    // Canvas
    let canvas, ctx;
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(targetWidth, targetHeight);
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    } else {
      canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    }

    ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
    imageBitmap.close?.();

    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const pixelBytes = packPixels(imageData, targetWidth, targetHeight);

    // Canvas freigeben
    if (!(canvas instanceof OffscreenCanvas)) {
      canvas.width = canvas.height = 0;
    }
    canvas = null; ctx = null;

    if (token !== currentProcessToken) return;

    // Cache schreiben und andere Auflösungen entfernen
    await storeBinaryToCache(pixelBytes, targetWidth, targetHeight, maxDim);
    await pruneCacheExcept(maxDim);

    if (token !== currentProcessToken) return;

    // Rendern (Decimation)
    renderPointCloudFromBytes(targetWidth, targetHeight, pixelBytes, { maxPoints: (window.PC_MAX_POINTS || 300000) });

    setXYZButtonEnabled(true);
  } catch (e) {
    console.error('Error processing image:', e);
    setXYZButtonEnabled(true);
  }
}

function disposePointCloudEntity(entity) {
  const obj = entity?.getObject3D('mesh');
  if (obj) {
    obj.geometry?.dispose();
    obj.material?.dispose();
    entity.removeObject3D('mesh');
  }
}

function renderPointCloudFromBytes(width, height, pixels, { maxPoints = 300000 } = {}) {
  const scene = document.querySelector('a-scene');
  if (!scene) {
    console.error('A-Frame scene not found');
    return;
  }

  let entity = document.getElementById('current-pointcloud');
  if (!entity) {
    entity = document.createElement('a-entity');
    entity.id = 'current-pointcloud';
    entity.setAttribute('position', '0 0 -2');
    entity.setAttribute('point-cloud', { size: 0.02 });
    scene.appendChild(entity);
  }

  disposePointCloudEntity(entity);

  // Decimation (Quest-sicher)
  const total = width * height;
  const stride = Math.max(1, Math.ceil(Math.sqrt(total / maxPoints)));
  const outW = Math.ceil(width / stride);
  const outH = Math.ceil(height / stride);
  const count = outW * outH;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const scale = 5;
  let k = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const idx = (y * width + x) * 3;
      positions[k]     = (x / width - 0.5) * scale;
      positions[k + 1] = -(y / height - 0.5) * scale * (height / width);
      positions[k + 2] = 0;
      colors[k]     = pixels[idx] / 255;
      colors[k + 1] = pixels[idx + 1] / 255;
      colors[k + 2] = pixels[idx + 2] / 255;
      k += 3;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.userData.gridW = outW;
  geometry.userData.gridH = outH;
  geometry.computeBoundingSphere();

  const size = parseFloat(entity.getAttribute('point-cloud')?.size) || 0.02;
  const material = new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: true });

  const points = new THREE.Points(geometry, material);
  entity.setObject3D('mesh', points);

  // WICHTIG: Danach passend ins Sichtfeld setzen
  fitPointCloudToView(entity, 1.1); // 10% Rand
}

// Cache nur für aktuelle Auflösung behalten
async function pruneCacheExcept(maxDimKeep) {
  if (!('caches' in window)) return;
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  const { binKey: keepBin, metaKey: keepMeta } = getKeysFor(maxDimKeep);
  for (const req of requests) {
    const url = req.url || '';
    const shouldDelete =
      (url.includes(BIN_KEY_PREFIX) && !url.endsWith(keepBin)) ||
      (url.includes(META_KEY_PREFIX) && !url.endsWith(keepMeta));
    if (shouldDelete) {
      await cache.delete(req);
    }
  }
}

// Desktop: bei Resize refitten; nach exit-vr ebenfalls
window.addEventListener('resize', () => {
  const entity = document.getElementById('current-pointcloud');
  if (entity) fitPointCloudToView(entity, 1.1);
});

const scene = document.querySelector('a-scene');
if (scene) {
  scene.addEventListener('enter-vr', () => {
    const panel = document.getElementById('vr-control-panel');
    const fileInput = document.getElementById('fileInput');
    const loading = document.getElementById('loading');
    const message = document.getElementById('message');
    if (panel) panel.style.display = 'none';
    if (fileInput) fileInput.style.display = 'none';
    if (loading) loading.style.display = 'none';
    if (message) message.style.display = 'none';
  });
  scene.addEventListener('exit-vr', () => {
    const panel = document.getElementById('vr-control-panel');
    const fileInput = document.getElementById('fileInput');
    const message = document.getElementById('message');
    if (panel) panel.style.display = 'block';
    if (fileInput) fileInput.style.display = 'block';
    if (message) message.style.display = 'block';
    const entity = document.getElementById('current-pointcloud');
    if (entity) fitPointCloudToView(entity, 1.1);
  });

  // Optional: WebGL Context Loss Debug
  scene.addEventListener('render-target-loaded', () => {
    const glCanvas = scene.renderer?.getContext?.()?.canvas;
    if (!glCanvas) return;
    glCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); console.warn('WebGL context lost'); });
    glCanvas.addEventListener('webglcontextrestored', () => { console.warn('WebGL context restored'); });
  });
}

// Initialisierung
ensureFreshStorage().then(() => {
  loadPointCloudFromStorage();
  createVRControlPanel();
});
// LZString should be included in the HTML for the small localStorage backup support.

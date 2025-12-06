/*=====================================================================
  3D‑Pixel‑Point‑Cloud – Haupt‑Script
  Ziel:
  • Bild nach Tab‑Reload sofort im Sichtfeld (kein “unteres Drittel” mehr)
  • XYZ ↔ RGB‑Button kann beliebig oft geklickt werden
  • Nach RGB‑Rückkehr wird das Bild wieder mittig positioniert
=====================================================================*/

////////////////////////////////////////////////////////////
// 1️⃣ Konstanten & globale Zustände
////////////////////////////////////////////////////////////
const CACHE_NAME          = 'pointcloud-cache';
const BIN_KEY_PREFIX      = '/pointcloud_';
const META_KEY_PREFIX     = '/pointcloud_meta_';
const LOCAL_STORAGE_KEY   = 'pointcloudJsonBackup';
const LAST_IMAGE_KEY      = 'pc_last_image_dataurl';

const APP_VERSION         = '2025-12-06-01';               // ändert sich bei jedem Build
const STORAGE_VERSION_KEY = 'pc_storage_version';

// default: 0 = original size, otherwise longest side → maxDimension
const pcConfig = { maxDimension: 0 };

let currentProcessToken = 0;   // Bild‑Verarbeitung‑Token
let transformToken      = 0;   // XYZ‑/‑RGB‑Animations‑Token
let isAnimatingTransform = false;
let isXYZMode           = false;   // aktueller Modus (RGB = false, XYZ = true)

////////////////////////////////////////////////////////////
// 2️⃣ Hilfs‑/Utility‑Funktionen
////////////////////////////////////////////////////////////
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/*--- Cache‑Version‑Check -------------------------------------------------
    Beim ersten Laden nach einem Build wird der gesamte Cache + Storage
    geleert, damit kein altes Bild aus einem vorherigen Build angezeigt
    wird. */
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

/*--- UI‑Helper -----------------------------------------------------------*/
function setXYZButtonState() {
  const btn = document.getElementById('pc-xyz-transform');
  if (!btn) return;
  if (isXYZMode) {
    btn.textContent = 'Back to RGB';
    btn.style.background = '#FF9800';
  } else {
    btn.textContent = 'XYZ Pointcloud';
    btn.style.background = '#4CAF00';
  }
}
function setXYZButtonEnabled(enabled) {
  const btn = document.getElementById('pc-xyz-transform');
  if (btn) btn.disabled = !enabled;
}
function cancelActiveTransform() {
  // erhöht das Token → laufende Animations‑Loops beenden sich selbst
  transformToken++;
  isAnimatingTransform = false;
  const ent = document.getElementById('current-pointcloud');
  if (ent) ent.removeAttribute('animation__rotate');
}

/*--- Cache‑Key‑Helper ----------------------------------------------------*/
function getKeysFor(maxDim) {
  const dim = typeof maxDim === 'number' ? maxDim : pcConfig.maxDimension;
  return {
    binKey:  `${BIN_KEY_PREFIX}${dim}.bin`,
    metaKey: `${META_KEY_PREFIX}${dim}.json`
  };
}

/*--- Pixel‑Packing -------------------------------------------------------*/
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

/*--- Cache‑I/O -----------------------------------------------------------*/
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

    // kleine Backup‑Option für sehr kleine Bilder (optional)
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
      const binResp  = await cache.match(keys.binKey);
      if (metaResp && binResp) {
        const meta = await metaResp.json();
        const ab   = await binResp.arrayBuffer();
        const pix  = new Uint8Array(ab);
        if (pix.length !== meta.width * meta.height * 3) {
          console.warn('[PC] pixel‑size mismatch');
          return null;
        }
        return { width: meta.width, height: meta.height, pixels: pix };
      }
    } catch (e) {
      console.warn('[PC] Cache read error – trying localStorage', e);
    }
  }
  // fallback: localStorage backup
  try {
    const comp = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (comp) {
      const obj = JSON.parse(LZString.decompressFromUTF16(comp));
      return { width: obj.width, height: obj.height, pixels: new Uint8Array(obj.pixels) };
    }
  } catch (e) {
    console.warn('[PC] localStorage restore failed', e);
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

/*--- A‑Frame‑Component ---------------------------------------------------*/
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
// 3️⃣ Geometrie‑Fit‑und‑Render‑Hilfen
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
  renderPointCloudFromBytes – neues Bild rendern
=====================================================================*/
function renderPointCloudFromBytes(w, h, pixels, { maxPoints = 300_000 } = {}) {
  const scene = document.querySelector('a-scene');
  if (!scene) {
    console.error('[PC] no A‑Frame scene');
    return;
  }

  // --------------------------------------------------------------
  // 1️⃣ Entity holen / anlegen
  // --------------------------------------------------------------
  let entity = document.getElementById('current-pointcloud');
  if (!entity) {
    entity = document.createElement('a-entity');
    entity.id = 'current-pointcloud';
    entity.setAttribute('point-cloud', { size: 0.02 });
    scene.appendChild(entity);
  }

  // --------------------------------------------------------------
  // 2️⃣ Alte GPU‑Ressourcen & Rotation entfernen
  // --------------------------------------------------------------
  disposePointCloudEntity(entity);               // alte Geometrie/Material freigeben
  entity.removeAttribute('animation__rotate');   // laufende Dreh‑Animation stoppen

  // **WICHTIG:** Rotationsmatrix zurücksetzen, sonst bleibt das alte
  // Dreh‑Winkel erhalten. Danach wird die Position später von
  // fitPointCloudToView neu berechnet.
  entity.object3D.rotation.set(0, 0, 0);         // <‑‑ Reset zur Identität
  // (optional) Position ebenfalls zurücksetzen, damit fit… nicht von
  // einer evtl. verschobenen Ausgangsposition ausgeht:
  // entity.object3D.position.set(0, 0, 0);

  // --------------------------------------------------------------
  // 3️⃣ Decimation (Quest‑freundlich)
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
  // 4️⃣ BufferGeometry bauen
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
  // 5️⃣ Sichtfeld‑Anpassung – **immer nach dem Render!**
  // --------------------------------------------------------------
  fitPointCloudToView(entity, 1.1);   // 10 % Rand, mittig vor Kamera
}

/*--- Entity‑Dispose ------------------------------------------------------*/
function disposePointCloudEntity(entity) {
  const obj = entity?.getObject3D('mesh');
  if (obj) {
    obj.geometry?.dispose();
    obj.material?.dispose();
    entity.removeObject3D('mesh');
  }
}

/*--- Image‑Loading -------------------------------------------------------*/
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

/*--- Bild‑Verarbeitung ---------------------------------------------------*/
async function processImage(imageUrl, options = {}) {
  const token = ++currentProcessToken;            // Cancel‑Token

  try {
    const maxDim = (typeof options.maxDimension === 'number')
      ? options.maxDimension
      : pcConfig.maxDimension;

    // 1️⃣ Abbruch laufender Animationen & UI‑Reset
    cancelActiveTransform();                     // stoppt Rotation & XYZ‑Animation
    isXYZMode = false;
    setXYZButtonState();
    setXYZButtonEnabled(false);

    // 2️⃣ Data‑URL sichern (für Reloads)
    if (imageUrl.startsWith('data:')) {
      try { sessionStorage.setItem(LAST_IMAGE_KEY, imageUrl); }
      catch { try { localStorage.setItem(LAST_IMAGE_KEY, imageUrl); } catch {} }
    }

    // 3️⃣ Bitmap holen (inkl. evtl. Down‑Scale)
    const bitmap = await loadImageBitmap(imageUrl, maxDim);
    if (token !== currentProcessToken) { bitmap?.close?.(); return; }
    if (!bitmap) throw new Error('Bitmap creation failed');

    const w = bitmap.width, h = bitmap.height;

    // 4️⃣ Canvas → ImageData → RGB‑Bytes
    let canvas, ctx;
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(w, h);
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    } else {
      canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const imgData = ctx.getImageData(0, 0, w, h);
    const pixelBytes = packPixels(imgData);

    // 5️⃣ Canvas freigeben
    if (!(canvas instanceof OffscreenCanvas)) { canvas.width = canvas.height = 0; }
    canvas = null; ctx = null;
    if (token !== currentProcessToken) return;

    // 6️⃣ Cache speichern + alte Auflösungen entfernen
    await storeBinaryToCache(pixelBytes, w, h, maxDim);
    await pruneCacheExcept(maxDim);
    if (token !== currentProcessToken) return;

    // 7️⃣ Rendern (inkl. Fit‑to‑View)
    renderPointCloudFromBytes(w, h, pixelBytes, { maxPoints: 300_000 });

    // 8️⃣ UI wieder aktivieren
    setXYZButtonEnabled(true);
  } catch (e) {
    console.error('[PC] processImage error', e);
    setXYZButtonEnabled(true);
  }
}

/*--- Laden aus Cache beim Start (Tab‑Reload) ---------------------------*/
async function loadPointCloudFromStorage() {
  const data = await readBinaryFromCache(pcConfig.maxDimension);
  if (data) {
    cancelActiveTransform();          // sicherstellen, dass keine Rotation mehr läuft
    isXYZMode = false;
    setXYZButtonState();
    renderPointCloudFromBytes(data.width, data.height, data.pixels, { maxPoints: 300_000 });
  } else {
    console.log('[PC] no cached pointcloud – waiting for user upload');
  }
}

/*--- Cache‑Pruning (nur aktuelle Auflösung behalten) --------------------*/
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

/*--- XYZ ↔ RGB‑Animationen ---------------------------------------------*/
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
    if (myToken !== transformToken) return; // wurde abgebrochen
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
      isXYZMode = false;               // zurück zu RGB
      setXYZButtonState();             // Button‑Label updaten
      setXYZButtonEnabled(true);
      fitPointCloudToView(entity, 1.1); // wieder mittig
      isAnimatingTransform = false;
    }
  }
  animate();
}

/*--- Laden aus Cache beim Start (Tab‑Reload) ---------------------------*/
async function loadPointCloudFromStorage() {
  const data = await readBinaryFromCache(pcConfig.maxDimension);
  if (data) {
    // Vor dem Rendern sicherstellen, dass kein vorheriger Transform‑State aktiv ist
    cancelActiveTransform();
    isXYZMode = false;
    setXYZButtonState();
    renderPointCloudFromBytes(data.width, data.height, data.pixels, { maxPoints: 300_000 });
  } else {
    console.log('[PC] no cached pointcloud – waiting for user upload');
  }
}

/*--- UI‑Panel (max‑Dim, XYZ‑Button, Cache‑Clear) ----------------------*/
function createVRControlPanel() {
  // (siehe oben – unverändert, nur hier eingefügt, weil wir die
  //   setXYZButtonState‑/‑Enabled‑Logik benötigen)
  const existing = document.getElementById('vr-control-panel');
  if (existing) return;

  const panel = document.createElement('div');
  panel.id = 'vr-control-panel';
  panel.style.cssText = `
    position:fixed;top:10px;right:10px;
    background:rgba(0,0,0,0.8);color:#fff;
    padding:15px;border-radius:8px;
    font-family:sans-serif;font-size:12px;
    z-index:10000;max-width:220px;
  `;
  panel.innerHTML = `
    <div style="margin-bottom:10px;"><strong>PointCloud VR</strong></div>
    <label style="display:block;margin-bottom:8px;">
      Max Dimension (px):
      <input id="pc-max-dim" type="number" min="0" value="${pcConfig.maxDimension}"
             style="width:80px;padding:4px;">
    </label>
    <button id="pc-xyz-transform"
            style="width:100%;padding:6px;margin-bottom:8px;background:#4CAF00;color:#fff;">
      XYZ Pointcloud
    </button>
    <button id="pc-clear-cache"
            style="width:100%;padding:6px;">Clear Cache</button>
  `;
  document.body.appendChild(panel);

  // ---- Button‑Handler -------------------------------------------------
  const xyzBtn = document.getElementById('pc-xyz-transform');
  xyzBtn.addEventListener('click', () => {
    if (isAnimatingTransform) return; // keine Umschaltung während Animation
    if (!isXYZMode) {
      transformToXYZ();
      isXYZMode = true;
    } else {
      revertToRGB(); // setzt isXYZMode intern zurück
    }
    setXYZButtonState();
  });

  // ---- Max‑Dimension‑Handler (debounced) -----------------------------
  const maxDimInput = document.getElementById('pc-max-dim');
  maxDimInput.addEventListener('input', debounce(() => {
    const v = parseInt(maxDimInput.value, 10);
    pcConfig.maxDimension = isNaN(v) ? 0 : Math.max(0, v);

    // Bild neu rendern mit neuer Auflösung
    cancelActiveTransform();
    isXYZMode = false;
    setXYZButtonState();

    const last = sessionStorage.getItem(LAST_IMAGE_KEY) ||
                 localStorage.getItem(LAST_IMAGE_KEY);
    if (last) processImage(last, { maxDimension: pcConfig.maxDimension });
  }, 300));

  // ---- Cache‑Clear ----------------------------------------------------
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

/*--- Resize‑ und VR‑Events (Fit‑to‑View) --------------------------------*/
window.addEventListener('resize', () => {
  const ent = document.getElementById('current-pointcloud');
  if (ent) fitPointCloudToView(ent, 1.1);
});
document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  if (!scene) return;

  // hide UI in VR, show again on exit
  scene.addEventListener('enter-vr', () => {
    ['vr-control-panel', 'fileInput', 'loading', 'message'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  });
  scene.addEventListener('exit-vr', () => {
    ['vr-control-panel', 'fileInput', 'message'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'block';
    });
    const ent = document.getElementById('current-pointcloud');
    if (ent) fitPointCloudToView(ent, 1.1);
  });
});

/*--- Initialisierung ----------------------------------------------------*/
ensureFreshStorage().then(() => {
  loadPointCloudFromStorage();   // <-- erstes Bild wird sofort zentriert
  createVRControlPanel();        // UI‑Panel erzeugen
});

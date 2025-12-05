// Binary pointcloud storage and rendering
// Stores pixels as RGB8 bytes in the Cache API; includes a small UI for controls and reload support.

const CACHE_NAME = 'pointcloud-cache';
const BIN_KEY_PREFIX = '/pointcloud_'; // keys will be /pointcloud_<maxDim>.bin
const META_KEY_PREFIX = '/pointcloud_meta_'; // keys will be /pointcloud_meta_<maxDim>.json
const LOCAL_STORAGE_KEY = 'pointcloudJsonBackup';
const LAST_IMAGE_KEY = 'pc_last_image_dataurl';

// Default config (0 = full resolution)
const pcConfig = {
  maxDimension: 0 // 0 = keep original, otherwise scale longest side to this
};

// Simple debounce helper
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}



// Erstelle einfaches Control Panel für VR
function createVRControlPanel() {
    const existingPanel = document.getElementById('vr-control-panel');
    if (existingPanel) return; // Bereits vorhanden

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
        max-width: 200px;
    `;

    panel.innerHTML = `
      <div style="margin-bottom: 10px;"><strong>PointCloud VR</strong></div>
      <label style="display: block; margin-bottom: 8px;">
          Max Dimension (px):
          <input id="pc-max-dim" type="number" min="0" value="${pcConfig.maxDimension}"
                style="width: 70px; padding: 4px;">
      </label>
      <button id="pc-xyz-transform" style="width: 100%; padding: 6px; cursor: pointer; margin-bottom: 8px; background: #4CAF50; color: white;">
          XYZ Pointcloud
      </button>
      <button id="pc-clear-cache" style="width: 100%; padding: 6px; cursor: pointer;">
          Clear Cache
      </button>
    `;

    document.body.appendChild(panel);

    // XYZ Transform Button Handler - HIER HINZUFÜGEN
    let isXYZMode = false;

    const xyzBtn = document.getElementById('pc-xyz-transform');
    if (xyzBtn) {
        xyzBtn.addEventListener('click', () => {
            const pointCloudEntity = document.querySelector('[point-cloud]');
            if (!pointCloudEntity) {
                console.warn('No point cloud found');
                return;
            }

            if (!isXYZMode) {
                console.log('Starting XYZ transformation');
                transformToXYZ();
                isXYZMode = true;
                xyzBtn.textContent = 'Back to RGB';
                xyzBtn.style.background = '#FF9800';
            } else {
                console.log('Reverting to RGB');
                revertToRGB();
                isXYZMode = false;
                xyzBtn.textContent = 'XYZ Pointcloud';
                xyzBtn.style.background = '#4CAF50';
            }
        });
    }

    // Max Dimension Handler
    const maxDimInput = document.getElementById('pc-max-dim');
    maxDimInput.addEventListener('input', debounce(() => {
      const v = parseInt(maxDimInput.value, 10);
      pcConfig.maxDimension = isNaN(v) ? 0 : Math.max(0, v);
      const lastImage = sessionStorage.getItem(LAST_IMAGE_KEY) || localStorage.getItem(LAST_IMAGE_KEY);
      if (lastImage) {
        processImage(lastImage, { maxDimension: pcConfig.maxDimension });
      }
    }, 300));
    });

    // Clear Cache Handler
    const clearBtn = document.getElementById('pc-clear-cache');
    clearBtn.addEventListener('click', async () => {
        await clearCacheAndStorage();
        isXYZMode = false;
        const xyzBtn = document.getElementById('pc-xyz-transform');
        xyzBtn.textContent = 'XYZ Pointcloud';
        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.value = '';
        const oldCloud = document.querySelector('[point-cloud]');
        if (oldCloud) oldCloud.remove();
        alert('Cache cleared.');
    });
}


function getKeysFor(maxDim) {
  const dim = (typeof maxDim === 'number') ? maxDim : pcConfig.maxDimension;
  return { binKey: `${BIN_KEY_PREFIX}${dim}.bin`, metaKey: `${META_KEY_PREFIX}${dim}.json` };
}

// Packing: create Uint8Array of pixels RGB order (no alpha)
function packPixels(imageData, width, height) {
  const pixels = new Uint8Array(width * height * 3);
  const data = imageData.data; // RGBA
  let p = 0;
  for (let i = 0; i < data.length; i += 4) {
    pixels[p++] = data[i];     // r
    pixels[p++] = data[i + 1]; // g
    pixels[p++] = data[i + 2]; // b
  }
  return pixels;
}

async function storeBinaryToCache(pixelBytes, width, height, maxDim) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = getKeysFor(maxDim);

    // Create meta
    const meta = { width, height, format: 'rgb8' };
    await cache.put(keys.metaKey, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));

    await cache.put(keys.binKey, new Response(pixelBytes.buffer, { headers: { 'Content-Type': 'application/octet-stream' } }));
    console.log('Stored pointcloud binary and meta to Cache API with keys', keys);

    // Optionally attempt a localStorage backup for small images only
    try {
      const maxBackupPixels = 200000; // backup only when reasonable size
      if (width * height <= maxBackupPixels) {
        const str = JSON.stringify({ width, height, pixels: Array.from(pixelBytes) });
        const compressed = LZString.compressToUTF16(str);
        localStorage.setItem(LOCAL_STORAGE_KEY, compressed);
        console.log('Stored backup in localStorage (compressed).');
      } else {
        console.log('Skipping localStorage backup: image too large for reliable backup.');
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
  // Try Cache API
  if ('caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const metaResp = await cache.match(keys.metaKey);
      const binResp = await cache.match(keys.binKey);
      if (metaResp && binResp) {
        const meta = await metaResp.json();
        const ab = await binResp.arrayBuffer();
        const pixelBytes = new Uint8Array(ab);

        // Validate size
        if (pixelBytes.length !== meta.width * meta.height * 3) {
          console.error('Pixel buffer size mismatch:', pixelBytes.length, 'expected', meta.width * meta.height * 3);
          return null;
        }

        return { width: meta.width, height: meta.height, pixels: pixelBytes };
      }
    } catch (e) {
      console.warn('Cache read failed, will attempt localStorage backup:', e);
    }
  }

  // Fallback: localStorage compressed JSON backup
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


//	A-Frame	Component für Punktwolken-Rendering
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
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
      this.el.removeObject3D('mesh');
    }
  }
});


function transformToXYZ() {
    const pointCloudEntity = document.querySelector('[point-cloud]');
    if (!pointCloudEntity) {
        console.warn('No point cloud found');
        return;
    }

    const points = pointCloudEntity.getObject3D('mesh');
    if (!points) return;

    const geometry = points.geometry;
    const positions = geometry.attributes.position.array;
    const colors = geometry.attributes.color.array;

    // Speichere Original-Positionen für Animation
    const originalPositions = new Float32Array(positions);
    const targetPositions = new Float32Array(positions.length);

    // Berechne XYZ-Zielpositionen basierend auf RGB
    for (let i = 0; i < positions.length; i += 3) {
        const r = colors[i] * 255;
        const g = colors[i + 1] * 255;
        const b = colors[i + 2] * 255;

        // RGB → XYZ Mapping (wie im ersten Script)
        targetPositions[i]     = ((r / 255) * 50 - 25) + (Math.random() - 0.5);
        targetPositions[i + 1] = ((g / 255) * 50 - 25) + (Math.random() - 0.5);
        targetPositions[i + 2] = ((b / 255) * 50 - 25) + (Math.random() - 0.5);
    }

    // Animation
    let progress = 0;
    const duration = 2000; // 2 Sekunden
    const startTime = Date.now();

    function animate() {
        const elapsed = Date.now() - startTime;
        progress = Math.min(elapsed / duration, 1);

        // Easing function (easeInOutCubic)
        const eased = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        // Interpoliere Positionen
        for (let i = 0; i < positions.length; i++) {
            positions[i] = originalPositions[i] + (targetPositions[i] - originalPositions[i]) * eased;
        }

        geometry.attributes.position.needsUpdate = true;
        // Nur einmalig berechnen
        geometry.computeBoundingSphere();

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Starte Rotation nach Animation
            startRotation(pointCloudEntity);
        }
    }

    animate();
}

function revertToRGB() {
    const pointCloudEntity = document.querySelector('[point-cloud]');
    if (!pointCloudEntity) {
        console.warn('No point cloud found');
        return;
    }

    const points = pointCloudEntity.getObject3D('mesh');
    if (!points) return;

    const geometry = points.geometry;
    const positions = geometry.attributes.position.array;
    const colors = geometry.attributes.color.array;

    // Speichere aktuelle XYZ-Positionen
    const xyzPositions = new Float32Array(positions);
    const targetPositions = new Float32Array(positions.length);

    // Berechne Original-Positionen basierend auf RGB (umgekehrt)
    for (let i = 0; i < positions.length; i += 3) {
        const r = colors[i] * 255;
        const g = colors[i + 1] * 255;
        const b = colors[i + 2] * 255;

        // Berechne die ursprünglichen Gitter-Positionen
        const pixelIndex = i / 3;
        const width = Math.sqrt(positions.length / 3); // Näherung
        const x = pixelIndex % width;
        const y = Math.floor(pixelIndex / width);

        const scale = 5;
        targetPositions[i] = (x / width - 0.5) * scale;
        targetPositions[i + 1] = -(y / width - 0.5) * scale;
        targetPositions[i + 2] = 0;
    }

    // Animation (umgekehrt)
    let progress = 0;
    const duration = 2000; // 2 Sekunden
    const startTime = Date.now();

    // Entferne Rotation vor Animation
    pointCloudEntity.removeAttribute('animation__rotate');

    function animateReverse() {
        const elapsed = Date.now() - startTime;
        progress = Math.min(elapsed / duration, 1);

        // Easing function (easeInOutCubic)
        const eased = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        // Interpoliere Positionen (XYZ → RGB)
        for (let i = 0; i < positions.length; i++) {
            positions[i] = xyzPositions[i] + (targetPositions[i] - xyzPositions[i]) * eased;
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.computeBoundingSphere();

        if (progress < 1) {
            requestAnimationFrame(animateReverse);
        }
    }

    animateReverse();
}

function startRotation(entity) {
    // Entferne alte Animation falls vorhanden
    entity.removeAttribute('animation__rotate');

    // Füge Rotation hinzu
    entity.setAttribute('animation__rotate', {
        property: 'rotation',
        to: '360 360 0',
        loop: true,
        dur: 60000,
        easing: 'linear'
    });
}

// Top-level loader from cache (used after storing)
async function loadPointCloudFromStorage() {
  const data = await readBinaryFromCache(pcConfig.maxDimension);
  if (data) {
    renderPointCloudFromBytes(data.width, data.height, data.pixels);
  } else {
    console.error('No pointcloud data found in cache/localStorage for current resolution.');
  }
}


async function loadImageBitmap(imageUrl, targetMaxDim) {
  const resizeOpts = (targetMaxDim && targetMaxDim > 0)
    ? { resizeQuality: 'medium' }
    : null;

  if (imageUrl.startsWith('data:')) {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.src = imageUrl;
      im.crossOrigin = 'Anonymous';
      im.onload = () => resolve(im);
      im.onerror = reject;
    });

    // Früh skalieren (Chromium/Wolvic unterstützt Resize-Optionen bei ImageBitmap)
    if (resizeOpts && (img.width > targetMaxDim || img.height > targetMaxDim)) {
      const scale = targetMaxDim / Math.max(img.width, img.height);
      const rw = Math.max(1, Math.floor(img.width * scale));
      const rh = Math.max(1, Math.floor(img.height * scale));
      return await createImageBitmap(img, { resizeWidth: rw, resizeHeight: rh, resizeQuality: 'medium' });
    }
    return await createImageBitmap(img);
  } else {
    const resp = await fetch(imageUrl, { mode: 'cors' });
    const blob = await resp.blob();
    // Optional: bei Blob auch Resize anwenden
    const bmp = await createImageBitmap(blob);
    if (resizeOpts && (bmp.width > targetMaxDim || bmp.height > targetMaxDim)) {
      const scale = targetMaxDim / Math.max(bmp.width, bmp.height);
      const rw = Math.max(1, Math.floor(bmp.width * scale));
      const rh = Math.max(1, Math.floor(bmp.height * scale));
      const resized = await createImageBitmap(bmp, { resizeWidth: rw, resizeHeight: rh, resizeQuality: Gill 'medium' });
      bmp.close();
      return resized;
    }
    return bmp;
  }
}

let currentProcessToken = 0;

async function processImage(imageUrl, options = {}) {
  const token = ++currentProcessToken; // Abbruch-/Storno-Token
  try {
    const maxDim = (typeof options.maxDimension === 'number') ? options.maxDimension : pcConfig.maxDimension;

    if (imageUrl && imageUrl.startsWith('data:')) {
      try {
        sessionStorage.setItem(LAST_IMAGE_KEY, imageUrl);
      } catch {
        try { localStorage.setItem(LAST_IMAGE_KEY, imageUrl); } catch {}
      }
    }

    // Alte Punktwolke nur visuell entfernen (GPU Disposen in render), falls vorhanden
    const oldCloud = document.getElementById('current-pointcloud');
    // nicht sofort entfernen; render kümmert sich um Dispose/Replace

    const imageBitmap = await loadImageBitmap(imageUrl, maxDim);
    if (token !== currentProcessToken) { imageBitmap?.close?.(); return; }
    if (!imageBitmap) throw new Error('Failed to create ImageBitmap');

    const targetWidth = imageBitmap.width;
    const targetHeight = imageBitmap.height;

    // Kleinere Canvas genügt jetzt, da früh skaliert
    const canvas = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(targetWidth, targetHeight)
      : Object.assign(document.createElement('canvas'), { width: targetWidth, height: targetHeight });

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

    // Bitmap freigeben
    imageBitmap.close?.();

    const pixelBytes = packPixels(imageData, targetWidth, targetHeight);

    // Canvas-Speicher freigeben
    if (!(canvas instanceof OffscreenCanvas)) {
      // DOM-Canvas
      canvas.width = canvas.height = 0;
    }
    // Referenzen lösen
    // eslint-disable-next-line no-unused-vars
    // @ts-ignore
    ctx = null;

    if (token !== currentProcessToken) return;

    // Cache auf aktuelle Auflösung beschränken
    await storeBinaryToCache(pixelBytes, targetWidth, targetHeight, maxDim);
    await pruneCacheExcept(maxDim);

    if (token !== currentProcessToken) return;

    // Direkt rendern (mit Decimation)
    renderPointCloudFromBytes(targetWidth, targetHeight, pixelBytes, { maxPoints: 300000 });

  } catch (e) {
    console.error('Error processing image:', e);
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
  if (!scene) return;

  let entity = document.getElementById('current-pointcloud');
  if (!entity) {
    entity = document.createElement('a-entity');
    entity.id = 'current-pointcloud';
    entity.setAttribute('position', '0 0 -2');
    entity.setAttribute('point-cloud', { size: 0.02 }); // nur Größe
    scene.appendChild(entity);
  }

  // alte GPU-Ressourcen freigeben
  disposePointCloudEntity(entity);

  // Decimation
  const total = width * height;
  const stride = Math.max(1, Math.ceil(Math.sqrt(total / maxPoints)));

  const outW = Math.ceil(width / stride);
  const outH = Math.ceil(height / stride);
  const count = outW * outH;

  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);

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
  geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  const size = entity.getAttribute('point-cloud')?.size || 0.02;
  const material = new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: true });

  const points = new THREE.Points(geometry, material);
  entity.setObject3D('mesh', points);
}



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


// VR-Modus Event Listener für UI-Sichtbarkeit
document.addEventListener('DOMContentLoaded', () => {
    const scene = document.querySelector('a-scene');

    if (scene) {
        scene.addEventListener('enter-vr', () => {
            console.log('Entering VR mode');
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
            console.log('Exiting VR mode');
            const panel = document.getElementById('vr-control-panel');
            const fileInput = document.getElementById('fileInput');
            const message = document.getElementById('message');

            if (panel) panel.style.display = 'block';
            if (fileInput) fileInput.style.display = 'block';
            if (message) message.style.display = 'block';
        });
    }
});

// Initialisierung
geometry.computeBoundingSphere();
loadPointCloudFromStorage();
createVRControlPanel();

// LZString should be included in the HTML for the small localStorage backup support.

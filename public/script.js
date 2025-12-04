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

// Create a simple control panel if not present in DOM
function ensureControlPanel() {
  if (document.getElementById('pc-control-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'pc-control-panel';
  panel.style.position = 'fixed';
  panel.style.top = '10px';
  panel.style.right = '10px';
  panel.style.background = 'rgba(255,255,255,0.95)';
  panel.style.border = '1px solid #ccc';
  panel.style.padding = '8px';
  panel.style.zIndex = 9999;
  panel.style.fontFamily = 'sans-serif';
  panel.style.fontSize = '13px';
  panel.style.maxWidth = '240px';

  panel.innerHTML = `
    <div style="margin-bottom:6px;"><strong>PointCloud Controls</strong></div>
    <label>Max dimension (px, 0 = full): <input id="pc-max-dim" type="number" min="0" value="${pcConfig.maxDimension}" style="width:80px;" /></label>
    <div style="height:6px"></div>
    <div style="height:6px"></div>
    <button id="pc-clear-cache">Clear Cache</button>
  `;

  document.body.appendChild(panel);

  const maxDimInput = document.getElementById('pc-max-dim');
  const clearBtn = document.getElementById('pc-clear-cache');

  // Erstelle einfaches Control Panel für VR
function createVRControlPanel() {
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
        <button id="pc-clear-cache" style="width: 100%; padding: 6px; cursor: pointer;">
            Clear Cache
        </button>
    `;

    document.body.appendChild(panel);

    // Event Listener
    const maxDimInput = document.getElementById('pc-max-dim');
    const clearBtn = document.getElementById('pc-clear-cache');

    maxDimInput.addEventListener('input', () => {
        const v = parseInt(maxDimInput.value, 10);
        pcConfig.maxDimension = isNaN(v) ? 0 : Math.max(0, v);
        processImage(
            sessionStorage.getItem(LAST_IMAGE_KEY) || localStorage.getItem(LAST_IMAGE_KEY),
            { maxDimension: pcConfig.maxDimension }
        );
    });

    clearBtn.addEventListener('click', async () => {
        await clearCacheAndStorage();
        document.getElementById('fileInput').value = '';
        const oldCloud = document.querySelector('[point-cloud]');
        if (oldCloud) oldCloud.remove();
        alert('Cache and localStorage backup cleared.');
    });
}

  clearBtn.addEventListener('click', async () => {
    await clearCacheAndStorage();
    const container = document.getElementById('pointcloud-container');
    while (container.firstChild) container.removeChild(container.firstChild);
    document.getElementById('fileInput').value = ''; // Allow re-upload
    alert('Cache and localStorage backup cleared.');
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


// A-Frame Component für Punktwolken-Rendering
AFRAME.registerComponent('point-cloud', {
    schema: {
        vertices: { type: 'string' },
        colors: { type: 'string' },
        size: { default: 0.1 }
    },

    init: function() {
        const data = this.data;
        const el = this.el;

        // Parse Daten
        const verticesArray = data.vertices.split(',').map(Number);
        const colorsArray = data.colors.split(',').map(Number);

        // Three.js Geometrie erstellen
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position',
            new THREE.Float32BufferAttribute(verticesArray, 3));
        geometry.setAttribute('color',
            new THREE.Float32BufferAttribute(colorsArray, 3));

        // Material
        const material = new THREE.PointsMaterial({
            size: data.size,
            vertexColors: true,
            sizeAttenuation: true
        });

        // Points Object
        const points = new THREE.Points(geometry, material);
        el.setObject3D('mesh', points);
    },

    update: function(oldData) {
        if (oldData.vertices !== this.data.vertices) {
            this.init();
        }
    },

    remove: function() {
        this.el.removeObject3D('mesh');
    }
});

// Top-level loader from cache (used after storing)
async function loadPointCloudFromStorage() {
  const data = await readBinaryFromCache(pcConfig.maxDimension);
  if (data) {
    renderPointCloudFromBytes(data.width, data.height, data.pixels);
  } else {
    console.error('No pointcloud data found in cache/localStorage for current resolution.');
  }
}

// Process image: draw to canvas, optional downscale, pack, and store
async function processImage(imageUrl, options = {}) {
  try {
    ensureControlPanel();

    const maxDim = (typeof options.maxDimension === 'number') ? options.maxDimension : pcConfig.maxDimension;

    // Persist the last image Data URL so reloads/changes work without re-upload
    if (imageUrl && imageUrl.startsWith('data:')) {
      try {
        sessionStorage.setItem(LAST_IMAGE_KEY, imageUrl);
      } catch (e) {
        try { localStorage.setItem(LAST_IMAGE_KEY, imageUrl); } catch (e2) { /* ignore */ }
      }
    }

    // clear previous point cloud container
    const container = document.getElementById('pointcloud-container');
    while (container.firstChild) container.removeChild(container.firstChild);

    const imageBitmap = await loadImageBitmap(imageUrl);
    if (!imageBitmap) throw new Error('Failed to create ImageBitmap');

    let targetWidth = imageBitmap.width;
    let targetHeight = imageBitmap.height;

    if (maxDim > 0) {
      const longest = Math.max(imageBitmap.width, imageBitmap.height);
      if (longest > maxDim) {
        const scale = maxDim / longest;
        targetWidth = Math.max(1, Math.floor(imageBitmap.width * scale));
        targetHeight = Math.max(1, Math.floor(imageBitmap.height * scale));
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

    const pixelBytes = packPixels(imageData, targetWidth, targetHeight);

    // Store to cache (binary) and then load
    await storeBinaryToCache(pixelBytes, targetWidth, targetHeight, maxDim);
    await loadPointCloudFromStorage();
  } catch (e) {
    console.error('Error processing image:', e);
  }
}

async function loadImageBitmap(imageUrl) {
  if (imageUrl.startsWith('data:')) {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.src = imageUrl;
      img.crossOrigin = 'Anonymous';
      img.onload = async () => { resolve(await createImageBitmap(img)); };
      img.onerror = reject;
    });
  } else {
    const resp = await fetch(imageUrl, { mode: 'cors' });
    const blob = await resp.blob();
    return await createImageBitmap(blob);
  }
}

createVRControlPanel();
loadPointCloudFromStorage();

// LZString should be included in the HTML for the small localStorage backup support.

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

  maxDimInput.addEventListener('input', () => {
    const v = parseInt(maxDimInput.value, 10);
    pcConfig.maxDimension = isNaN(v) ? 0 : Math.max(0, v);
    processImage(sessionStorage.getItem(LAST_IMAGE_KEY) || localStorage.getItem(LAST_IMAGE_KEY), { maxDimension: pcConfig.maxDimension });
  });

  clearBtn.addEventListener('click', async () => {
    await clearCacheAndStorage();
    // Remove renderer from DOM
    const container = document.getElementById('pointcloud-container');
    while (container.firstChild) container.firstChild.remove();
     // Reset config to ensure fresh load
    pcConfig.maxDimension = parseInt(document.getElementById('pc-max-dim').value) || 0;
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

// Render point cloud from pixel bytes (RGB8)
function renderPointCloudFromBytes(width, height, pixelBytes) {
  // Remove previous renderer if any
  const container = document.getElementById('pointcloud-container');
  while (container.firstChild) container.removeChild(container.firstChild);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 500);
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const geometry = new THREE.BufferGeometry();
  const numPixels = width * height;
  const vertices = new Float32Array(numPixels * 3);
  const colors = new Float32Array(numPixels * 3);

  let v = 0;
  for (let i = 0, p = 0; i < numPixels; i++, p += 3) {
    const r = pixelBytes[p];
    const g = pixelBytes[p + 1];
    const b = pixelBytes[p + 2];

    // Map pixel colors to 3D coordinates (keeps your previous color->position mapping)
    const x = ((r / 255) * 500 - 250) + (Math.random() - 0.5) * 10;
    const y = ((g / 255) * 500 - 250) + (Math.random() - 0.5) * 10;
    const z = ((b / 255) * 500 - 250) + (Math.random() - 0.5) * 10;

    vertices[v * 3 + 0] = x;
    vertices[v * 3 + 1] = y;
    vertices[v * 3 + 2] = z;

    colors[v * 3 + 0] = r / 255;
    colors[v * 3 + 1] = g / 255;
    colors[v * 3 + 2] = b / 255;

    v++;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  const material = new THREE.PointsMaterial({ size: 0.5, vertexColors: true });
  const points = new THREE.Points(geometry, material);
  scene.add(points);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableZoom = true;

  (function animate() {
    requestAnimationFrame(animate);
    points.rotation.x += 0.001;
    points.rotation.y += 0.001;
    controls.update();
    renderer.render(scene, camera);
  })();
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

// On load, ensure panel exists and try to render any cached data for current resolution
ensureControlPanel();
loadPointCloudFromStorage();

// LZString should be included in the HTML for the small localStorage backup support.

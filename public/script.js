// Binary pointcloud storage and rendering
// Handles packing pixels as RGB8 bytes, metadata in cache, optional gzip compression (requires pako), and a small UI for controls.

const CACHE_NAME = 'pointcloud-cache';
const BIN_KEY = '/pointcloud.bin';
const META_KEY = '/pointcloud.meta';
const LOCAL_STORAGE_KEY = 'pointcloudJsonBackup';

// Default config (0 = full resolution)
const pcConfig = {
  maxDimension: 0, // 0 = keep original, otherwise scale longest side to this
  compression: 'none' // 'none' or 'gzip'
};

// Create a simple control panel if not present in DOM
function ensureControlPanel() {
  if (document.getElementById('pc-control-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'pc-control-panel';
  panel.style.position = 'fixed';
  panel.style.top = '10px';
  panel.style.right = '10px';
  panel.style.background = 'rgba(255,255,255,0.9)';
  panel.style.border = '1px solid #ccc';
  panel.style.padding = '8px';
  panel.style.zIndex = 9999;
  panel.style.fontFamily = 'sans-serif';
  panel.style.fontSize = '13px';

  panel.innerHTML = `
    <div style="margin-bottom:6px;"><strong>PointCloud Controls</strong></div>
    <label>Max dimension (px, 0 = full): <input id="pc-max-dim" type="number" min="0" value="${pcConfig.maxDimension}" style="width:80px;" /></label>
    <div style="height:6px"></div>
    <label>Compression: 
      <select id="pc-compression">
        <option value="none">None</option>
        <option value="gzip">gzip (pako)</option>
      </select>
    </label>
    <div style="height:6px"></div>
    <button id="pc-clear-cache">Clear Cache</button>
  `;

  document.body.appendChild(panel);

  const maxDimInput = document.getElementById('pc-max-dim');
  const compSelect = document.getElementById('pc-compression');
  const clearBtn = document.getElementById('pc-clear-cache');

  maxDimInput.addEventListener('change', () => {
    const v = parseInt(maxDimInput.value, 10);
    pcConfig.maxDimension = isNaN(v) ? 0 : Math.max(0, v);
    console.log('pcConfig.maxDimension =', pcConfig.maxDimension);
  });

  compSelect.value = pcConfig.compression;
  compSelect.addEventListener('change', () => {
    pcConfig.compression = compSelect.value;
    console.log('pcConfig.compression =', pcConfig.compression);
    if (pcConfig.compression === 'gzip' && !window.pako) {
      console.warn('gzip compression selected but pako not found. Falling back to none at storage time.');
    }
  });

  clearBtn.addEventListener('click', async () => {
    await clearCacheAndStorage();
    alert('Cache and localStorage backup cleared.');
  });
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

async function storeBinaryToCache(pixelBytes, width, height, compression = 'none') {
  try {
    const cache = await caches.open(CACHE_NAME);

    // Create meta
    const meta = { width, height, compression, format: 'rgb8' };
    await cache.put(META_KEY, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));

    let toStore;
    if (compression === 'gzip' && window.pako) {
      console.log('Compressing pixel bytes with pako.gzip...');
      const gz = window.pako.gzip(pixelBytes);
      toStore = new Uint8Array(gz).buffer;
    } else {
      if (compression === 'gzip' && !window.pako) {
        console.warn('gzip selected but pako not available. Storing uncompressed.');
      }
      toStore = pixelBytes.buffer;
    }

    await cache.put(BIN_KEY, new Response(toStore, { headers: { 'Content-Type': 'application/octet-stream' } }));
    console.log('Stored pointcloud binary and meta to Cache API');

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

async function readBinaryFromCache() {
  // Try Cache API
  if ('caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const metaResp = await cache.match(META_KEY);
      const binResp = await cache.match(BIN_KEY);
      if (metaResp && binResp) {
        const meta = await metaResp.json();
        const ab = await binResp.arrayBuffer();
        let pixelBytes;
        if (meta.compression === 'gzip') {
          if (window.pako) {
            try {
              const decompressed = window.pako.ungzip(new Uint8Array(ab));
              pixelBytes = new Uint8Array(decompressed);
            } catch (e) {
              console.error('pako ungzip failed:', e);
              return null;
            }
          } else {
            console.warn('gzip compressed data found but pako not available');
            return null;
          }
        } else {
          pixelBytes = new Uint8Array(ab);
        }

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
      await cache.delete(BIN_KEY);
      await cache.delete(META_KEY);
    }
  } catch (e) {
    console.warn('Failed clearing cache:', e);
  }
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
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
  const data = await readBinaryFromCache();
  if (data) {
    renderPointCloudFromBytes(data.width, data.height, data.pixels);
  } else {
    console.error('No pointcloud data found in cache/localStorage.');
  }
}

// Process image: draw to canvas, optional downscale, pack, and store
async function processImage(imageUrl, options = {}) {
  try {
    ensureControlPanel();

    const maxDim = (typeof options.maxDimension === 'number') ? options.maxDimension : pcConfig.maxDimension;
    const compression = options.compression || pcConfig.compression || 'none';

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
    await storeBinaryToCache(pixelBytes, targetWidth, targetHeight, compression);
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

// On load, ensure panel exists and try to render any cached data
ensureControlPanel();
loadPointCloudFromStorage();

// LZString and optionally pako should be included in the HTML for compression support.
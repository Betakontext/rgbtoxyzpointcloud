document.getElementById('fileInput').addEventListener('change', async function (event) {
  const file = event.target.files[0];
  if (!file) return;

  // Accept any image/* MIME type
  if (!file.type || !file.type.startsWith('image/')) {
    alert('Please upload an image file.');
    return;
  }

  // Optional: warn for very large files
  const maxWarnBytes = 10 * 1024 * 1024; // 10 MB
  if (file.size > maxWarnBytes) {
    if (!confirm('This image is large and may consume significant memory. Continue?')) {
      return;
    }
  }

  // Clear previous storage before starting a new upload (nur Punktwolken-Dateien)
  try {
    if ('caches' in window) {
      try {
        const cache = await caches.open('pointcloud-cache');
        const keys = await cache.keys();
        for (const req of keys) {
          const url = req.url || '';
          if (url.includes('/pointcloud_') || url.includes('/pointcloud_meta_')) {
            await cache.delete(req);
          }
        }
        console.log('Cleared cached pointcloud files');
      } catch (e) {
        console.warn('Failed to clear cache entry:', e);
      }
    }
    localStorage.removeItem('pointcloudJsonBackup');
    sessionStorage.removeItem('pc_last_image_dataurl');
    localStorage.removeItem('pc_last_image_dataurl');
  } catch (e) {
    console.warn('Error clearing previous storage:', e);
  }

  const reader = new FileReader();
  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = 'block';

  reader.onload = async function (e) {
    const imageUrl = e.target.result; // Data URL
    // <-- 1️⃣  URL (egal ob Data‑URL oder Remote‑URL) sichern -->
    await storeLastImageUrl(imageUrl);               // <‑‑ neue Hilfs‑Funktion

    // persist last image data so reloads/resolution-changes work without re-upload
    try {
      sessionStorage.setItem('pc_last_image_dataurl', imageUrl);
    } catch (err) {
      try { localStorage.setItem('pc_last_image_dataurl', imageUrl); } catch (e2) {}
    }

    // Read UI controls if present to pass as options
    const maxDimEl = document.getElementById('pc-max-dim');
    const options = {};
    if (maxDimEl) {
      const v = parseInt(maxDimEl.value, 10);
      options.maxDimension = isNaN(v) ? 0 : Math.max(0, v);
    }

    // Process the image directly from the Data URL
    await processImage(imageUrl, options);

    if (loadingEl) loadingEl.style.display = 'none';
    const msg = document.getElementById('message');
    if (msg) msg.innerText = 'Image processed locally.';
  };

  reader.onerror = function () {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
    const msg = document.getElementById('message');
    if (msg) msg.innerText = 'Error reading file.';
    alert('Error reading file.');
  };

  reader.readAsDataURL(file); // Read file as Data URL for browser compatibility
});



/* --------------------------------------------------------------
   2️⃣  Bild‑von‑URL laden
   -------------------------------------------------------------- */
document.getElementById('loadUrlBtn').addEventListener('click', async () => {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) {
    alert('Bitte eine Bild‑URL eingeben.');
    return;
  }

  // (optional) einfacher Check, dass es sich um eine http(s)‑URL handelt
  if (!/^https?:\/\//i.test(url)) {
    alert('Bitte eine gültige http/https‑URL eingeben.');
    return;
  }

  // UI‑Feedback
  const loadingEl = document.getElementById('loading');
  loadingEl.style.display = 'block';
  document.getElementById('message').innerText = '';

  // Max‑Dimension aus dem UI‑Panel übernehmen (wie beim Dateiupload)
  const maxDimEl = document.getElementById('pc-max-dim');
  const options = {};
  if (maxDimEl) {
    const v = parseInt(maxDimEl.value, 10);
    options.maxDimension = isNaN(v) ? 0 : Math.max(0, v);
  }

  try {
    // 1️⃣  URL in den „letzten Bild‑Key“ schreiben
    await storeLastImageUrl(url);                 // <‑‑ neue Hilfs‑Funktion

    // 2️⃣  Bild verarbeiten – `processImage` kann sowohl Data‑URLs
    //     als auch reguläre URLs (CORS‑fähig) verarbeiten.
    await processImage(url, options);
    document.getElementById('message').innerText = 'Bild von URL geladen.';
  } catch (e) {
    console.error(e);
    alert('Fehler beim Laden des Bildes von der URL.');
  } finally {
    loadingEl.style.display = 'none';
  }
});

/**
 * Speichert die zuletzt geladene Bild‑URL (Data‑URL oder Remote‑URL)
 * im Session‑ bzw. Local‑Storage, damit sie nach einem Reload oder
 * nach einer Änderung der Max‑Dimension wieder verwendet werden kann.
 */
async function storeLastImageUrl(url) {
  try {
    sessionStorage.setItem('pc_last_image_dataurl', url);
  } catch {
    // Fallback, falls Session‑Storage nicht verfügbar ist
    try { localStorage.setItem('pc_last_image_dataurl', url); } catch {}
  }
}

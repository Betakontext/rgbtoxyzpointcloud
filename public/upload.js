/*
# For further developments and participations
# visit and fork: https://github.com/betakontext/rgbtoxyzpointcloud
# Copyright (c) 2026 Christoph Medicus
# Licensed under the MIT License


=====================================================================
  upload.js – File upload + load image from URL
  (bind all listeners only after DOM ready, robust ID handling)
  + Indirect URL resolution (Wikipedia/Wikimedia + generic via og:image)
  + VR-optimized thumbnails from Wikimedia (more performant for Quest)
  + Improved error logs and CORS hints
=====================================================================*/

document.addEventListener('DOMContentLoaded', () => {
  /* --------------------------------------------------------------
     1️⃣  Helper functions
     -------------------------------------------------------------- */

  async function clearPreviousPointcloudStorage() {
    try {
      if ('caches' in window) {
        const cache = await caches.open('pointcloud-cache');
        const keys = await cache.keys();
        for (const req of keys) {
          const url = req.url || '';
          if (url.includes('/pointcloud_') || url.includes('/pointcloud_meta_')) {
            await cache.delete(req);
          }
        }
        console.log('[PC] old point-cloud cache entries deleted');
      }
    } catch (e) {
      console.warn('[PC] cache clearing failed', e);
    }

    try {
      localStorage.removeItem('pointcloudJsonBackup');
      sessionStorage.removeItem('pc_last_image_dataurl');
      localStorage.removeItem('pc_last_image_dataurl');
    } catch (e) {
      console.warn('[PC] localStorage clearing failed', e);
    }
  }

  function storeLastImageUrl(url) {
    try {
      sessionStorage.setItem('pc_last_image_dataurl', url);
    } catch {
      try { localStorage.setItem('pc_last_image_dataurl', url); } catch {}
    }
  }

  function getMaxDimensionFromUI() {
    const maxDimEl = document.getElementById('pc-max-dim');
    if (!maxDimEl) return 0;
    const v = parseInt(maxDimEl.value, 10);
    return isNaN(v) ? 0 : Math.max(0, v);
  }

  /* --------------------------------------------------------------
     1.1  XR detection (for VR-optimized thumbnails)
     -------------------------------------------------------------- */

  async function isXRAvailable() {
    if (!('navigator' in window) || !('xr' in navigator)) return false;
    try {
      if (navigator.xr.isSessionSupported) {
        return await navigator.xr.isSessionSupported('immersive-vr');
      }
    } catch (e) {
      return true;
    }
    return false;
  }

  /* --------------------------------------------------------------
     1.2  URL resolution: indirect → direct image URL
     -------------------------------------------------------------- */

  function looksLikeImageURL(u) {
    return /\.(png|jpe?g|gif|webp|bmp|avif|tiff?)($|\?)/i.test(u);
  }

  async function fetchAsDocument(url) {
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  async function resolveGenericPageImage(url) {
    try {
      const doc = await fetchAsDocument(url);

      const og = doc.querySelector('meta[property="og:image"]');
      if (og?.content) return new URL(og.content, url).href;

      const tw = doc.querySelector('meta[name="twitter:image"]');
      if (tw?.content) return new URL(tw.content, url).href;

      const link = doc.querySelector('link[rel="image_src"]');
      if (link?.href) return new URL(link.href, url).href;

      const img = doc.querySelector('img[src]');
      if (img?.getAttribute('src')) {
        const abs = new URL(img.getAttribute('src'), url).href;
        if (looksLikeImageURL(abs)) return abs;
      }
      return null;
    } catch (e) {
      console.warn('[resolveGenericPageImage] error:', e);
      throw e;
    }
  }

  // Detect common error types and show a hint
  function isLikelyCORSError(err) {
    const msg = String(err && (err.message || err)).toLowerCase();
    return (
      msg.includes('cors') ||
      msg.includes('taint') ||
      msg.includes('securityerror') ||
      msg.includes('cross-origin') ||
      msg.includes('has been blocked by cors') ||
      (msg.includes('fetch') && msg.includes('failed')) ||
      (msg.includes('domexception') && (msg.includes('security') || msg.includes('operation is insecure')))
    );
  }

  function showCORSHint(url) {
    const hint =
      'The image could not be loaded/processed, likely due to missing CORS permissions of the source site.\n\n' +
      'What you can do:\n' +
      '• Use a direct image URL from a domain with CORS enabled (e.g., upload.wikimedia.org).\n' +
      '• For Wikipedia: Use the direct URL (Commons upload) or the media page that references the file.\n' +
      '• Alternatively: Later set up a small image proxy (server-side) to bypass CORS.\n\n' +
      'URL: ' + url;
    alert(hint);
  }

  // Extract file title from Wikipedia/Wikimedia URL (incl. #/media/…)
  function extractWikiFileTitleFromUrl(inputUrl) {
    try {
      const u = new URL(inputUrl, location.href);

      // Debug log: shows the fragment (everything after #)
      console.log('[Wiki] u.hash:', u.hash);

      // a) Fragment: #/media/File:XYZ (multilingual)
      if (u.hash) {
        const frag = decodeURIComponent(u.hash);
        const mFrag = frag.match(/#\/media\/(File|Datei|Fichier|Archivo|Date|Arquivo|Ficheiro|Файл|ファイル|파일):([^?#]+)/i);
        if (mFrag && mFrag[2]) return mFrag[2];
      }

      // b) Path: /wiki/File:XYZ (multilingual)
      const path = decodeURIComponent(u.pathname);
      const mPath = path.match(/\/(wiki|w)\/(File|Datei|Fichier|Archivo|Date|Arquivo|Ficheiro|Файл|ファイル|파일):([^/?#]+)/i);
      if (mPath && mPath[3]) return mPath[3];

      return null;
    } catch {
      return null;
    }
  }

  async function resolveViaWikimediaAPIByTitleOriginal(fileTitle) {
    try {
      const api = 'https://commons.wikimedia.org/w/api.php'
        + `?origin=*`
        + `&action=query&titles=File:${encodeURIComponent(fileTitle)}`
        + `&prop=imageinfo&iiprop=url&format=json`;
      const resp = await fetch(api);
      if (!resp.ok) throw new Error(`Wikimedia API HTTP ${resp.status}`);
      const data = await resp.json();
      const pages = data?.query?.pages || {};
      const page = Object.values(pages)[0];
      const url = page?.imageinfo?.[0]?.url;
      return url || null;
    } catch (e) {
      console.warn('[resolveViaWikimediaAPIByTitleOriginal] error:', e);
      return null;
    }
  }

  async function resolveViaWikimediaAPIByTitleThumb(fileTitle, width = 1024) {
    try {
      const api = 'https://commons.wikimedia.org/w/api.php'
        + `?origin=*`
        + `&action=query&titles=File:${encodeURIComponent(fileTitle)}`
        + `&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=${encodeURIComponent(width)}&format=json`;
      const resp = await fetch(api);
      if (!resp.ok) throw new Error(`Wikimedia API HTTP ${resp.status}`);
      const data = await resp.json();
      const pages = data?.query?.pages || {};
      const page = Object.values(pages)[0];
      const thumb = page?.imageinfo?.[0]?.thumburl;
      const orig = page?.imageinfo?.[0]?.url;
      return thumb || orig || null;
    } catch (e) {
      console.warn('[resolveViaWikimediaAPIByTitleThumb] error:', e);
      return null;
    }
  }

  async function resolveWikipediaImage(url, { preferThumbnail = false, thumbWidth = 1024 } = {}) {
    try {
      // Already a direct upload URL?
      if (/^https?:\/\/upload\.wikimedia\.org\//i.test(url) && looksLikeImageURL(url)) {
        console.log('[Wiki] already direct upload URL');
        return url;
      }

      const fileTitle = extractWikiFileTitleFromUrl(url);
      console.log('[Wiki] extracted file title:', fileTitle);
      if (!fileTitle) {
        throw new Error('Could not extract Wikipedia file title (fragment/path).');
      }

      if (preferThumbnail) {
        const thumb = await resolveViaWikimediaAPIByTitleThumb(fileTitle, thumbWidth);
        console.log('[Wiki] API thumb url:', thumb);
        if (thumb) return thumb;
      }

      const original = await resolveViaWikimediaAPIByTitleOriginal(fileTitle);
      console.log('[Wiki] API original url:', original);
      if (original) return original;

      // NO HTML fetch from en.wikipedia.org anymore (CORS)!
      // throw instead of fallback to HTML:
      throw new Error('Wikipedia: No image URL returned by the Commons API.');
    } catch (e) {
      console.warn('[resolveWikipediaImage] error:', e);
      throw e; // propagate outward so the button-catch handles it
    }
  }



  async function resolveImageUrl(inputUrl) {
    if (looksLikeImageURL(inputUrl)) return inputUrl;

    let u;
    try {
      u = new URL(inputUrl, location.href);
    } catch {
      throw new Error('Invalid URL.');
    }

    const xr = await isXRAvailable();
    console.log('[resolveImageUrl] xr available:', xr);

    if (/wikipedia\.org|wikimedia\.org/i.test(u.hostname)) {
      const uiMax = getMaxDimensionFromUI();
      const thumbWidth = uiMax > 0 ? uiMax : 1024;
      const w = await resolveWikipediaImage(u.href, { preferThumbnail: xr, thumbWidth });
      if (w) return w;
      throw new Error('Wikipedia resolver returned no URL.');
    }

    const gen = await resolveGenericPageImage(u.href);
    console.log('[resolveImageUrl] generic og:image:', gen);
    if (gen) return gen;

    throw new Error('Could not resolve indirect URL to a direct image URL (CORS/meta tags missing?).');
  }

  /* --------------------------------------------------------------
     2️⃣  File upload (existing)
     -------------------------------------------------------------- */
  const fileInput = document.getElementById('fileInput');
  fileInput.addEventListener('change', async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type || !file.type.startsWith('image/')) {
      alert('Please select an image.');
      return;
    }

    const maxWarnBytes = 10 * 1024 * 1024; // 10 MiB
    if (file.size > maxWarnBytes && !confirm('The file is >10 MiB. Continue?')) {
      return;
    }

    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'block';

    const reader = new FileReader();
    reader.onload = async e => {
      const imageUrl = e.target.result; // data URL

      storeLastImageUrl(imageUrl);

      const options = { maxDimension: getMaxDimensionFromUI() };
      try {
        await processImage(imageUrl, options);
        const msg = document.getElementById('message');
        if (msg) msg.textContent = 'Image processed.';
      } catch (err) {
        console.error('[Upload] error in processImage:', err);
        alert('Error while processing the image.');
      } finally {
        if (loadingEl) loadingEl.style.display = 'none';
      }
    };

    reader.onerror = () => {
      if (loadingEl) loadingEl.style.display = 'none';
      const msg = document.getElementById('message');
      if (msg) msg.textContent = 'Error reading the file.';
      alert('Error reading the file.');
    };

    reader.readAsDataURL(file);
  });

  /* --------------------------------------------------------------
     3️⃣  Load image from URL (with indirect URL resolution)
     -------------------------------------------------------------- */
  const loadUrlBtn = document.getElementById('loadUrlBtn');
  loadUrlBtn.addEventListener('click', async () => {
    const urlInput = document.getElementById('imageUrlInput');
    if (!urlInput) { alert('URL input field not found.'); return; }

    const raw = urlInput.value.trim();
    if (!raw) { alert('Please enter an image URL.'); return; }
    if (!/^https?:\/\//i.test(raw)) { alert('Please enter a valid http/https URL.'); return; }

    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'block';
    const msgEl = document.getElementById('message');
    if (msgEl) msgEl.textContent = '';

    try {
      // 1) Indirect URL → direct image URL
      const directUrl = await resolveImageUrl(raw);
      console.log('[URL] resolved →', directUrl);

      // 2) Process image (own catch in case Canvas/CORS fails only here)
      storeLastImageUrl(directUrl);
      const options = { maxDimension: getMaxDimensionFromUI() };
      try {
        await processImage(directUrl, options);
      } catch (e2) {
        console.error('[processImage] error for', directUrl, e2);
        if (isLikelyCORSError(e2)) {
          if (msgEl) msgEl.textContent = 'Loading failed (CORS). See hint for details.';
          showCORSHint(directUrl);
        } else {
          if (msgEl) msgEl.textContent = 'Loading failed. See hint for details.';
          alert('Error while processing the image.\n\nDetails: ' + (e2?.message || e2));
        }
        return;
      }

      if (msgEl) msgEl.textContent = 'Image loaded from URL.';
    } catch (e) {
      console.error('[URL load] error:', e);

      if (isLikelyCORSError(e)) {
        if (msgEl) msgEl.textContent = 'Loading failed (CORS). See hint for details.';
        showCORSHint(raw);
      } else {
        if (msgEl) msgEl.textContent = 'Loading failed. See hint for details.';
        alert('Could not load/process the image.\n\nDetails: ' + (e?.message || e));
      }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  });

    /* --------------------------------------------------------------
     Example thumbnail loader
     -------------------------------------------------------------- */
    const thumbsWrap = document.getElementById('sample-thumbs');
    if (thumbsWrap) {
      thumbsWrap.addEventListener('click', async (ev) => {
        const target = ev.target;
        if (!(target instanceof HTMLImageElement)) return;

        const fullUrl = target.getAttribute('data-image');
        if (!fullUrl) return;

        const loadingEl = document.getElementById('loading');
        const msgEl = document.getElementById('message');
        if (loadingEl) loadingEl.style.display = 'block';
        if (msgEl) msgEl.textContent = '';

        try {
          // If an indirect URL is provided, resolve it here.
          const directUrl = await resolveImageUrl(fullUrl);
          console.log('[Thumb] resolved →', directUrl);

          storeLastImageUrl(directUrl);
          const options = { maxDimension: getMaxDimensionFromUI() };

          try {
            await processImage(directUrl, options);
          } catch (e2) {
            console.error('[Thumb/processImage] error', e2);
            if (isLikelyCORSError(e2)) {
              if (msgEl) msgEl.textContent = 'Loading failed (CORS). See hint for details.';
              showCORSHint(directUrl);
            } else {
              if (msgEl) msgEl.textContent = 'Loading failed. See hint for details.';
              alert('Error while processing the image.\n\nDetails: ' + (e2?.message || e2));
            }
            return;
          }

          if (msgEl) msgEl.textContent = 'Sample image loaded.';
        } catch (e) {
          console.error('[Thumb] load error', e);
          if (isLikelyCORSError(e)) {
            if (msgEl) msgEl.textContent = 'Loading failed (CORS). See hint for details.';
            showCORSHint(fullUrl);
          } else {
            if (msgEl) msgEl.textContent = 'Loading failed. See hint for details.';
            alert('Could not load/process the image.\n\nDetails: ' + (e?.message || e));
          }
        } finally {
          if (loadingEl) loadingEl.style.display = 'none';
        }
      });
  }
});

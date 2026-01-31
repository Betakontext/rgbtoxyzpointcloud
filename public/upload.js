/*=====================================================================
  upload.js –  Datei‑Upload + Bild‑von‑URL‑Upload
  (alle Listener erst nach DOM‑Ready, robustes ID‑Handling)
  + Indirekte URL-Auflösung (Wikipedia/Wikimedia + generisch via og:image)
  + VR-optimierte Thumbnails von Wikimedia (performanter für Quest)
  + Verbesserte Fehler-Logs und CORS-Hinweise
=====================================================================*/

document.addEventListener('DOMContentLoaded', () => {
  /* --------------------------------------------------------------
     1️⃣  Hilfs‑Funktionen (bestehend)
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
        console.log('[PC] alte Point‑Cloud‑Cache‑Einträge gelöscht');
      }
    } catch (e) {
      console.warn('[PC] Cache‑Löschung fehlgeschlagen', e);
    }

    try {
      localStorage.removeItem('pointcloudJsonBackup');
      sessionStorage.removeItem('pc_last_image_dataurl');
      localStorage.removeItem('pc_last_image_dataurl');
    } catch (e) {
      console.warn('[PC] localStorage‑Löschung fehlgeschlagen', e);
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
     1.1  XR‑Erkennung (für VR-optimierte Thumbnails)
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
     1.2  URL‑Auflösung: indirekte → direkte Bild‑URL
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
      console.warn('[resolveGenericPageImage] Fehler:', e);
      throw e;
    }
  }

  // Fehlertypen erkennen und Hinweis zeigen
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
      'Das Bild konnte nicht geladen/verarbeitet werden, wahrscheinlich wegen fehlender CORS-Freigabe der Quellseite.\n\n' +
      'Was du tun kannst:\n' +
      '• Nutze eine direkte Bild-URL von einer Domain mit CORS-Freigabe (z. B. upload.wikimedia.org).\n' +
      '• Bei Wikipedia: Verwende die Direkt-URL (Commons-Upload) oder die Medienseite, die auf die Datei verweist.\n' +
      '• Alternativ: Richte später einen kleinen Bild-Proxy ein (Server-seitig), um CORS zu umgehen.\n\n' +
      'URL: ' + url;
    alert(hint);
  }

  // Datei-Titel aus Wikipedia-/Wikimedia-URL extrahieren (inkl. #/media/…)
  function extractWikiFileTitleFromUrl(inputUrl) {
    try {
      const u = new URL(inputUrl, location.href);

      // Debug-Log: zeigt das Fragment (alles hinter #)
      console.log('[Wiki] u.hash:', u.hash);

      // a) Fragment: #/media/File:XYZ (mehrsprachig)
      if (u.hash) {
        const frag = decodeURIComponent(u.hash);
        const mFrag = frag.match(/#\/media\/(File|Datei|Fichier|Archivo|Date|Arquivo|Ficheiro|Файл|ファイル|파일):([^?#]+)/i);
        if (mFrag && mFrag[2]) return mFrag[2];
      }

      // b) Pfad: /wiki/File:XYZ (mehrsprachig)
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
      console.warn('[resolveViaWikimediaAPIByTitleOriginal] Fehler:', e);
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
      console.warn('[resolveViaWikimediaAPIByTitleThumb] Fehler:', e);
      return null;
    }
  }

  async function resolveWikipediaImage(url, { preferThumbnail = false, thumbWidth = 1024 } = {}) {
    try {
      // Bereits eine direkte Upload-URL?
      if (/^https?:\/\/upload\.wikimedia\.org\//i.test(url) && looksLikeImageURL(url)) {
        console.log('[Wiki] already direct upload URL');
        return url;
      }

      const fileTitle = extractWikiFileTitleFromUrl(url);
      console.log('[Wiki] extracted file title:', fileTitle);
      if (!fileTitle) {
        throw new Error('Wikipedia-Dateititel konnte nicht extrahiert werden (Fragment/Pfad).');
      }

      if (preferThumbnail) {
        const thumb = await resolveViaWikimediaAPIByTitleThumb(fileTitle, thumbWidth);
        console.log('[Wiki] API thumb url:', thumb);
        if (thumb) return thumb;
      }

      const original = await resolveViaWikimediaAPIByTitleOriginal(fileTitle);
      console.log('[Wiki] API original url:', original);
      if (original) return original;

      // KEIN HTML-Fetch von en.wikipedia.org mehr (CORS)!
      // throw statt Fallback auf HTML:
      throw new Error('Wikipedia: Keine Bild-URL von der Commons-API erhalten.');
    } catch (e) {
      console.warn('[resolveWikipediaImage] Fehler:', e);
      throw e; // nach außen geben, damit der Button-catch greift
    }
  }



  async function resolveImageUrl(inputUrl) {
    if (looksLikeImageURL(inputUrl)) return inputUrl;

    let u;
    try {
      u = new URL(inputUrl, location.href);
    } catch {
      throw new Error('Ungültige URL.');
    }

    const xr = await isXRAvailable();
    console.log('[resolveImageUrl] xr available:', xr);

    if (/wikipedia\.org|wikimedia\.org/i.test(u.hostname)) {
      const uiMax = getMaxDimensionFromUI();
      const thumbWidth = uiMax > 0 ? uiMax : 1024;
      const w = await resolveWikipediaImage(u.href, { preferThumbnail: xr, thumbWidth });
      if (w) return w;
      throw new Error('Wikipedia-Resolver gab keine URL zurück.');
    }

    const gen = await resolveGenericPageImage(u.href);
    console.log('[resolveImageUrl] generic og:image:', gen);
    if (gen) return gen;

    throw new Error('Konnte indirekte URL nicht in eine direkte Bild‑URL auflösen (CORS/Meta‑Tags fehlen?).');
  }

  /* --------------------------------------------------------------
     2️⃣  Datei‑Upload (bestehend)
     -------------------------------------------------------------- */
  const fileInput = document.getElementById('fileInput');
  fileInput.addEventListener('change', async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type || !file.type.startsWith('image/')) {
      alert('Bitte ein Bild auswählen.');
      return;
    }

    const maxWarnBytes = 10 * 1024 * 1024; // 10 MiB
    if (file.size > maxWarnBytes && !confirm('Die Datei ist >10 MiB. Weiter?')) {
      return;
    }

    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'block';

    const reader = new FileReader();
    reader.onload = async e => {
      const imageUrl = e.target.result; // Data‑URL

      storeLastImageUrl(imageUrl);

      const options = { maxDimension: getMaxDimensionFromUI() };
      try {
        await processImage(imageUrl, options);
        const msg = document.getElementById('message');
        if (msg) msg.textContent = 'Bild verarbeitet.';
      } catch (err) {
        console.error('[Upload] Fehler bei processImage:', err);
        alert('Fehler beim Verarbeiten des Bildes.');
      } finally {
        if (loadingEl) loadingEl.style.display = 'none';
      }
    };

    reader.onerror = () => {
      if (loadingEl) loadingEl.style.display = 'none';
      const msg = document.getElementById('message');
      if (msg) msg.textContent = 'Fehler beim Lesen der Datei.';
      alert('Fehler beim Lesen der Datei.');
    };

    reader.readAsDataURL(file);
  });

  /* --------------------------------------------------------------
     3️⃣  Bild‑von‑URL‑Upload (mit indirekter URL‑Auflösung)
     -------------------------------------------------------------- */
  const loadUrlBtn = document.getElementById('loadUrlBtn');
  loadUrlBtn.addEventListener('click', async () => {
    const urlInput = document.getElementById('imageUrlInput');
    if (!urlInput) { alert('URL‑Eingabefeld nicht gefunden.'); return; }

    const raw = urlInput.value.trim();
    if (!raw) { alert('Bitte eine Bild‑URL eingeben.'); return; }
    if (!/^https?:\/\//i.test(raw)) { alert('Bitte eine gültige http/https‑URL eingeben.'); return; }

    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'block';
    const msgEl = document.getElementById('message');
    if (msgEl) msgEl.textContent = '';

    try {
      // 1) Indirekte URL → direkte Bild-URL
      const directUrl = await resolveImageUrl(raw);
      console.log('[URL] resolved →', directUrl);

      // 2) Bild verarbeiten (eigener Catch, falls Canvas/CORS erst hier knallt)
      storeLastImageUrl(directUrl);
      const options = { maxDimension: getMaxDimensionFromUI() };
      try {
        await processImage(directUrl, options);
      } catch (e2) {
        console.error('[processImage] error for', directUrl, e2);
        if (isLikelyCORSError(e2)) {
          if (msgEl) msgEl.textContent = 'Laden fehlgeschlagen (CORS). Details siehe Hinweis.';
          showCORSHint(directUrl);
        } else {
          if (msgEl) msgEl.textContent = 'Laden fehlgeschlagen. Details siehe Hinweis.';
          alert('Fehler bei der Bildverarbeitung.\n\nDetails: ' + (e2?.message || e2));
        }
        return;
      }

      if (msgEl) msgEl.textContent = 'Bild von URL geladen.';
    } catch (e) {
      console.error('[URL‑Laden] Fehler:', e);

      if (isLikelyCORSError(e)) {
        if (msgEl) msgEl.textContent = 'Laden fehlgeschlagen (CORS). Details siehe Hinweis.';
        showCORSHint(raw);
      } else {
        if (msgEl) msgEl.textContent = 'Laden fehlgeschlagen. Details siehe Hinweis.';
        alert('Konnte das Bild nicht laden/verarbeiten.\n\nDetails: ' + (e?.message || e));
      }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  });

    /* --------------------------------------------------------------
     Beispiel‑Thumbnail‑Loader
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
          // Falls mal eine indirekte URL hinterlegt ist, wird sie hier aufgelöst.
          const directUrl = await resolveImageUrl(fullUrl);
          console.log('[Thumb] resolved →', directUrl);

          storeLastImageUrl(directUrl);
          const options = { maxDimension: getMaxDimensionFromUI() };

          try {
            await processImage(directUrl, options);
          } catch (e2) {
            console.error('[Thumb/processImage] error', e2);
            if (isLikelyCORSError(e2)) {
              if (msgEl) msgEl.textContent = 'Laden fehlgeschlagen (CORS). Details siehe Hinweis.';
              showCORSHint(directUrl);
            } else {
              if (msgEl) msgEl.textContent = 'Laden fehlgeschlagen. Details siehe Hinweis.';
              alert('Fehler bei der Bildverarbeitung.\n\nDetails: ' + (e2?.message || e2));
            }
            return;
          }

          if (msgEl) msgEl.textContent = 'Beispielbild geladen.';
        } catch (e) {
          console.error('[Thumb] load error', e);
          if (isLikelyCORSError(e)) {
            if (msgEl) msgEl.textContent = 'Laden fehlgeschlagen (CORS). Details siehe Hinweis.';
            showCORSHint(fullUrl);
          } else {
            if (msgEl) msgEl.textContent = 'Laden fehlgeschlagen. Details siehe Hinweis.';
            alert('Konnte das Bild nicht laden/verarbeiten.\n\nDetails: ' + (e?.message || e));
          }
        } finally {
          if (loadingEl) loadingEl.style.display = 'none';
        }
      });
  }
});

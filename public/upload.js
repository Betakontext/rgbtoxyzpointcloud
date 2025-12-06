/*=====================================================================
  upload.js –  Datei‑Upload + Bild‑von‑URL‑Upload
  (alle Listener werden erst nach DOM‑Ready registriert)
=====================================================================*/

document.addEventListener('DOMContentLoaded', () => {
  /* --------------------------------------------------------------
     1️⃣  Datei‑Upload (unverändert, nur leicht umstrukturiert)
     -------------------------------------------------------------- */
  const fileInput = document.getElementById('fileInput');
  fileInput.addEventListener('change', async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    // Nur Bild‑MIME‑Typen zulassen
    if (!file.type || !file.type.startsWith('image/')) {
      alert('Bitte ein Bild auswählen.');
      return;
    }

    // Optional: Warnung bei sehr großen Dateien
    const maxWarnBytes = 10 * 1024 * 1024; // 10 MiB
    if (file.size > maxWarnBytes && !confirm('Die Datei ist >10 MiB. Weiter?')) {
      return;
    }

    // ---- Vorherige Point‑Cloud‑Daten entfernen -----------------
    await clearPreviousPointcloudStorage();

    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'block';

    const reader = new FileReader();
    reader.onload = async e => {
      const imageUrl = e.target.result; // Data‑URL

      // ---- URL (Data‑URL) für Reloads sichern -----------------
      storeLastImageUrl(imageUrl);

      // ---- UI‑Optionen (Max‑Dimension) auslesen ---------------
      const maxDimEl = document.getElementById('pc-max-dim');
      const options = {};
      if (maxDimEl) {
        const v = parseInt(maxDimEl.value, 10);
        options.maxDimension = isNaN(v) ? 0 : Math.max(0, v);
      }

      // ---- Bild verarbeiten ------------------------------------
      await processImage(imageUrl, options);

      // ---- UI zurücksetzen ------------------------------------
      if (loadingEl) loadingEl.style.display = 'none';
      const msg = document.getElementById('message');
      if (msg) msg.innerText = 'Bild verarbeitet.';
    };

    reader.onerror = () => {
      if (loadingEl) loadingEl.style.display = 'none';
      const msg = document.getElementById('message');
      if (msg) msg.innerText = 'Fehler beim Lesen der Datei.';
      alert('Fehler beim Lesen der Datei.');
    };

    reader.readAsDataURL(file);
  });

  /* --------------------------------------------------------------
     2️⃣  Bild‑von‑URL‑Upload
     -------------------------------------------------------------- */
  const loadUrlBtn = document.getElementById('loadUrlBtn');
  loadUrlBtn.addEventListener('click', async () => {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) {
      alert('Bitte eine Bild‑URL eingeben.');
      return;
    }

    // Einfacher Check, dass es eine http(s)‑URL ist
    if (!/^https?:\/\//i.test(url)) {
      alert('Bitte eine gültige http/https‑URL eingeben.');
      return;
    }

    const loadingEl = document.getElementById('loading');
    loadingEl.style.display = 'block';
    document.getElementById('message').innerText = '';

    // ---- Vorherige Point‑Cloud‑Daten entfernen (wie beim File‑Upload) ----
    await clearPreviousPointcloudStorage();

    // ---- Max‑Dimension aus UI übernehmen ---------------------------------
    const maxDimEl = document.getElementById('pc-max-dim');
    const options = {};
    if (maxDimEl) {
      const v = parseInt(maxDimEl.value, 10);
      options.maxDimension = isNaN(v) ? 0 : Math.max(0, v);
    }

    try {
      // ---- URL für Reloads sichern ------------------------------------
      storeLastImageUrl(url);

      // ---- Bild verarbeiten (processImage kann Data‑URL oder normale URL) ----
      await processImage(url, options);
      document.getElementById('message').innerText = 'Bild von URL geladen.';
    } catch (e) {
      console.error(e);
      alert('Fehler beim Laden des Bildes von der URL.');
    } finally {
      loadingEl.style.display = 'none';
    }
  });

  /* --------------------------------------------------------------
     3️⃣  Hilfs‑Funktionen
     -------------------------------------------------------------- */

  /**
   * Entfernt alle im Cache gespeicherten Point‑Cloud‑Dateien
   * und löscht die lokalen Back‑ups.  Wird vor jedem neuen Upload
   * (Datei oder URL) aufgerufen, damit kein altes Bild mehr im
   * Hintergrund liegt.
   */
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

    // Lokale Back‑ups entfernen
    try {
      localStorage.removeItem('pointcloudJsonBackup');
      sessionStorage.removeItem('pc_last_image_dataurl');
      localStorage.removeItem('pc_last_image_dataurl');
    } catch (e) {
      console.warn('[PC] localStorage‑Löschung fehlgeschlagen', e);
    }
  }

  /**
   * Speichert die zuletzt geladene Bild‑URL (Data‑URL oder echte
   * Remote‑URL) im Session‑ bzw. Local‑Storage, damit sie nach
   * einem Reload oder nach einer Änderung der Max‑Dimension wieder
   * verwendet werden kann.
   */
  function storeLastImageUrl(url) {
    try {
      sessionStorage.setItem('pc_last_image_dataurl', url);
    } catch {
      // Fallback, falls Session‑Storage nicht verfügbar ist
      try { localStorage.setItem('pc_last_image_dataurl', url); } catch {}
    }
  }
});

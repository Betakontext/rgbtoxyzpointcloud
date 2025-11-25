document.getElementById('fileInput').addEventListener('change', async function (event) {
    const file = event.target.files[0];
    const validFileTypes = ['image/jpeg', 'image/jpg', 'image/JPEG', 'image/JPG'];

    if (!file) {
        alert('Please select a file to upload.');
        return;
    }

    // Optional: keep MIME/type validation but remove the fixed size limit
    if (!validFileTypes.includes(file.type)) {
        alert('Please upload a valid JPEG image.');
        return;
    }

    // Clear previous cache entry before starting a new upload (if using cache API helpers from script.js)
    try {
        if (typeof removeJsonFromCache === 'function') {
            await removeJsonFromCache();
        }
    } catch (e) {
        console.warn('Could not clear cache before upload:', e);
    }

    const reader = new FileReader();
    document.getElementById('loading').style.display = 'block';

    reader.onload = async function (e) {
        document.getElementById('message').innerText = '';
        const imageDataUrl = e.target.result; // Data URL

        try {
            // Create an offscreen image and ImageBitmap for sizing
            const img = new Image();
            img.src = imageDataUrl;
            img.crossOrigin = 'Anonymous';

            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

            const imageBitmap = await createImageBitmap(img);
            let { width, height } = imageBitmap;

            // Estimate storage availability (may be undefined in some browsers)
            let freeBytes = null;
            try {
                if (navigator.storage && navigator.storage.estimate) {
                    const estimate = await navigator.storage.estimate();
                    if (estimate && typeof estimate.quota === 'number') {
                        const usage = typeof estimate.usage === 'number' ? estimate.usage : 0;
                        freeBytes = Math.max(0, estimate.quota - usage);
                    }
                }
            } catch (err) {
                console.warn('navigator.storage.estimate() failed:', err);
            }

            // Heuristic: processed JSON can be several times larger than the original file.
            // Use a conservative multiplier to estimate needed bytes for processed data.
            const HEURISTIC_MULTIPLIER = 6; // heuristic factor (adjustable)
            const approxNeeded = (file.size || (width * height)) * HEURISTIC_MULTIPLIER;

            let finalDataUrl = imageDataUrl; // default: original

            if (freeBytes !== null && freeBytes > 0 && freeBytes < approxNeeded) {
                // Not enough free space for the estimated processed size: compute required downscale
                // Aim to reduce pixel count proportionally to available space
                const usable = Math.floor(freeBytes * 0.9); // reserve some slack
                const scale = Math.sqrt(usable / approxNeeded);

                // Don't upscale; only downscale. If scale is very small, enforce a minimum size.
                const MIN_DIMENSION = 64;
                const targetScale = Math.max(Math.min(scale, 1), MIN_DIMENSION / Math.max(width, height));

                if (targetScale < 1) {
                    const targetW = Math.max(MIN_DIMENSION, Math.round(width * targetScale));
                    const targetH = Math.max(MIN_DIMENSION, Math.round(height * targetScale));

                    // Draw to a scaled canvas and get a new Data URL
                    const canvas = document.createElement('canvas');
                    canvas.width = targetW;
                    canvas.height = targetH;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(imageBitmap, 0, 0, targetW, targetH);

                    // Use JPEG output to reduce size; quality can be tuned (0.8 here)
                    finalDataUrl = canvas.toDataURL('image/jpeg', 0.8);

                    console.info(`Downscaled image from ${width}x${height} to ${targetW}x${targetH} to fit storage quota.`);
                    document.getElementById('message').innerText = `Image downscaled to ${targetW}×${targetH} to fit available storage.`;

                    // free up the ImageBitmap
                    try { imageBitmap.close(); } catch (ignored) {}
                } else {
                    // scale >= 1 (we have enough space) — no downscaling required
                }
            } else if (freeBytes === null) {
                // Could not determine quota — proceed but warn user that uploads may fail for very large files
                console.warn('Could not determine storage quota. Proceeding without adaptive downscaling.');
                document.getElementById('message').innerText = 'Proceeding without storage-availability checks.';
            }

            // Now hand off to the existing processing pipeline which expects a Data URL
            await processImage(finalDataUrl, true);

            document.getElementById('loading').style.display = 'none';
            if (!document.getElementById('message').innerText) {
                document.getElementById('message').innerText = 'Image processed locally.';
            }
        } catch (err) {
            console.error('Error during upload processing:', err);
            document.getElementById('message').innerText = 'Error processing image.';
            alert('Error processing image. See console for details.');
        } finally {
            document.getElementById('loading').style.display = 'none';
        }
    };

    reader.onerror = function () {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('message').innerText = 'Error reading file.';
        alert('Error reading file.');
    };

    reader.readAsDataURL(file); // Read file as Data URL for browser compatibility
});

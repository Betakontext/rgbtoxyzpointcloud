document.getElementById('fileInput').addEventListener('change', async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    // Accept any image/* MIME type
    if (!file.type || !file.type.startsWith('image/')) {
        alert('Please upload an image file.');
        return;
    }

    // Optional: warn for very large files, but continue (we permit large files because binary packing preserves full resolution)
    const maxWarnBytes = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxWarnBytes) {
        if (!confirm('This image is large and may consume significant memory. Continue?')) {
            return;
        }
    }

    // Clear previous storage before starting a new upload
    try {
        if ('caches' in window) {
            try {
                const cache = await caches.open('pointcloud-cache');
                await cache.delete('/pointcloud.bin');
                await cache.delete('/pointcloud.meta');
                console.log('Cleared cached pointcloud files');
            } catch (e) {
                console.warn('Failed to clear cache entry:', e);
            }
        }
        localStorage.removeItem('pointcloudJsonBackup');
    } catch (e) {
        console.warn('Error clearing previous storage:', e);
    }

    const reader = new FileReader();
    document.getElementById('loading').style.display = 'block';

    reader.onload = async function (e) {
        const imageUrl = e.target.result; // Data URL

        // Read UI controls if present to pass as options
        const maxDimEl = document.getElementById('pc-max-dim');
        const compEl = document.getElementById('pc-compression');

        const options = {};
        if (maxDimEl) {
            const v = parseInt(maxDimEl.value, 10);
            options.maxDimension = isNaN(v) ? 0 : Math.max(0, v);
        }
        if (compEl) {
            options.compression = compEl.value || 'none';
        }

        // Process the image directly from the Data URL
        await processImage(imageUrl, options);

        document.getElementById('loading').style.display = 'none';
        document.getElementById('message').innerText = 'Image processed locally.';
    };

    reader.onerror = function () {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('message').innerText = 'Error reading file.';
        alert('Error reading file.');
    };

    reader.readAsDataURL(file); // Read file as Data URL for browser compatibility
});
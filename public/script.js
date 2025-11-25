// Add at top of file
const CACHE_NAME = 'pointcloud-cache-v1';
const CACHE_KEY = '/pointcloud.json';

// Function to generate JSON data
function generateJson(pixelColors) {
    return JSON.stringify(pixelColors);
}

// Function to compress JSON data
function compressJson(json) {
    return LZString.compressToUTF16(json);
}

// Function to decompress JSON data
function decompressJson(compressedJson) {
    return LZString.decompressFromUTF16(compressedJson);
}

// Store compressed JSON in Cache API
async function storeJsonInCache(json, key = CACHE_KEY) {
    try {
        const compressedJson = compressJson(json);
        const cache = await caches.open(CACHE_NAME);
        const req = new Request(key);
        const res = new Response(compressedJson, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
        await cache.put(req, res);
    } catch (e) {
        console.error('Error storing JSON in cache:', e);
    }
}

// Read JSON data from Cache API
async function readJsonFromCache(key = CACHE_KEY) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const req = new Request(key);
        const res = await cache.match(req);
        if (!res) return null;
        const compressedJson = await res.text();
        const json = decompressJson(compressedJson);
        return JSON.parse(json);
    } catch (e) {
        console.error('Error reading JSON from cache:', e);
        return null;
    }
}

// Remove JSON from Cache API
async function removeJsonFromCache(key = CACHE_KEY) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const req = new Request(key);
        await cache.delete(req);
    } catch (e) {
        console.error('Error deleting JSON from cache:', e);
    }
}

// Function to render the point cloud
function renderPointCloud(pointCloudData) {
    // Create the scene
    const scene = new THREE.Scene();

    // Set up the camera with a perspective view
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 500); // Adjust the camera position

    // Set up the renderer and attach it to the document
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('pointcloud-container').appendChild(renderer.domElement); // Append to a specific container

    // Create geometry and arrays to hold vertices and colors
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];

    // Populate the arrays with data from the JSON file
    pointCloudData.forEach((color) => {
        const x = ((color[0] / 255) * 500 - 250) + (Math.random() - 0.5) * 10;
        const y = ((color[1] / 255) * 500 - 250) + (Math.random() - 0.5) * 10;
        const z = ((color[2] / 255) * 500 - 250) + (Math.random() - 0.5) * 10;

        // Validate that x, y, z are numbers and not NaN
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
            vertices.push(x, y, z);

            const r = color[0] / 255;
            const g = color[1] / 255;
            const b = color[2] / 255;
            colors.push(r, g, b);
        }
    });

    // Attach the vertices and colors to the geometry
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Compute bounding sphere to avoid NaN errors
    geometry.computeBoundingSphere();
    if (!geometry.boundingSphere || isNaN(geometry.boundingSphere.radius)) {
        console.error('Bounding sphere computation failed. Geometry has NaN values.');
        return;
    }

    // Create the material for the point cloud
    const material = new THREE.PointsMaterial({ size: 0.5, vertexColors: true });

    // Create the point cloud and add it to the scene
    const pointCloud = new THREE.Points(geometry, material);
    scene.add(pointCloud);

    // Set up orbit controls for the camera
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.enableRotate = true;

    // Define the animation loop to render the scene
    const animate = function () {
        requestAnimationFrame(animate);
        pointCloud.rotation.x += 0.001;
        pointCloud.rotation.y += 0.001;
        controls.update();
        renderer.render(scene, camera);
    };

    // Start the animation loop
    animate();
}

// Optionally clear local storage when the tab is closed (uncomment to enable clearing)
window.addEventListener('beforeunload', () => {
    // localStorage.removeItem('pointcloudJson');
});

// Update loadPointCloudFromStorage to be async and use cache
async function loadPointCloudFromStorage() {
    const storedPixelColors = await readJsonFromCache();
    if (storedPixelColors) {
        renderPointCloud(storedPixelColors);
    } else {
        console.error('No point cloud data found in cache.');
    }
}


// Function to check if a string is valid JSON
function isValidJson(json) {
    try {
        JSON.parse(json);
        return true;
    } catch (e) {
        return false;
    }
}

// Function to extract pixel colors from an image bitmap
function extractPixelColors(imageBitmap) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;

    context.drawImage(imageBitmap, 0, 0);

    const imageData = context.getImageData(0, 0, imageBitmap.width, imageBitmap.height);
    const data = imageData.data;

    const pixelColors = [];
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        pixelColors.push([r, g, b]);
    }

    return pixelColors;
}

// Update processImage to await cache storage and load
async function processImage(imageUrl, isLocal = false) {
    try {
        // Clear previous point cloud
        const container = document.getElementById('pointcloud-container');
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        let imageBitmap;

        if (isLocal || imageUrl.startsWith('data:')) {
            imageBitmap = await new Promise((resolve, reject) => {
                const img = new Image();
                img.src = imageUrl;
                img.crossOrigin = 'Anonymous';
                img.onload = async () => {
                    resolve(await createImageBitmap(img));
                };
                img.onerror = reject;
            });
        } else {
            const response = await fetch(imageUrl, {
                mode: 'cors',
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
            if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
            const blob = await response.blob();
            imageBitmap = await createImageBitmap(blob);
        }

        if (!imageBitmap) throw new Error('Failed to create image bitmap');

        const pixelColors = extractPixelColors(imageBitmap);
        const json = generateJson(pixelColors);
        if (isValidJson(json)) {
            await storeJsonInCache(json);           // <-- store in Cache API
            await loadPointCloudFromStorage();     // <-- await loading/rendering
        } else {
            console.error('Invalid JSON data:', json);
        }
    } catch (error) {
        console.error('Error processing image:', error);
    }
}

// If ever needed, wrap a loadPointCloud interface
async function loadPointCloud(imageUrl) {
    await processImage(imageUrl, true);
}

// Load the point cloud from the stored JSON data
loadPointCloudFromStorage();

// LZString should be included in the HTML <script>

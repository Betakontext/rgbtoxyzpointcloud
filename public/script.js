// Function to generate JSON data
function generateJson(pixelColors) {
    return JSON.stringify(pixelColors);
}

// Function to store JSON data in session storage
function storeJson(json, key = 'pointcloudJson') {
    try {
        sessionStorage.setItem(key, json);
    } catch (e) {
        console.error('Error storing JSON:', e);
    }
}


// Function to read JSON data from session storage
function readJson(key = 'pointcloudJson') {
    const json = sessionStorage.getItem(key);
    if (json) {
        try {
            return JSON.parse(json);
        } catch (e) {
            console.error('Error parsing JSON:', e);
            return null;
        }
    }
    return null;
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

// Ensure to clear the session storage when the tab is closed
window.addEventListener('beforeunload', () => {
    sessionStorage.removeItem('pointcloudJson');
});

// Function to load the point cloud from session storage
function loadPointCloudFromSession() {
    const storedPixelColors = readJson();
    if (storedPixelColors) {
        renderPointCloud(storedPixelColors);
    } else {
        console.error('No point cloud data found in session storage.');
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
        const g = data[i+1];
        const b = data[i+2];
        pixelColors.push([r, g, b]);
    }
    
    return pixelColors;
}

// Function to process the uploaded image
async function processImage(imageUrl) {
    try {
        console.log(imageUrl)
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
        }
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);
        
        // Ensure the imageBitmap is correctly created
        if (!imageBitmap) {
            throw new Error('Failed to create image bitmap');
        }

        // Assuming you have a function to extract pixel colors from the image
        const pixelColors = extractPixelColors(imageBitmap);

        const json = generateJson(pixelColors);
        if (isValidJson(json)) {
            storeJson(json);
            loadPointCloudFromSession(); // Load the point cloud from session storage
        } else {
            console.error('Invalid JSON data:', json);
        }
    } catch (error) {
        console.error('Error processing image:', error);
    }
}

// Example usage: Generate and store the JSON data
const examplePixelColors = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255]
];
const json = generateJson(examplePixelColors);
storeJson(json);

// Load the point cloud from the stored JSON data
loadPointCloudFromSession();

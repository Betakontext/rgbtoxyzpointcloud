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

// Function to upload JSON data to Supabase
async function uploadJsonToSupabase(json, fileName) {
    const supabaseUrl = 'https://unkpdsecvopwhxjodmag.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVua3Bkc2Vjdm9wd2h4am9kbWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxMzQ0NjksImV4cCI6MjA1MzcxMDQ2OX0.4M[...]
    const { createClient } = window.supabase;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const blob = new Blob([json], { type: 'application/json' });
    const { data, error } = await supabase.storage
        .from('images')
        .upload(`public/${fileName}`, blob);

    if (error) {
        throw error;
    }

    const { publicURL } = supabase.storage
        .from('images')
        .getPublicUrl(`public/${fileName}`);

    return publicURL;
}

// Function to load the point cloud from JSON data
async function loadPointCloud(jsonFilePath) {
    const storedPixelColors = readJson();

    if (storedPixelColors) {
        renderPointCloud(storedPixelColors);
    } else {
        try {
            const response = await fetch(jsonFilePath);
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            const data = await response.json();

            let pointCloudData;
            if (Array.isArray(data)) {
                pointCloudData = data; // It's already an array
            } else if (data && typeof data === 'object') {
                pointCloudData = Object.values(data); // Convert object values to an array
            } else {
                console.error('Unexpected data format:', data);
                return;
            }

            // Store JSON in session storage
            const json = generateJson(pointCloudData);
            storeJson(json);

            // Upload JSON to Supabase and get the public URL
            const fileName = 'pointcloud.json';
            const jsonUrl = await uploadJsonToSupabase(json, fileName);

            // Load the point cloud from the public URL
            renderPointCloud(pointCloudData);

            // Delete the JSON file from Supabase after usage (optional)
            await supabase.storage
                .from('images')
                .remove([`public/${fileName}`]);

        } catch (error) {
            console.error('Error loading JSON:', error);
        }
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

// Ensure to clear the session storage when the tab is closed
window.addEventListener('beforeunload', () => {
    sessionStorage.removeItem('pointcloudJson');
});

// Call loadPointCloud with the correct JSON file path from Supabase
loadPointCloud('https://unkpdsecvopwhxjodmag.supabase.co/storage/v1/object/public/images/pointcloud.json');

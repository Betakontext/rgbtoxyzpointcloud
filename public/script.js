function loadPointCloud(jsonFilePath) {
  fetch(jsonFilePath)
    .then(response => response.json())
    .then(data => {
      let pointCloudData;
      if (Array.isArray(data)) {
        pointCloudData = data; // It's already an array
      } else if (data && typeof data === 'object') {
        pointCloudData = Object.values(data); // Convert object values to an array
      } else {
        console.error('Unexpected data format:', data);
        return;
      }

      // Create the scene
      const scene = new THREE.Scene();

      // Set up the camera with a perspective view
      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(0, 0, 500); // Adjust the camera position

      // Set up the renderer and attach it to the document
      const renderer = new THREE.WebGLRenderer();
      renderer.setSize(window.innerWidth, window.innerHeight);
      document.getElementById('pointcloud-container').appendChild(renderer.domElement); // Append to a specific container

     createPointCloud(data) {
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const colors = [];

        data.forEach(color => {
            // Validate that color is an array of three numbers
            if (Array.isArray(color) && color.length === 3) {
                const r = color[0];
                const g = color[1];
                const b = color[2];

                // Check if RGB values are within the valid range
                if (this.isValidRGB(r) && this.isValidRGB(g) && this.isValidRGB(b)) {
                    const x = ((r / 255) * 500 - 250) + (Math.random() - 0.5) * 10;
                    const y = ((g / 255) * 500 - 250) + (Math.random() - 0.5) * 10;
                    const z = ((b / 255) * 500 - 250) + (Math.random() - 0.5) * 10;

                    vertices.push(x, y, z);
                    colors.push(r / 255, g / 255, b / 255);
                } else {
                    console.warn('Invalid RGB value:', color);
                }
            } else {
                console.warn('Expected color to be an array of three numbers but got:', color);
            }
        });

        // Only create geometry if we have valid vertices
        if (vertices.length > 0) {
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

            const material = new THREE.PointsMaterial({ size: 0.5, vertexColors: true });
            this.pointCloud = new THREE.Points(geometry, material);
            this.scene.add(this.pointCloud);
        } else {
            console.error('No valid vertices to create point cloud.');
        }
    }

    isValidRGB(value) {
        return typeof value === 'number' && value >= 0 && value <= 255;
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
    })
    .catch(error => console.error('Error loading JSON:', error));
}

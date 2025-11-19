document.getElementById('fileInput').addEventListener('change', async function (event) {
    const file = event.target.files[0];
    const validFileTypes = ['image/jpeg', 'image/jpg', 'image/JPEG', 'image/JPG'];
    const maxSizeInBytes = 3 * 1024 * 1024; // 3 MB

    if (file && validFileTypes.includes(file.type) && file.size <= maxSizeInBytes) {
        // Clear previous storage before starting a new upload
        localStorage.removeItem('pointcloudJson');

        const reader = new FileReader();
        document.getElementById('loading').style.display = 'block';

        reader.onload = async function (e) {
            const imageUrl = e.target.result; // Data URL

            // Process the image directly from the Data URL
            await processImage(imageUrl, true);

            document.getElementById('loading').style.display = 'none';
            document.getElementById('message').innerText = 'Image processed locally.';
        };

        reader.onerror = function () {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('message').innerText = 'Error reading file.';
            alert('Error reading file.');
        };

        reader.readAsDataURL(file); // Read file as Data URL for browser compatibility
    } else {
        alert('Please upload a valid JPEG image within 3 MB.');
    }
});

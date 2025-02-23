document.getElementById('fileInput').addEventListener('change', async function(event) {
    const file = event.target.files[0];
    const validFileTypes = ['image/jpeg', 'image/jpg', 'image/JPEG', 'image/JPG'];
    const maxSizeInBytes = 3 * 1024 * 1024; // 3 MB

    if (file && validFileTypes.includes(file.type) && file.size <= maxSizeInBytes) {
        // Clear session storage before starting a new upload
        sessionStorage.removeItem('pointcloudJson');

        const formData = new FormData();
        formData.append('image', file); // Append the file directly

        document.getElementById('loading').style.display = 'block';

        try {
            const response = await fetch('/api/server', { // Call your serverless function
                method: 'POST',
                body: formData,
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            const fileUrl = result.signedURL;
            await processImage(fileUrl);

            document.getElementById('loading').style.display = 'none';
            document.getElementById('message').innerText = 'Upload successful.';
        } catch (error) {
            console.error('Error uploading file:', error);
            document.getElementById('loading').style.display = 'none';
            document.getElementById('message').innerText = 'Error uploading file.';
        }
    } else {
        alert('Please upload a valid JPEG image within 3 MB.');
    }
});

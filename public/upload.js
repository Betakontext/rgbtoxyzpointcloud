document.getElementById('fileInput').addEventListener('change', async function(event) {
    const file = event.target.files[0];
    const validFileTypes = ['image/jpeg', 'image/jpg', 'image/JPEG', 'image/JPG'];
    const maxSizeInBytes = 3 * 1024 * 1024; // 3 MB

    if (file && validFileTypes.includes(file.type) && file.size <= maxSizeInBytes) {
        const formData = new FormData();
        formData.append('image', file);

        document.getElementById('loading').style.display = 'block';

        try {
            // Check if local server is running
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                document.getElementById('loading').style.display = 'none';
                if (data.message) {
                    document.getElementById('message').innerText = data.message;
                    processImage(data.jsonFilePath, true); // Call processImage with the JSON file path and isLocal flag
                } else {
                    document.getElementById('message').innerText = 'Upload failed.';
                }
            } else {
                throw new Error('Local server upload failed');
            }
        } catch (error) {
            console.log('Local server not running, trying Supabase');

            // Function to store image locally
            async function storeImageLocally(file) {
                const folder = "../Bilder";
                const filePath = `${folder}/${file.name}`;
                // Implementation to store file to the local file system
            }

            // Function to upload image to Supabase
            async function uploadImageToSupabase(file) {
                try {
                    const supabaseUrl = 'https://unkpdsecvopwhxjodmag.supabase.co';
                    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJpbWFnZXMvcHVibGljLy01MjA4OTExNDI2MjM0NzI5ODk4XzEyMS5qcGciLCJpYXQiOjE3MzgyMjY1OTMsImV4cCI6MTc0MDgxODU5M30.vnGpdBpbw0pynqU0WsKmzCglENLF7_EVUCKsh1LK7Q8';
                    const { createClient } = window.supabase;
                    const supabase = createClient(supabaseUrl, supabaseKey);

                    const { data, error } = await supabase.storage
                        .from('images')
                        .upload(`public/${file.name}`, file);

                    if (error) throw error;

                    const { signedURL, error: signedUrlError } = await supabase.storage
                        .from('images')
                        .createSignedUrl(`public/${file.name}`, 60 * 60); // URL expires in 1 hour

                    if (signedUrlError) throw signedUrlError;

                    console.log('Image uploaded to Supabase:', data);
                    return signedURL;
                } catch (e) {
                    console.error('Error uploading image to Supabase:', e);
                }
            }

            try {
                let fileUrl;
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    await storeImageLocally(file);
                    fileUrl = `../Bilder/${file.name}`;
                    processImage(fileUrl, true); // Call processImage with the local file URL and isLocal flag
                } else if (navigator.onLine) {
                    fileUrl = await uploadImageToSupabase(file);
                    processImage(fileUrl); // Call processImage with the Supabase file URL
                } else {
                    throw new Error('App is offline and not running on a local server.');
                }

                document.getElementById('loading').style.display = 'none';
                document.getElementById('message').innerText = 'Upload successful.';
            } catch (supabaseError) {
                console.error('Error uploading file:', supabaseError);
                document.getElementById('loading').style.display = 'none';
                document.getElementById('message').innerText = 'Error uploading file.';
            }
        }
    } else {
        alert('Please upload a valid JPEG image within 3 MB.');
    }
});

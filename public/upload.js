document.getElementById('fileInput').addEventListener('change', async function(event) {
    const file = event.target.files[0];
    const validFileTypes = ['image/jpeg', 'image/jpg', 'image/JPEG', 'image/JPG'];
    const maxSizeInBytes = 3 * 1024 * 1024; // 3 MB

    if (file && validFileTypes.includes(file.type) && file.size <= maxSizeInBytes) {
        const formData = new FormData();
        formData.append('image', file);

        // Function to store image locally
        async function storeImageLocally(file) {
            const folder = "../Bilder";
            const filePath = `${folder}/${file.name}`;

            try {
                // Use a more compatible method for storing files locally
                const response = await fetch('/save-local', {
                    method: 'POST',
                    body: formData
                });
                if (!response.ok) throw new Error('Failed to store image locally');
                console.log('Image stored locally:', filePath);
            } catch (error) {
                console.error('Error storing image locally:', error);
            }
        }

        // Function to upload image to Supabase
        async function uploadImageToSupabase(file) {
            try {
                const supabaseUrl = 'https://unkpdsecvopwhxjodmag.supabase.co';
                const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVua3Bkc2Vjdm9wd2h4am9kbWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxMzQ0NjksImV4cCI6MjA1MzcxMDQ2OX0.4MwAFohH9DHqYu1liHeXRJTLc6ZU_AMfmVXwnnCjYdg';
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
            } else if (navigator.onLine) {
                fileUrl = await uploadImageToSupabase(file);
            } else {
                throw new Error('App is offline and not running on a local server.');
            }

            document.getElementById('loading').style.display = 'none';
            document.getElementById('message').innerText = 'Upload successful.';

            processImage(fileUrl);
        } catch (error) {
            console.error('Error uploading file:', error);
            document.getElementById('loading').style.display = 'none';
            document.getElementById('message').innerText = 'Error uploading file.';
        }
        document.getElementById('loading').style.display = 'block';
    } else {
        alert('Please upload a valid JPEG image within 3 MB.');
    }
});

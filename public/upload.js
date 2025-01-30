document.getElementById('fileInput').addEventListener('change', async function(event) {
    const file = event.target.files[0];
    const validFileTypes = ['image/jpeg', 'image/jpg', 'image/JPEG', 'image/JPG'];
    const maxSizeInBytes = 3 * 1024 * 1024; // 3 MB

    if (file && validFileTypes.includes(file.type) && file.size <= maxSizeInBytes) {
        const formData = new FormData();
        formData.append('image', file);

        try {
            const supabaseUrl = 'https://unkpdsecvopwhxjodmag.supabase.co';
            const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVua3Bkc2Vjdm9wd2h4am9kbWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxMzQ0NjksImV4cCI6MjA1MzcxMDQ2OX0.4MwAFohH9DHqYu1liHeXRJTLc6ZU_AMfmVXwnnCjYdg';

            const { createClient } = window.supabase;
            const supabase = createClient(supabaseUrl, supabaseKey);

            const { data, error } = await supabase.storage
                .from('images') // Ensure this is the correct bucket name
                .upload(`public/${file.name}`, file);

            if (error) {
                throw error;
            }

            const { signedURL, error: signedUrlError } = await supabase.storage
                .from('images')
                .createSignedUrl(`public/${file.name}`, 60 * 60); // URL expires in 1 hour

            if (signedUrlError) {
                throw signedUrlError;
            }

            document.getElementById('loading').style.display = 'none';
            document.getElementById('message').innerText = 'Upload successful.';

            // Pass the signed URL to the script.js for processing
            processImage(signedURL);

        } catch (supabaseError) {
            console.error('Error uploading file:', supabaseError);
            document.getElementById('loading').style.display = 'none';
            document.getElementById('message').innerText = 'Error uploading file.';
        }
        document.getElementById('loading').style.display = 'block';
    } else {
        alert('Please upload a valid JPEG image within 3 MB.');
    }
});

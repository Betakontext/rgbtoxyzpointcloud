document.getElementById('fileInput').addEventListener('change', async function(event) {
    const file = event.target.files[0];
    const validFileTypes = ['image/jpeg', 'image/jpg', 'image/JPEG', 'image/JPG'];
    const maxSizeInBytes = 3 * 1024 * 1024; // 3 MB

    if (file && validFileTypes.includes(file.type) && file.size <= maxSizeInBytes) {
        const formData = new FormData();
        formData.append('image', file);

        // Function to store image locally
        async function storeImageLocally(file) {
            const folder = navigator.onLine ? "/lists" : "/Bilder";
            const filePath = `${folder}/${file.name}`;
            // Implementation to store file to the local file system
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
                console.log('Image uploaded to Supabase:', data);
            } catch (e) {
                console.error('Error uploading image to Supabase:', e);
            }
        }

        try {
            // Conditionally use local folders or Supabase for image uploads
            if (navigator.onLine) {
                await uploadImageToSupabase(file);
            } else {
                await storeImageLocally(file);
            }

            document.getElementById('loading').style.display = 'none';
            document.getElementById('message').innerText = 'Upload successful.';

            // Pass the file URL to the script.js for processing
            const fileUrl = navigator.onLine ? `https://your-supabase-url/storage/v1/object/public/images/${file.name}` : `/${folder}/${file.name}`;
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

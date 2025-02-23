document.getElementById('fileInput').addEventListener('change', async function(event) { 
    const file = event.target.files[0]; 
    const validFileTypes = ['image/jpeg', 'image/jpg', 'image/JPEG', 'image/JPG']; 
    const maxSizeInBytes = 3 * 1024 * 1024; // 3 MB

    if (file && validFileTypes.includes(file.type) && file.size <= maxSizeInBytes) {
        // Clear session storage before starting a new upload
        sessionStorage.removeItem('pointcloudJson');
    
        const formData = new FormData();
    
        // Generate a new filename with date and time
        const currentDate = new Date();
        const timestamp = currentDate.toISOString().replace(/[-:.]/g, "");
        const newFilename = `${timestamp}_${file.name}`;
        const renamedFile = new File([file], newFilename, { type: file.type });
    
        formData.append('image', renamedFile);
    
        document.getElementById('loading').style.display = 'block';
    
        try {
            const supabaseUrl = 'https://unkpdsecvopwhxjodmag.supabase.co';
            const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVua3Bkc2Vjdm9wd2h4am9kbWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxMzQ0NjksImV4cCI6MjA1MzcxMDQ2OX0.4MwAFohH9DHqYu1liHeXRJTLc6ZU_AMfmVXwnnCjYdg';
            const supabase = createClient(supabaseUrl, supabaseKey);
            const { data, error } = await supabase.storage.from('images').upload(`public/${renamedFile.name}`, renamedFile);
            if (error) throw error;
    
            const { signedURL, error: signedUrlError } = await supabase.storage.from('images').createSignedUrl(`public/${renamedFile.name}`, 60 * 60); // URL expires in 1 hour
            if (signedUrlError) throw signedUrlError;
    
            const fileUrl = signedURL;
            await processImage(fileUrl);
    
            document.getElementById('loading').style.display = 'none';
            document.getElementById('message').innerText = 'Upload successful.';
        } catch (supabaseError) {
            console.error('Error uploading file:', supabaseError);
            document.getElementById('loading').style.display = 'none';
            document.getElementById('message').innerText = 'Error uploading file.';
        }
    } else {
        alert('Please upload a valid JPEG image within 3 MB.');
    }

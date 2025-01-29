document.getElementById('fileInput').addEventListener('change', async function(event) {
  const file = event.target.files[0];
  const validFileTypes = ['image/jpeg', 'image/jpg', 'image/JPEG', 'image/JPG'];
  const maxSizeInBytes = 3 * 1024 * 1024; // 3 MB

  if (file && validFileTypes.includes(file.type) && file.size <= maxSizeInBytes) {
    const formData = new FormData();
    formData.append('image', file);

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
          loadPointCloud(data.jsonFilePath); // Call loadPointCloud with the JSON file path
        } else {
          document.getElementById('message').innerText = 'Upload failed.';
        }
      } else {
        throw new Error('Local server upload failed');
      }
    } catch (error) {
      console.log('Trying to upload to Supabase');
      
      try {
        const supabaseUrl = 'https://your-supabase-url';
        const supabaseKey = 'your-supabase-key';
        const { createClient } = window.supabase;

        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data, error } = await supabase.storage
          .from('images')
          .upload(`public/${file.name}`, file);

        if (error) {
          throw error;
        }

        document.getElementById('loading').style.display = 'none';
        document.getElementById('message').innerText = 'Upload successful.';
        loadPointCloud(data.Key); // Call loadPointCloud with the path to the uploaded image
      } catch (supabaseError) {
        console.error('Error uploading file:', supabaseError);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('message').innerText = 'Error uploading file.';
      }
    }

    document.getElementById('loading').style.display = 'block';
  } else {
    alert('Please upload a valid JPEG image within 3 MB.');
  }
});

// Add this script tag to your HTML head to include Supabase from a CDN
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@1.30.0/dist/umd/supabase.min.js"></script>

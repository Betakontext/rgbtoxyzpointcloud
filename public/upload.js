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
        const supabaseUrl = 'https://unkpdsecvopwhxjodmag.supabase.co';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVua3Bkc2Vjdm9wd2h4am9kbWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxMzQ0NjksImV4cCI6MjA1MzcxMDQ2OX0.4MwAFohH9DHqYu1liHeXRJTLc6ZU_AMfmVXwnnCjYdg';
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
          const json = generateJson(data.pixelColors);
          storeJson(json);
          loadPointCloudFromSession(); // Load the point cloud from session storage
        } else {
          document.getElementById('message').innerText = 'Upload failed.';
        }
      } else {
        throw new Error('Local server upload failed');
      }
    } catch (error) {
      console.log('Trying to upload to Supabase');
      
      try {
        const supabaseUrl = 'https://unkpdsecvopwhxjodmag.supabase.co';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVua3Bkc2Vjdm9wd2h4am9kbWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxMzQ0NjksImV4cCI6MjA1MzcxMDQ2OX0.4MwAFohH9DHqYu1liHeXRJTLc6ZU_AMfmVXwnnCjYdg'; // Replace with your actual Supabase key

        const { createClient } = window.supabase;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data, error } = await supabase.storage
          .from('images') // Ensure this is the correct bucket name
          .upload(`public/${file.name}`, file);

        if (error) {
          throw error;
        }

        const { publicURL } = supabase.storage
          .from('images')
          .getPublicUrl(`public/${file.name}`);

        document.getElementById('loading').style.display = 'none';
        document.getElementById('message').innerText = 'Upload successful.';
        
        // Assuming the Supabase function returns pixelColors in the response
        const json = generateJson(data.pixelColors);
        storeJson(json);
        loadPointCloudFromSession(); // Load the point cloud from session storage
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

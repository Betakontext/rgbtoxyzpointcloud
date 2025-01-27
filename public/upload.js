document.getElementById('fileInput').addEventListener('change', function(event) {
  const file = event.target.files[0];
  const validFileTypes = ['image/jpeg', 'image/jpg', 'image/JPEG', 'image/JPG'];
  
  if (file && validFileTypes.includes(file.type)) {
    const formData = new FormData();
    formData.append('image', file);

    fetch('/upload', {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      document.getElementById('loading').style.display = 'none';
      if (data.message) {
        document.getElementById('message').innerText = data.message;
        loadPointCloud(data.jsonFilePath); // Call loadPointCloud with the JSON file path
      } else {
        document.getElementById('message').innerText = 'Upload failed.';
      }
    })
    .catch(error => {
      console.error('Error uploading file:', error);
      document.getElementById('loading').style.display = 'none';
      document.getElementById('message').innerText = 'Error uploading file.';
    });

    document.getElementById('loading').style.display = 'block';
  } else {
    alert('Please upload a valid JPEG image.');
  }
});

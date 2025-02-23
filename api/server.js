const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const multer = require('multer'); // Middleware for handling file uploads

const app = express();
const router = express.Router();

// Initialize Supabase client
const supabaseUrl = 'https://unkpdsecvopwhxjodmag.supabase.co';
const supabaseKey = process.env.SUPABASE_TOKEN; // Use the environment variable
const supabase = createClient(supabaseUrl, supabaseKey);

// Set up multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

const listsDir = path.join(__dirname, '../lists');

if (!fs.existsSync(listsDir)) {
  fs.mkdirSync(listsDir, { recursive: true });
}

// Endpoint to upload an image to Supabase
router.post('/upload', upload.single('image'), async (req, res) => {
  const { originalname } = req.file; // Get the original file name
  const filePath = `public/${originalname}`; // Define the path in Supabase storage

  try {
    // Upload the file to Supabase
    const { data, error: uploadError } = await supabase.storage
      .from('images')
      .upload(filePath, req.file.buffer);

    if (uploadError) {
      throw uploadError;
    }

    return res.status(200).json({ message: 'File uploaded successfully', filePath });
  } catch (error) {
    console.error('Error uploading file:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to download and process an image
router.post('/process', async (req, res) => {
  const { imagePath } = req.body;

  try {
    const { data, error } = await supabase.storage
      .from('images')
      .download(imagePath);

    if (error) {
      throw error;
    }

    const imgBuffer = Buffer.from(await data.arrayBuffer());
    const canvas = await generateCanvas(imgBuffer);
    const pixelColors = extractPixelColors(canvas);

    const jsonFilePath = path.join(listsDir, imagePath.replace(/\.jpe?g$/i, '_pixel_colors.json'));
    fs.writeFileSync(jsonFilePath, JSON.stringify(pixelColors));

    return res.status(200).json({ message: 'File processed', jsonFilePath: `/lists/${imagePath.replace(/\.jpe?g$/i, '_pixel_colors.json')}` });
  } catch (error) {
    console.error('Error processing file:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function generateCanvas(imgBuffer) {
  const img = await loadImage(imgBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return canvas;
}

function extractPixelColors(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixelColors = [];

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const index = (y * canvas.width + x) * 4;
      const r = imageData.data[index];
      const g = imageData.data[index + 1];
      const b = imageData.data[index + 2];
      pixelColors.push([r, g, b]);
    }
  }
  return pixelColors; 
}

// Export the handler function
module.exports = (req, res) => {
  app.use('/api', router);
  app(req, res);
};

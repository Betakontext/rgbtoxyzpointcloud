const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const app = express();
const router = express.Router();

// Initialize Supabase client
const supabaseUrl = 'https://unkpdsecvopwhxjodmag.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVua3Bkc2Vjdm9wd2h4am9kbWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxMzQ0NjksImV4cCI6MjA1MzcxMDQ2OX0.4MwAFohH9DHqYu1liHeXRJTLc6ZU_AMfmVXwnnCjYdg';
const supabase = createClient(supabaseUrl, supabaseKey);

const imagesDir = path.join(__dirname, '../Bilder');

if (!fs.existsSync(listsDir)) {
  fs.mkdirSync(listsDir, { recursive: true });
}

router.post('/upload', async (req, res) => {
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

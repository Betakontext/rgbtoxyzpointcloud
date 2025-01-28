const express = require('express');
const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const app = express();
const router = express.Router();

const imagesDir = path.join(__dirname, '../Bilder');
const listsDir = path.join(__dirname, '../lists');

if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

if (!fs.existsSync(listsDir)) {
  fs.mkdirSync(listsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, imagesDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage }).single('image');

router.post('/upload', (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(500).json({ error: 'Failed to process upload' });
    }

    const file = req.file;
    if (!file) {
      console.error('No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const imgPath = path.join(imagesDir, file.originalname);

    try {
      const canvas = await generateCanvas(imgPath);
      const pixelColors = extractPixelColors(canvas);

      const jsonFilePath = path.join(listsDir, file.originalname.replace(/\.jpe?g$/i, '_pixel_colors.json'));
      fs.writeFileSync(jsonFilePath, JSON.stringify(pixelColors));

      return res.status(200).json({ message: 'File saved', jsonFilePath: `/lists/${file.originalname.replace(/\.jpe?g$/i, '_pixel_colors.json')}` });
    } catch (error) {
      console.error('Error processing file:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });
});

async function generateCanvas(imagePath) {
  const img = await loadImage(imagePath);
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

const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');

const app = express();
const port = 3000;

// Set up storage for multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'Bilder');
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Parse JSON bodies
app.use(bodyParser.json({ limit: '50mb' }));

// Handle file uploads
app.post('/upload', upload.single('image'), (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).send('No file uploaded.');
  }

  const imgPath = path.join(__dirname, 'Bilder', file.filename);
  generateCanvas(imgPath)
    .then(canvas => {
      const pixelColors = extractPixelColors(canvas);
      const jsonFilePath = path.join(__dirname, 'lists', file.filename.replace(/\.jpe?g$/i, '_pixel_colors.json'));
      fs.writeFile(jsonFilePath, JSON.stringify(pixelColors), (err) => {
        if (err) {
          console.error('Error writing file:', err);
          return res.status(500).send('Internal Server Error');
        }
        res.status(200).send({ message: 'File saved', jsonFilePath: `/lists/${file.filename.replace(/\.jpe?g$/i, '_pixel_colors.json')}` });
      });
    })
    .catch(err => {
      console.error('Error generating canvas:', err);
      res.status(500).send('Internal Server Error');
    });
});

// Serve the JSON files
app.use('/lists', express.static(path.join(__dirname, 'lists')));

// Helper functions to generate canvas and extract pixel colors
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

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});

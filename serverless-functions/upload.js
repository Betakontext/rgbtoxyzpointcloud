const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage }).single('image');

exports.handler = async (event, context) => {
  return new Promise((resolve, reject) => {
    upload(event, {}, async (err) => {
      if (err) {
        return resolve({
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to process upload' }),
        });
      }

      const file = event.file;
      if (!file) {
        return resolve({
          statusCode: 400,
          body: JSON.stringify({ error: 'No file uploaded' }),
        });
      }

      const imgBuffer = file.buffer;

      try {
        const imgPath = path.join('/tmp', file.originalname);
        fs.writeFileSync(imgPath, imgBuffer);

        const canvas = await generateCanvas(imgPath);
        const pixelColors = extractPixelColors(canvas);

        const jsonFilePath = path.join('/tmp', file.originalname.replace(/\.jpe?g$/i, '_pixel_colors.json'));
        fs.writeFileSync(jsonFilePath, JSON.stringify(pixelColors));

        return resolve({
          statusCode: 200,
          body: JSON.stringify({ message: 'File saved', jsonFilePath: `/.netlify/functions/upload/${file.originalname.replace(/\.jpe?g$/i, '_pixel_colors.json')}` }),
        });
      } catch (error) {
        console.error('Error processing file:', error);
        return resolve({
          statusCode: 500,
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      }
    });
  });
};

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

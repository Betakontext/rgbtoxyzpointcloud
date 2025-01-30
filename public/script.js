async function processImage(imageUrl) {
    try {
        console.log(imageUrl);
        const response = await fetch(imageUrl, {
            mode: 'cors',
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        });
        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
        }
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);

        if (!imageBitmap) {
            throw new Error('Failed to create image bitmap');
        }

        const pixelColors = extractPixelColors(imageBitmap);

        const json = generateJson(pixelColors);
        if (isValidJson(json)) {
            storeJson(json);
            loadPointCloudFromSession();
        } else {
            console.error('Invalid JSON data:', json);
        }
    } catch (error) {
        console.error('Error processing image:', error);
    }
}

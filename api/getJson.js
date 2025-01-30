import { BlobServiceClient } from '@azure/storage-blob';

export default async (req, res) => {
    const fileName = 'pointcloud-RyFMPN17Hx3EPvKqy2uDgmCt6CMBSg.json'; // Update this with the correct file name

    const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient('your-container-name');
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);

    try {
        const downloadBlockBlobResponse = await blockBlobClient.download(0);
        const downloaded = await streamToString(downloadBlockBlobResponse.readableStreamBody);
        res.status(200).json(JSON.parse(downloaded));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

async function streamToString(readableStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on('data', (data) => {
            chunks.push(data.toString());
        });
        readableStream.on('end', () => {
            resolve(chunks.join(''));
        });
        readableStream.on('error', reject);
    });
}

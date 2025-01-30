import { BlobServiceClient } from '@azure/storage-blob';

export default async (req, res) => {
    if (req.method === 'POST') {
        const { json, fileName } = req.body;

        const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient('your-container-name');
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);

        try {
            await blockBlobClient.upload(json, json.length);
            const url = blockBlobClient.url;
            res.status(200).json({ url });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
};

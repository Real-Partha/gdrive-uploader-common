import { Router } from 'express';
import { appendUploadRow } from '../sheets.js';
import { fileViewLink } from '../drive.js';

const router = Router();

router.post('/upload-complete', async (req, res) => {
  try {
    const { name, fileName, photoDate, sizeBytes, driveFileId } = req.body ?? {};

    if (!name || !fileName || !photoDate || !driveFileId) {
      return res.status(400).json({ error: 'name, fileName, photoDate and driveFileId are required' });
    }

    await appendUploadRow({
      timestamp: new Date().toISOString(),
      name: String(name).trim(),
      fileName,
      photoDate,
      sizeBytes: Number(sizeBytes) || 0,
      driveLink: fileViewLink(driveFileId),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('upload-complete error:', err);
    res.status(500).json({ error: 'Failed to record upload' });
  }
});

export default router;

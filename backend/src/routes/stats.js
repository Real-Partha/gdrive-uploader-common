import { Router } from 'express';
import { getSummary } from '../sheets.js';

const router = Router();

router.get('/stats', async (req, res) => {
  try {
    const summary = await getSummary();
    res.json({ summary });
  } catch (err) {
    console.error('stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

export default router;

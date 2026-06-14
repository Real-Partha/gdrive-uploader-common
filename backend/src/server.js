import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import uploadSessionRoute from './routes/uploadSession.js';
import uploadCompleteRoute from './routes/uploadComplete.js';
import statsRoute from './routes/stats.js';

const app = express();

const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', uploadSessionRoute);
app.use('/api', uploadCompleteRoute);
app.use('/api', statsRoute);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Server listening on port ${port}`));

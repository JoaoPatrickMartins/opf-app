import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

const __dirname = dirname(fileURLToPath(import.meta.url));
// .env mora na raiz do monorepo
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

import { connect, initSchema } from './db.js';
import peopleRouter from './routes/people.js';
import sourcesRouter from './routes/sources.js';
import categoriesRouter from './routes/categories.js';
import transactionsRouter from './routes/transactions.js';
import importRouter from './routes/import.js';
import settingsRouter from './routes/settings.js';
import recurringRouter from './routes/recurring.js';
import exportRouter from './routes/export.js';
import aiRouter from './routes/ai.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/people', peopleRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/import', importRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/recurring', recurringRouter);
app.use('/api/export', exportRouter);
app.use('/api/ai', aiRouter);

// Servir build estático do frontend, se existir
const frontendDist = join(__dirname, '..', '..', 'frontend', 'dist');
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(frontendDist, 'index.html'));
  });
}

// Tratamento de erro central
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

const PORT = process.env.PORT || 3001;

// Bootstrap: conecta ao MongoDB e prepara índices/seeds antes de aceitar requisições.
try {
  await connect();
  await initSchema();
  app.listen(PORT, () => {
    console.log(`OPF backend rodando em http://localhost:${PORT}`);
  });
} catch (err) {
  console.error('Falha ao iniciar o backend (MongoDB):', err.message);
  process.exit(1);
}

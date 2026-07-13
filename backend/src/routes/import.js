import { Router } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { col, nextId } from '../db.js';
import { parseOfx } from '../parsers/ofx.js';
import { parseSantanderPdf } from '../parsers/pdf-santander.js';
import { classifyBatch } from '../ai/classify.js';
import { lookupLearning, getLearningExamples, recordLearning, normalizeMemo } from '../ai/learning.js';
import { invoiceMonth } from '../lib/invoice.js';
import { parseAmount } from '../lib/money.js';
import { aiEnabled } from './settings.js';
import { extractTransactionsFromText } from '../ai/extract.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function detectFormat(file) {
  const name = (file.originalname || '').toLowerCase();
  const head = file.buffer.slice(0, 200).toString('latin1').toLowerCase();
  if (name.endsWith('.ofx') || head.includes('<ofx') || head.includes('ofxheader')) return 'ofx';
  if (name.endsWith('.pdf') || head.startsWith('%pdf')) return 'pdf';
  return null;
}

// POST /api/import/preview  (multipart: file, source_id)  — source_id é o cartão/fonte de origem
router.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const format = detectFormat(req.file);
    if (!format) return res.status(400).json({ error: 'Formato não reconhecido (OFX ou PDF)' });

    let parsed;
    let aiExtractError = null;
    if (format === 'ofx') {
      parsed = parseOfx(req.file.buffer);
    } else {
      const text = (await pdfParse(req.file.buffer)).text;
      // PDF: a extração por IA é mais robusta entre layouts (pega Despesas + Parcelamentos de
      // todos os cartões, inclusive anuidade). O parser determinístico é o fallback.
      const deterministic = parseSantanderPdf(text);
      if (await aiEnabled('import')) {
        try {
          const ai = await extractTransactionsFromText(text);
          parsed = ai.transactions.length >= deterministic.transactions.length ? ai : deterministic;
        } catch (e) {
          aiExtractError = e.message;
          parsed = deterministic;
        }
      } else {
        parsed = deterministic;
      }
    }

    const source = req.body.source_id
      ? await col.sources().findOne({ _id: Number(req.body.source_id) })
      : null;

    // cartão de crédito com fechamento: recalcula mês de referência (compras após o fechamento → próxima fatura)
    if (source && source.type === 'credit_card' && source.closing_day) {
      for (const t of parsed.transactions) {
        if (format === 'pdf' && t.reference_month) continue;
        t.reference_month = invoiceMonth(t.date, source.closing_day);
      }
    }

    let items = parsed.transactions.map((t, i) => ({
      fitid: t.fitid || null,
      memo: t.memo || t.description,
      description: t.description,
      amount: Math.abs(t.amount),               // v2: magnitude positiva
      type: t.type || 'expense',
      date: t.date,
      reference_month: t.reference_month,
      installment: t.installment || null,
      source: t.source,
      key: t.fitid || `idx-${i}`,
      holder: t.holder || null,
      card_last4: t.card_last4 || null
    }));

    // ---- Dedup ----
    const existingFitids = new Set(
      (await col.transactions().find({ fitid: { $ne: null } }, { projection: { fitid: 1 } }).toArray()).map((r) => r.fitid)
    );
    const seen = new Set();
    for (const it of items) {
      let dup = false;
      if (it.fitid && existingFitids.has(it.fitid)) dup = true;
      const sig = `${it.date}|${it.amount}|${normalizeMemo(it.description)}`;
      if (seen.has(sig)) dup = true;
      else {
        seen.add(sig);
        if (!it.fitid) {
          const ex = await col.transactions().findOne({ date: it.date, amount: it.amount, reference_month: it.reference_month });
          if (ex) dup = true;
        }
      }
      it.duplicate = dup;
    }

    // ---- Sugestões: histórico local → IA ----
    const categories = (await col.categories().find({}, { projection: { name: 1, _id: 0 } }).sort({ name: 1 }).toArray()).map((r) => r.name);
    const people = (await col.people().find({}, { projection: { name: 1, _id: 0 } }).sort({ name: 1 }).toArray()).map((r) => r.name);

    const needAi = [];
    for (const it of items) {
      const local = await lookupLearning(it.memo);
      if (local) {
        it.suggested_category = local.categoria;
        it.suggested_person = local.person;
        it.suggestion_source = 'local';
      } else {
        it.suggested_category = null;
        it.suggested_person = null;
        it.suggestion_source = null;
        if (!it.duplicate) needAi.push(it);
      }
    }

    let aiError = null;
    if (needAi.length && await aiEnabled('import')) {
      try {
        const examples = await getLearningExamples(30);
        const results = await classifyBatch({ categories, people, examples, items: needAi });
        const map = new Map(results.map((r) => [r.key, r]));
        for (const it of needAi) {
          const r = map.get(it.key);
          if (r) {
            it.suggested_category = categories.includes(r.categoria) ? r.categoria : null;
            it.suggested_person = people.includes(r.pessoa) ? r.pessoa : null;
            it.suggestion_source = 'ai';
            // S12: rótulo legível (mantém o memo original intacto para dedup/aprendizado)
            if (r.rotulo && r.rotulo.length <= 60) it.description = r.rotulo;
          }
        }
      } catch (e) { aiError = e.message; }
    }

    res.json({
      bank: parsed.bank,
      format: parsed.format,
      referenceMonth: parsed.referenceMonth || null,
      source: source ? { id: source._id, name: source.name, type: source.type } : null,
      aiError: aiError || aiExtractError,
      items
    });
  } catch (err) { next(err); }
});

// POST /api/import/confirm  { source_id, items:[{... person_id, category_id}] }
router.post('/confirm', async (req, res, next) => {
  try {
    const { source_id, items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items inválido' });
    const defaultPerson = (await col.people().findOne({ is_self: 1 }, { sort: { _id: 1 }, projection: { _id: 1 } }))?._id
      || (await col.people().findOne({}, { sort: { _id: 1 }, projection: { _id: 1 } }))?._id;

    let saved = 0, skipped = 0;
    for (const it of items) {
      if (it.exclude) { skipped++; continue; }
      const amount = parseAmount(it.amount);
      if (Number.isNaN(amount)) { skipped++; continue; } // valor inválido não entra
      const _id = await nextId('transactions');
      try {
        // ON CONFLICT(fitid) DO NOTHING — o índice único parcial em fitid rejeita duplicatas.
        await col.transactions().insertOne({
          _id,
          fitid: it.fitid || null,
          person_id: it.person_id || defaultPerson,   // despacha para a pessoa classificada
          source_id: source_id || null,               // etiqueta com o cartão de origem
          category_id: it.category_id || null,
          counterparty_person_id: null,
          type: it.type || 'expense',
          reference_month: it.reference_month || (it.date ? it.date.slice(0, 7) : null),
          date: it.date,
          description: it.description || it.memo || '',
          memo_original: it.memo || it.description || '',
          amount,
          installment: it.installment || null,
          source: it.source || 'import',
          ai_suggested: it.suggestion_source === 'ai' ? 1 : 0,
          confirmed: 1,
          recurring_id: null,
          created_at: new Date().toISOString()
        });
        saved++;
        if (it.category_name) await recordLearning(it.memo || it.description, it.category_name, it.person_name || null);
      } catch (e) {
        if (e.code === 11000) skipped++;
        else throw e;
      }
    }

    res.json({ saved, skipped });
  } catch (err) { next(err); }
});

export default router;

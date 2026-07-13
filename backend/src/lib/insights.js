import { col } from '../db.js';
import { detectSubscriptions } from './subscriptions.js';

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const monthLabel = (ym) => { const [y, m] = ym.split('-'); return `${MONTHS_PT[Number(m) - 1]} ${y}`; };

// Fatos calculados no código (a IA só os transforma em texto).
export async function computeInsightFacts(month) {
  const monthExpenses = await col.transactions()
    .find({ reference_month: month, type: 'expense' }, { projection: { amount: 1, category_id: 1 } })
    .toArray();
  const gastos = monthExpenses.reduce((s, t) => s + t.amount, 0);

  // maior categoria do mês (inclui grupo "sem categoria" = category_id null)
  const catTotals = new Map();
  for (const t of monthExpenses) {
    const key = t.category_id ?? null;
    catTotals.set(key, (catTotals.get(key) || 0) + t.amount);
  }
  let biggestCatId = null, biggestSpent = 0;
  for (const [k, v] of catTotals) { if (v > biggestSpent) { biggestSpent = v; biggestCatId = k; } }
  let biggestCategory = null;
  if (catTotals.size && biggestCatId != null) {
    const c = await col.categories().findOne({ _id: biggestCatId }, { projection: { name: 1 } });
    biggestCategory = c?.name || null;
  }

  // média dos meses anteriores (com dados) — últimos 6
  const past = await col.transactions().aggregate([
    { $match: { type: 'expense', reference_month: { $lt: month } } },
    { $group: { _id: '$reference_month', v: { $sum: '$amount' } } },
    { $sort: { _id: -1 } },
    { $limit: 6 }
  ]).toArray();
  const avg = past.length ? past.reduce((s, r) => s + r.v, 0) / past.length : 0;
  const deltaPct = avg > 0 ? Math.round(((gastos - avg) / avg) * 100) : null;

  const subs = await detectSubscriptions();

  return {
    month,
    monthLabel: monthLabel(month),
    gastos: Math.round(gastos * 100) / 100,
    biggestCategory,
    biggestAmount: catTotals.size ? Math.round(biggestSpent * 100) / 100 : 0,
    avg: Math.round(avg * 100) / 100,
    deltaPct,
    subscriptionsCount: subs.length
  };
}

// Texto de reserva (sem IA), no tom Fluxo.
export function fallbackInsight(f) {
  if (!f.gastos) return 'Sem gastos registrados neste mês ainda.';
  const parts = [];
  if (f.biggestCategory) parts.push(`Seu maior gasto este mês foi ${f.biggestCategory}.`);
  if (f.deltaPct != null) parts.push(f.deltaPct <= 0 ? `Está ${Math.abs(f.deltaPct)}% abaixo da sua média.` : `Está ${f.deltaPct}% acima da sua média.`);
  if (f.subscriptionsCount) parts.push(`Você tem ${f.subscriptionsCount} ${f.subscriptionsCount === 1 ? 'cobrança recorrente' : 'cobranças recorrentes'}.`);
  return parts.join(' ');
}

// hash simples dos fatos para cache
export function factsHash(f) {
  return `${f.gastos}|${f.biggestCategory}|${f.deltaPct}|${f.subscriptionsCount}`;
}

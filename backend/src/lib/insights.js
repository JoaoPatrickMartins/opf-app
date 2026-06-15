import db from '../db.js';
import { detectSubscriptions } from './subscriptions.js';

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const monthLabel = (ym) => { const [y, m] = ym.split('-'); return `${MONTHS_PT[Number(m) - 1]} ${y}`; };

// Fatos calculados no código (a IA só os transforma em texto).
export function computeInsightFacts(month) {
  const gastos = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE reference_month=? AND type='expense'").get(month).v;

  const biggest = db.prepare(`
    SELECT c.name AS category, COALESCE(SUM(t.amount),0) AS spent
    FROM transactions t LEFT JOIN categories c ON c.id=t.category_id
    WHERE t.reference_month=? AND t.type='expense'
    GROUP BY t.category_id ORDER BY spent DESC LIMIT 1
  `).get(month);

  // média dos meses anteriores (com dados)
  const past = db.prepare(`
    SELECT reference_month AS m, SUM(amount) AS v FROM transactions
    WHERE type='expense' AND reference_month < ?
    GROUP BY reference_month ORDER BY reference_month DESC LIMIT 6
  `).all(month);
  const avg = past.length ? past.reduce((s, r) => s + r.v, 0) / past.length : 0;
  const deltaPct = avg > 0 ? Math.round(((gastos - avg) / avg) * 100) : null;

  const subs = detectSubscriptions();

  return {
    month,
    monthLabel: monthLabel(month),
    gastos: Math.round(gastos * 100) / 100,
    biggestCategory: biggest?.category || null,
    biggestAmount: biggest ? Math.round(biggest.spent * 100) / 100 : 0,
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

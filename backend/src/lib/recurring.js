import { col, nextId } from '../db.js';
import { daysInMonth } from './invoice.js';

function monthsBetween(start, month) {
  const [y1, m1] = start.split('-').map(Number);
  const [y2, m2] = month.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

// Materializa as recorrências ativas para o mês (idempotente: recurring_id + reference_month).
// total_occurrences != NULL → parcelado: materializa só até a N-ésima ocorrência e marca installment x/N.
export async function materializeRecurring(month) {
  if (!month) return;
  const rules = await col.recurring().find({
    active: 1,
    start_month: { $lte: month },
    $or: [{ end_month: null }, { end_month: { $gte: month } }]
  }).toArray();

  for (const r of rules) {
    const idx = monthsBetween(r.start_month, month) + 1; // 1-based
    if (idx < 1) continue;
    if (r.total_occurrences && idx > r.total_occurrences) continue; // já completou as parcelas
    const already = await col.transactions().findOne({ recurring_id: r._id, reference_month: month });
    if (already) continue;
    const day = Math.min(r.day_of_month || 1, daysInMonth(month));
    try {
      await col.transactions().insertOne({
        _id: await nextId('transactions'),
        fitid: null,
        recurring_id: r._id,
        person_id: r.person_id || null,
        source_id: r.source_id || null,
        category_id: r.category_id || null,
        counterparty_person_id: null,
        type: r.type,
        reference_month: month,
        date: `${month}-${String(day).padStart(2, '0')}`,
        description: r.description,
        memo_original: r.description,
        amount: Math.abs(r.amount),
        installment: r.total_occurrences ? `${idx}/${r.total_occurrences}` : null,
        source: 'recurring',
        ai_suggested: 0,
        confirmed: 1,
        created_at: new Date().toISOString()
      });
    } catch (e) {
      if (e.code !== 11000) throw e; // corrida: já materializado por outra requisição — ok
    }
  }
}

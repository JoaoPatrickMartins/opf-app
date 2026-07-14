import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { formatMonth, addMonths } from '../lib/format.js';
import { Button, NumberStepper } from './ui.jsx';
import Modal from './Modal.jsx';

// person = pessoa dona (contexto da página). tx = edição. initialType opcional.
// payFor = { source_id, month, amount } quando aberto para pagar uma fatura específica.
export default function TransactionForm({ person, tx, initialType, payFor, onClose, onSaved }) {
  const { people, sources, categories, month } = useStore();
  const editing = !!tx;
  const creditCards = sources.filter((s) => s.type === 'credit_card');
  const others = people.filter((p) => p.id !== person.id);

  const [form, setForm] = useState({
    type: tx?.type || initialType || 'expense',
    amount: tx ? tx.amount : (payFor?.amount != null ? payFor.amount : ''),
    date: tx?.date || `${month}-01`,
    source_id: tx?.source_id || payFor?.source_id || '',
    category_id: tx?.category_id || '',
    counterparty_person_id: tx?.counterparty_person_id || (others[0]?.id ?? ''),
    person_id: tx?.person_id ?? person.id,   // dono do lançamento (permite mover para outra conta)
    description: tx?.description || ''
  });
  // Mês da fatura que o pagamento abate (só para type=payment).
  const [invoiceMonth, setInvoiceMonth] = useState(payFor?.month || month);
  // Despesa em dinheiro pode já nascer paga (marcada aqui) — senão fica pendente.
  const [paidNow, setPaidNow] = useState(false);
  const [freq, setFreq] = useState('once');       // once | recurring | installment
  const [occurrences, setOccurrences] = useState(6);
  const [dayOfMonth, setDayOfMonth] = useState(tx?.date ? Number(tx.date.slice(8, 10)) : 5);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // S11 — sugestão de categoria (histórico local / Groq sob demanda)
  async function suggest() {
    if (!form.description) return;
    setSuggesting(true);
    try {
      const r = await api.post('/ai/suggest', { memo: form.description, amount: Number(form.amount) || 0 });
      const cat = categories.find((c) => c.name === r.categoria);
      if (cat) set('category_id', cat.id);
    } catch { /* silencioso */ }
    finally { setSuggesting(false); }
  }

  const TYPES = [
    { value: 'expense', label: 'Despesa' },
    { value: 'income', label: 'Receita' },
    ...(creditCards.length ? [{ value: 'payment', label: 'Pagar cartão' }] : []),
    ...(others.length ? [{ value: 'transfer', label: 'Transferir' }] : [])
  ];
  const showCategory = form.type === 'expense' || form.type === 'income';
  const showSource = form.type === 'expense' || form.type === 'income';
  const canRepeat = !editing && (form.type === 'expense' || form.type === 'income');
  const selectedIsCard = creditCards.some((c) => String(c.id) === String(form.source_id));
  const isCashExpense = form.type === 'expense' && !selectedIsCard;

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      if (canRepeat && freq !== 'once') {
        await api.post('/recurring', {
          type: form.type,
          person_id: person.id,
          source_id: form.source_id || null,
          category_id: form.category_id || null,
          description: form.description || (form.type === 'income' ? 'Receita' : 'Despesa'),
          amount: Number(form.amount),
          day_of_month: Number(dayOfMonth) || 1,
          start_month: form.date.slice(0, 7),
          total_occurrences: freq === 'installment' ? Number(occurrences) : null
        });
      } else {
        const payload = {
          person_id: form.person_id,
          type: form.type,
          amount: Number(form.amount),
          date: form.date,
          description: form.description,
          source_id: (showSource || form.type === 'payment') ? (form.source_id || null) : null,
          category_id: showCategory ? (form.category_id || null) : null,
          counterparty_person_id: form.type === 'transfer' ? (form.counterparty_person_id || null) : null
        };
        // Pagamento de fatura abate o mês escolhido (reference_month = mês da fatura).
        if (form.type === 'payment') payload.reference_month = invoiceMonth;
        // Ao editar/mover sem alterar a data, preserva o mês de referência já definido.
        else if (editing && form.date === tx.date) payload.reference_month = tx.reference_month;
        // Despesa nova em dinheiro: nasce paga só se marcado (senão fica pendente).
        if (form.type === 'expense' && !editing) payload.paid = paidNow;
        if (editing) await api.put(`/transactions/${tx.id}`, payload);
        else await api.post('/transactions', payload);
      }
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={editing ? 'Editar lançamento' : `Novo · ${person.name}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex gap-2 flex-wrap">
          {TYPES.map((t) => (
            <button key={t.value} type="button"
              onClick={() => { set('type', t.value); if (t.value !== 'income' && t.value !== 'expense') setFreq('once'); }}
              className={`flex-1 min-w-[78px] py-2 rounded-s text-sm font-medium border transition-colors ${
                form.type === t.value ? 'border-azure bg-azure/12 text-paper' : 'border-line text-muted hover:text-paper'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {editing && form.type !== 'transfer' && (
          <label className="block">
            <span className="text-xs text-faint">Conta (dono)</span>
            <select className="field mt-1" value={form.person_id} onChange={(e) => set('person_id', Number(e.target.value))}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {Number(form.person_id) !== person.id && (
              <span className="text-[11px] text-azure mt-1 block">
                Será movido para {people.find((p) => p.id === Number(form.person_id))?.name}.
              </span>
            )}
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-faint">Valor</span>
            <input className="field mt-1" type="number" step="0.01" min="0" required
              value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0,00" />
          </label>
          <label className="block">
            <span className="text-xs text-faint">{freq !== 'once' ? 'Início (mês)' : 'Data'}</span>
            <input className="field mt-1" type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
          </label>
        </div>

        <label className="block">
          <span className="text-xs text-faint">Descrição</span>
          <input className="field mt-1" value={form.description} onChange={(e) => set('description', e.target.value)}
            placeholder={form.type === 'payment' ? 'Pagamento da fatura' : form.type === 'transfer' ? 'Acerto / repasse' : 'Ex: Mercado, salário…'} />
        </label>

        {form.type === 'transfer' && (
          <label className="block">
            <span className="text-xs text-faint">Para qual conta</span>
            <select className="field mt-1" value={form.counterparty_person_id} onChange={(e) => set('counterparty_person_id', e.target.value)}>
              {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}

        {form.type === 'payment' && (
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className="text-xs text-faint">Cartão a pagar</span>
              <select className="field mt-1" value={form.source_id} onChange={(e) => set('source_id', e.target.value)} required>
                <option value="">Selecione…</option>
                {creditCards.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-faint">Fatura de qual mês</span>
              <div className="flex items-center gap-2 mt-1 bg-deep border border-line rounded-full px-2 py-1 w-fit">
                <button type="button" onClick={() => setInvoiceMonth(addMonths(invoiceMonth, -1))} className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-white/5">‹</button>
                <span className="text-sm font-medium min-w-[120px] text-center select-none">{formatMonth(invoiceMonth)}</span>
                <button type="button" onClick={() => setInvoiceMonth(addMonths(invoiceMonth, 1))} className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-white/5">›</button>
              </div>
            </label>
          </div>
        )}

        {(showSource || showCategory) && (
          <div className="grid grid-cols-2 gap-3">
            {showSource && (
              <label className="block">
                <span className="text-xs text-faint">Fonte / cartão</span>
                <select className="field mt-1" value={form.source_id} onChange={(e) => set('source_id', e.target.value)}>
                  <option value="">Dinheiro</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
            {showCategory && (
              <label className="block">
                <span className="text-xs text-faint flex items-center justify-between">
                  Categoria
                  {form.description && (
                    <button type="button" onClick={suggest} disabled={suggesting}
                      className="text-azure hover:text-sky text-[11px] normal-case tracking-normal disabled:opacity-50">
                      {suggesting ? 'sugerindo…' : 'sugerir (IA)'}
                    </button>
                  )}
                </span>
                <select className="field mt-1" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
                  <option value="">—</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
          </div>
        )}

        {isCashExpense && !editing && (
          <label className="flex items-center gap-2.5 text-sm rounded-m border border-line px-3.5 py-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-azure" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} />
            <span className="text-muted">Já paga (sai do caixa agora). Sem marcar, entra como <b className="text-paper font-medium">pendente</b>.</span>
          </label>
        )}

        {canRepeat && (
          <div className="rounded-m border border-line p-4 flex flex-col gap-3">
            <div className="flex gap-2">
              {[['once', 'Única'], ['recurring', 'Todo mês'], ['installment', 'Parcelada']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setFreq(v)}
                  className={`flex-1 py-1.5 rounded-s text-sm border transition-colors ${freq === v ? 'border-azure bg-azure/12 text-paper' : 'border-line text-muted hover:text-paper'}`}>
                  {l}
                </button>
              ))}
            </div>
            {freq !== 'once' && (
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-faint">Dia do mês</span>
                  <NumberStepper value={dayOfMonth} onChange={setDayOfMonth} min={1} max={31} />
                </div>
                {freq === 'installment' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-faint">Parcelas</span>
                    <NumberStepper value={occurrences} onChange={setOccurrences} min={2} max={120} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-[#FF7B7B]">{error}</p>}
        <div className="flex justify-end gap-3 mt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : (freq !== 'once' ? 'Criar recorrência' : 'Salvar')}</Button>
        </div>
      </form>
    </Modal>
  );
}

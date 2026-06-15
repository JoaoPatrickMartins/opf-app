import { useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { Button, Card, Label, Money, Empty, NumberStepper } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const TYPE_LABELS = { credit_card: 'Cartão de crédito', checking: 'Conta corrente', wallet: 'Carteira', cash: 'Dinheiro' };

export default function Sources() {
  const { sources, refreshSources } = useStore();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'credit_card', closing_day: '', due_day: '' });

  async function create(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.post('/sources', {
      name: form.name, type: form.type,
      closing_day: form.type === 'credit_card' && form.closing_day ? Number(form.closing_day) : null,
      due_day: form.type === 'credit_card' && form.due_day ? Number(form.due_day) : null
    });
    setForm({ name: '', type: 'credit_card', closing_day: '', due_day: '' });
    setAdding(false);
    refreshSources();
  }

  async function remove(id) {
    if (!confirm('Excluir esta fonte? Os lançamentos ficam sem fonte.')) return;
    await api.del(`/sources/${id}`);
    refreshSources();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <Label>Cartões e fontes de pagamento</Label>
        <Button onClick={() => setAdding((v) => !v)}>
          <span className="inline-flex items-center gap-1.5"><Icon name="plus" size={16} /> Nova fonte</span>
        </Button>
      </div>

      {adding && (
        <Card>
          <form onSubmit={create} className="flex gap-3 items-end flex-wrap">
            <label className="flex-1 min-w-[160px]">
              <span className="text-xs text-faint">Nome</span>
              <input className="field mt-1" autoFocus value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nubank, Santander…" />
            </label>
            <label>
              <span className="text-xs text-faint">Tipo</span>
              <select className="field mt-1 !w-auto" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            {form.type === 'credit_card' && (
              <>
                <div className="flex flex-col gap-1"><span className="text-xs text-faint">Fechamento</span>
                  <NumberStepper value={form.closing_day || ''} onChange={(v) => setForm((f) => ({ ...f, closing_day: v }))} min={1} max={31} /></div>
                <div className="flex flex-col gap-1"><span className="text-xs text-faint">Vencimento</span>
                  <NumberStepper value={form.due_day || ''} onChange={(v) => setForm((f) => ({ ...f, due_day: v }))} min={1} max={31} /></div>
              </>
            )}
            <Button type="submit">Criar</Button>
          </form>
        </Card>
      )}

      {sources.length === 0 && !adding && <Empty>Nenhuma fonte ainda. Crie seus cartões para importar extratos.</Empty>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {sources.map((s) => (
          <Card key={s.id} className="!p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-m flex items-center justify-center bg-indigo/15 text-azure">
                  <Icon name={s.type === 'credit_card' ? 'card' : 'wallet'} size={20} />
                </div>
                <div>
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-xs text-faint">
                    {TYPE_LABELS[s.type]}
                    {s.type === 'credit_card' && s.closing_day && ` · fecha ${s.closing_day}${s.due_day ? `, vence ${s.due_day}` : ''}`}
                  </div>
                </div>
              </div>
              <button onClick={() => remove(s.id)} className="text-faint hover:text-[#FF7B7B]"><Icon name="trash" size={15} /></button>
            </div>
            {s.invoice && (
              <div className="mt-5 pt-4 border-t border-line-soft flex items-baseline justify-between">
                <span className="text-[11px] text-faint uppercase tracking-wider">Fatura em aberto</span>
                <Money value={-s.invoice.debt} className={`text-lg font-semibold ${s.invoice.debt > 0 ? 'text-caution' : 'text-positive'}`} />
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { formatDay, formatMonth } from '../lib/format.js';
import { Card, Label, Money, Empty, Button } from '../components/ui.jsx';
import Icon, { categoryIcon } from '../components/Icon.jsx';
import TransactionForm from '../components/TransactionForm.jsx';

const TYPE_TX = { expense: 'Despesa', income: 'Receita', payment: 'Pagamento', transfer: 'Transferência' };
const TABS = [['extrato', 'Extrato'], ['expenses', 'Despesas'], ['incomes', 'Receitas']];

function Stat({ label, value, tone = '' }) {
  return (
    <Card className="!p-5">
      <div className="text-[11px] uppercase tracking-wider text-faint">{label}</div>
      <Money value={value} className={`text-lg font-semibold ${tone}`} />
    </Card>
  );
}

export default function PersonDetail() {
  const { id } = useParams();
  const { month, refreshPeople, refreshSources } = useStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('extrato');
  const [form, setForm] = useState(null); // { tx } | { initialType } | null

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/people/${id}/statement?month=${month}`).then(setData).finally(() => setLoading(false));
  }, [id, month]);

  useEffect(() => { load(); }, [load]);

  async function remove(txId) {
    if (!confirm('Excluir este lançamento?')) return;
    await api.del(`/transactions/${txId}`);
    load(); refreshPeople(); refreshSources();
  }
  function onSaved() { setForm(null); load(); refreshPeople(); refreshSources(); }

  if (loading || !data) return <Empty>Carregando…</Empty>;
  const { person, totals, bySource, byCategory } = data;
  const rows = tab === 'expenses' ? data.expenses : tab === 'incomes' ? data.incomes : data.transactions;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/people" className="text-sm text-muted hover:text-paper w-fit">‹ Contas</Link>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full flex items-center justify-center bg-indigo/15 text-azure" style={person.color ? { color: person.color } : {}}>
            <Icon name="user" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold leading-none">{person.name}</h1>
            <div className="text-xs text-faint mt-1">{formatMonth(month)}</div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setForm({ initialType: 'expense' })}><span className="inline-flex items-center gap-1.5"><Icon name="plus" size={15} /> Despesa</span></Button>
          <Button variant="secondary" onClick={() => setForm({ initialType: 'income' })}>Receita</Button>
          <Button variant="ghost" onClick={() => setForm({ initialType: 'payment' })}>Pagar cartão</Button>
          <Button variant="ghost" onClick={() => setForm({ initialType: 'transfer' })}><span className="inline-flex items-center gap-1.5"><Icon name="swap" size={15} /> Transferir</span></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Saldo de caixa" value={person.cash_balance} tone={person.cash_balance < 0 ? 'text-caution' : ''} />
        <Stat label="Gastos do mês" value={-totals.gastos} />
        <Stat label="Receitas do mês" value={totals.receitas} tone="text-positive" />
        <Stat label="No cartão (a pagar)" value={-totals.gastos_cartao} tone="text-sky" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 items-start">
        {/* Lançamentos com abas */}
        <div className="bg-deep border border-line rounded-l overflow-hidden">
          <div className="flex border-b border-line">
            {TABS.map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)}
                className={`px-5 py-3 text-sm font-medium transition-colors ${tab === v ? 'text-paper border-b-2 border-azure' : 'text-muted hover:text-paper'}`}>
                {l}
              </button>
            ))}
          </div>
          {rows.length === 0 ? (
            <Empty>Nada neste mês.</Empty>
          ) : (
            <div className="divide-y divide-line-soft">
              {rows.map((t) => {
                const incoming = t.flow === 'transfer_in';
                const positive = t.type === 'income' || incoming;
                return (
                  <div key={`${t.id}-${t.flow || ''}`} className="flex items-center gap-3 px-5 py-2.5 group">
                    <div className="w-9 h-9 rounded-[9px] flex items-center justify-center bg-indigo/15 text-azure flex-none">
                      <Icon name={t.type === 'expense' ? categoryIcon(t.category_name) : t.type === 'income' ? 'trend' : t.type === 'payment' ? 'card' : 'swap'} size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">
                        {t.description || '(sem descrição)'}
                        {t.installment && <span className="text-faint text-xs ml-1.5">· {t.installment}</span>}
                      </div>
                      <div className="text-[11px] text-faint flex gap-2 flex-wrap mt-0.5">
                        <span>{formatDay(t.date)}</span>
                        <span>· {incoming ? `de ${t.counterparty_name}` : TYPE_TX[t.type]}</span>
                        {t.source_name && <span>· {t.source_name}</span>}
                        {t.category_name && <span>· {t.category_name}</span>}
                        {t.type === 'transfer' && !incoming && t.counterparty_name && <span>· para {t.counterparty_name}</span>}
                      </div>
                    </div>
                    <Money value={positive ? t.amount : -t.amount} className={`text-sm font-semibold ${positive ? 'text-positive' : ''}`} />
                    {!incoming && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setForm({ tx: t })} className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-white/5"><Icon name="edit" size={14} /></button>
                        <button onClick={() => remove(t.id)} className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-[#FF7B7B] hover:bg-white/5"><Icon name="trash" size={14} /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Painéis: por cartão + por categoria */}
        <div className="flex flex-col gap-6">
          <Card>
            <Label className="mb-4">Despesas por cartão</Label>
            {bySource.length === 0 ? <p className="text-sm text-faint">Sem despesas.</p> : (
              <div className="flex flex-col gap-2.5">
                {bySource.map((s) => (
                  <div key={s.source_id || 'cash'} className="flex justify-between items-center text-sm">
                    <span className="text-muted flex items-center gap-2">
                      <Icon name={s.source_type === 'credit_card' ? 'card' : 'wallet'} size={15} /> {s.source_name}
                    </span>
                    <Money value={-s.spent} className="font-medium" />
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <Label className="mb-4">Por categoria</Label>
            {byCategory.length === 0 ? <p className="text-sm text-faint">Sem despesas.</p> : (
              <div className="flex flex-col gap-2.5">
                {byCategory.map((c) => (
                  <div key={c.category_name} className="flex justify-between text-sm">
                    <span className="text-muted">{c.category_name}</span>
                    <Money value={-c.spent} className="font-medium" />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {form && (
        <TransactionForm
          person={person}
          tx={form.tx}
          initialType={form.initialType}
          onClose={() => setForm(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

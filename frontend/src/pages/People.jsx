import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { Button, Card, Label, Money, Empty } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

export default function People() {
  const { people, refreshPeople } = useStore();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', initial_balance: '' });

  async function create(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.post('/people', { name: form.name, initial_balance: Number(form.initial_balance) || 0 });
    setForm({ name: '', initial_balance: '' });
    setAdding(false);
    refreshPeople();
  }

  async function remove(id) {
    if (!confirm('Excluir esta conta e todos os seus lançamentos?')) return;
    await api.del(`/people/${id}`);
    refreshPeople();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <Label>Contas (pessoas / responsáveis)</Label>
        <Button onClick={() => setAdding((v) => !v)}>
          <span className="inline-flex items-center gap-1.5"><Icon name="plus" size={16} /> Nova conta</span>
        </Button>
      </div>

      {adding && (
        <Card>
          <form onSubmit={create} className="flex gap-3 items-end flex-wrap">
            <label className="flex-1 min-w-[180px]">
              <span className="text-xs text-faint">Nome</span>
              <input className="field mt-1" autoFocus value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Sogra, Esposa, Filha…" />
            </label>
            <label>
              <span className="text-xs text-faint">Saldo inicial (opcional)</span>
              <input className="field mt-1 !w-40" type="number" step="0.01" value={form.initial_balance}
                onChange={(e) => setForm((f) => ({ ...f, initial_balance: e.target.value }))} placeholder="0,00" />
            </label>
            <Button type="submit">Criar</Button>
          </form>
        </Card>
      )}

      {people.length === 0 && !adding && <Empty>Nenhuma conta ainda.</Empty>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {people.map((p) => (
          <Card key={p.id} className="!p-6">
            <div className="flex items-start justify-between">
              <Link to={`/people/${p.id}`} className="flex items-center gap-3 group">
                <div className="w-11 h-11 rounded-full flex items-center justify-center bg-indigo/15 text-azure" style={p.color ? { color: p.color } : {}}>
                  <Icon name="user" size={22} />
                </div>
                <div>
                  <div className="font-semibold group-hover:text-sky transition-colors">{p.name}</div>
                  {p.is_self ? <div className="text-[11px] text-faint">você</div> : null}
                </div>
              </Link>
              {!p.is_self && (
                <button onClick={() => remove(p.id)} className="text-faint hover:text-[#FF7B7B]"><Icon name="trash" size={15} /></button>
              )}
            </div>
            <div className="mt-5 flex items-baseline justify-between">
              <span className="text-[11px] text-faint uppercase tracking-wider">Saldo de caixa</span>
              <Money value={p.cash_balance} className={`text-lg font-semibold ${p.cash_balance < 0 ? 'text-caution' : ''}`} />
            </div>
            <Link to={`/people/${p.id}`} className="mt-3 inline-flex items-center gap-1.5 text-sm text-azure hover:text-sky">
              <Icon name="list" size={15} /> Abrir conta
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}

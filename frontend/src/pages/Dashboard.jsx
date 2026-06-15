import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { formatMonth, formatMonthShort } from '../lib/format.js';
import { Card, Label, Money, Chip, Empty, Button } from '../components/ui.jsx';
import Icon, { categoryIcon } from '../components/Icon.jsx';

export default function Dashboard() {
  const { month, people, categories, refreshPeople } = useStore();
  const [summary, setSummary] = useState(null);
  const [compare, setCompare] = useState([]);
  const [settle, setSettle] = useState(null);
  const [insight, setInsight] = useState(null);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  // S15 — Pergunte ao OPF
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState(null);

  function loadInsight(force) {
    api.get(`/ai/insights?month=${month}${force ? '&force=1' : ''}`).then(setInsight).catch(() => setInsight(null));
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setAnswer(null);
    Promise.all([
      api.get(`/transactions/summary?month=${month}`),
      api.get('/transactions/compare?months=6'),
      api.get('/people/settlement'),
      api.get('/ai/subscriptions').catch(() => [])
    ]).then(([s, c, st, sub]) => {
      if (!active) return;
      setSummary(s); setCompare(c); setSettle(st); setSubs(sub);
    }).finally(() => active && setLoading(false));
    loadInsight(false);
    return () => { active = false; };
  }, [month, people]);

  async function ask(e) {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true); setAnswer(null);
    try {
      const r = await api.post(`/ai/ask?month=${month}`, { question });
      setAnswer(r);
    } catch (err) { setAnswer({ error: err.message }); }
    finally { setAsking(false); }
  }

  async function createRecurringFromSub(sub) {
    const person = people.find((p) => p.name === sub.person_name);
    const category = categories.find((c) => c.name === sub.category_name);
    if (!person) return alert('Defina a quem pertence antes.');
    await api.post('/recurring', {
      type: 'expense', person_id: person.id, category_id: category?.id || null,
      description: sub.description, amount: sub.avg_amount, day_of_month: 1, start_month: month
    });
    refreshPeople();
    alert('Recorrência criada. Ajuste o dia em Configurações se precisar.');
  }

  if (loading || !summary) return <Empty>Carregando…</Empty>;
  const { totals, byCategory, byPerson, bySource } = summary;
  const hasData = totals.gastos > 0 || totals.receitas > 0;

  const prev = compare.length >= 2 ? compare[compare.length - 2] : null;
  const delta = prev && prev.gastos > 0 ? Math.round(((totals.gastos - prev.gastos) / prev.gastos) * 100) : null;
  const maxCat = Math.max(1, ...byCategory.map((c) => c.spent));
  const maxBar = Math.max(1, ...compare.map((c) => c.gastos));
  const maxPerson = Math.max(1, ...byPerson.map((p) => p.gastos));
  const settleTransfers = settle?.transfers || [];

  return (
    <div className="flex flex-col gap-7">
      <div>
        <Label>Gastos · {formatMonth(month)}</Label>
        <div className="mt-2 flex items-end gap-4 flex-wrap">
          <Money value={-totals.gastos} big grad />
          {delta != null && (
            <Chip tone={delta <= 0 ? 'pos' : 'cau'}>{delta <= 0 ? '↓' : '↑'} {Math.abs(delta)}% vs. {formatMonthShort(prev.month)}</Chip>
          )}
        </div>
        <div className="flex gap-7 mt-4 text-sm flex-wrap">
          <div><span className="text-faint">Receitas </span><span className="amount text-positive">R$ {totals.receitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
          <div><span className="text-faint">No cartão </span><span className="amount text-sky">R$ {totals.gastos_cartao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
          {totals.pagamentos > 0 && <div><span className="text-faint">Pagamentos </span><span className="amount">R$ {totals.pagamentos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>}
        </div>
      </div>

      {/* S13 — insight calmo */}
      {insight?.text && (
        <div className="flex gap-3 items-start p-5 rounded-m bg-azure/8 border border-azure/15">
          <Icon name="spark" size={18} className="text-azure flex-none mt-0.5" />
          <p className="text-[13px] text-sky font-light leading-relaxed flex-1">{insight.text}</p>
          {insight.ai && (
            <button onClick={() => loadInsight(true)} className="text-faint hover:text-paper text-xs flex-none" title="Atualizar">
              <Icon name="repeat" size={15} />
            </button>
          )}
        </div>
      )}

      {/* S15 — Pergunte ao OPF */}
      <form onSubmit={ask} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input className="field" value={question} onChange={(e) => setQuestion(e.target.value)}
            placeholder="Pergunte ao OPF: quanto gastei com mercado este mês?" />
          <Button type="submit" variant="secondary" disabled={asking}>{asking ? '…' : 'Perguntar'}</Button>
        </div>
        {answer && (
          <div className="p-4 rounded-m bg-deep border border-line text-sm">
            {answer.error ? <span className="text-[#FF7B7B]">{answer.error}</span> : (
              <div>
                {answer.result?.value != null && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-faint text-xs">{answer.result.operation === 'count' ? 'quantidade' : answer.result.operation === 'avg' ? 'média' : 'total'}:</span>
                    <Money value={answer.result.value} className="text-lg font-semibold" />
                  </div>
                )}
                {answer.result?.rows?.length > 0 && answer.result.value == null && (
                  <div className="text-muted text-xs">{answer.result.rows.length} lançamentos encontrados.</div>
                )}
                {Object.keys(answer.result?.resolved || {}).length > 0 && (
                  <div className="text-[11px] text-faint mt-1">filtros: {Object.entries(answer.result.resolved).map(([k, v]) => `${k}=${v}`).join(', ')}</div>
                )}
              </div>
            )}
          </div>
        )}
      </form>

      {!hasData && <Empty>Nenhum lançamento neste mês. Importe um extrato ou lance dentro de uma conta.</Empty>}

      {hasData && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
            <Card>
              <Label className="mb-5">Por categoria</Label>
              <div className="flex flex-col gap-4">
                {byCategory.filter((c) => c.spent > 0).map((c) => {
                  const over = c.budget_limit && c.spent > c.budget_limit;
                  return (
                    <div key={c.category_id} className="grid grid-cols-[34px_1fr_auto] gap-3 items-center">
                      <div className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center bg-indigo/15 text-azure">
                        <Icon name={categoryIcon(c.category_name)} size={17} />
                      </div>
                      <div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-sm font-medium">{c.category_name}</span>
                          {over && <Chip tone="cau">acima do limite</Chip>}
                        </div>
                        <div className="h-1 rounded bg-white/8 mt-2 overflow-hidden">
                          <i className="block h-full rounded bg-aurora" style={{ width: `${Math.round((c.spent / maxCat) * 100)}%` }} />
                        </div>
                      </div>
                      <Money value={-c.spent} className="text-sm font-semibold" />
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <Label className="mb-5">Últimos meses</Label>
              <div className="flex items-end gap-2.5 h-[120px]">
                {compare.map((c) => (
                  <div key={c.month} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div className="w-full rounded-t-md" style={{ height: `${Math.max(4, Math.round((c.gastos / maxBar) * 100))}%`, background: c.month === month ? 'var(--aurora)' : 'rgba(77,166,255,0.28)' }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[11px] text-faint">
                {compare.map((c) => <span key={c.month}>{formatMonthShort(c.month).split(' ')[0]}</span>)}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Gastos por conta */}
            <Card>
              <Label className="mb-5">Gastos por conta</Label>
              <div className="flex flex-col gap-4">
                {byPerson.filter((p) => p.gastos > 0 || p.receitas > 0).map((p) => (
                  <Link key={p.person_id} to={`/people/${p.person_id}`} className="grid grid-cols-[1fr_auto] gap-3 items-center group">
                    <div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-sm font-medium group-hover:text-sky transition-colors">{p.name}</span>
                      </div>
                      <div className="h-1 rounded bg-white/8 mt-2 overflow-hidden">
                        <i className="block h-full rounded bg-aurora" style={{ width: `${Math.round((p.gastos / maxPerson) * 100)}%` }} />
                      </div>
                    </div>
                    <Money value={-p.gastos} className="text-sm font-semibold" />
                  </Link>
                ))}
              </div>
            </Card>

            {/* Quem deve a quem (S2) */}
            <Card>
              <Label className="mb-4">Quem deve a quem</Label>
              {settleTransfers.length === 0 ? (
                <p className="text-sm text-muted font-light">Tudo acertado entre as contas.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {settleTransfers.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{t.from}</span>
                      <Icon name="swap" size={15} className="text-azure" />
                      <span className="font-medium">{t.to}</span>
                      <span className="ml-auto"><Money value={t.amount} className="font-semibold text-caution" /></span>
                    </div>
                  ))}
                  <p className="text-xs text-faint font-light mt-1">Registre como transferência na conta de quem deve para quitar.</p>
                </div>
              )}
            </Card>
          </div>

          {/* S14 — assinaturas/recorrências detectadas */}
          {subs.length > 0 && (
            <Card>
              <Label className="mb-4">Cobranças que se repetem</Label>
              <div className="flex flex-col gap-3">
                {subs.slice(0, 6).map((s, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <Icon name="repeat" size={16} className="text-azure flex-none" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{s.description}</div>
                      <div className="text-[11px] text-faint">{s.months_count} meses · {s.person_name || '—'}{s.category_name ? ` · ${s.category_name}` : ''}</div>
                    </div>
                    <Money value={-s.avg_amount} className="font-medium" />
                    <button onClick={() => createRecurringFromSub(s)} className="text-azure hover:text-sky text-xs flex-none">criar recorrência</button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-faint font-light mt-3">Detectado pelo padrão de repetição — nada é criado sem você confirmar.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { Button, Card, Label, Chip, Money } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const AI_LABELS = {
  import: 'Importação (sugerir categoria + pessoa)',
  manual: 'Entrada manual (botão "sugerir")',
  insights: 'Insights do mês',
  subscriptions: 'Detecção de assinaturas',
  ask: 'Pergunte ao OPF'
};

export default function Settings() {
  const { categories, refreshCategories } = useStore();
  const [newCat, setNewCat] = useState('');
  const [settings, setSettings] = useState(null);
  const [groqKey, setGroqKey] = useState('');
  const [recurring, setRecurring] = useState([]);
  const [savedMsg, setSavedMsg] = useState('');

  function loadRecurring() { api.get('/recurring').then(setRecurring); }
  function loadSettings() { api.get('/settings').then(setSettings); }
  useEffect(() => { loadSettings(); loadRecurring(); }, []);

  async function addCategory(e) {
    e.preventDefault();
    if (!newCat.trim()) return;
    try { await api.post('/categories', { name: newCat.trim() }); setNewCat(''); refreshCategories(); }
    catch (err) { alert(err.message); }
  }
  async function updateLimit(cat, value) {
    await api.put(`/categories/${cat.id}`, { budget_limit: value === '' ? null : Number(value) });
    refreshCategories();
  }
  async function removeCategory(id) {
    if (!confirm('Excluir categoria?')) return;
    await api.del(`/categories/${id}`); refreshCategories();
  }
  async function cancelRecurring(id) {
    if (!confirm('Cancelar esta recorrência? Ela para de gerar lançamentos futuros; os já ocorridos permanecem.')) return;
    await api.post(`/recurring/${id}/cancel`, {}); loadRecurring();
  }
  async function removeRecurring(id) {
    if (!confirm('Excluir esta recorrência? Os lançamentos futuros (ainda não ocorridos) também saem.')) return;
    await api.del(`/recurring/${id}`); loadRecurring();
  }
  async function toggleAi(feature, value) {
    await api.put('/settings', { ai: { [feature]: value } });
    loadSettings();
  }
  async function saveGroq() {
    await api.put('/settings', { groq_api_key: groqKey });
    setGroqKey(''); loadSettings();
    setSavedMsg('Chave salva.'); setTimeout(() => setSavedMsg(''), 2000);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Categorias */}
      <Card>
        <Label className="mb-4">Categorias & limites de orçamento</Label>
        <div className="flex flex-col gap-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <span className="flex-1 text-sm">{c.name}</span>
              <span className="text-xs text-faint">limite R$</span>
              <input className="field !w-28 !py-1.5 text-sm text-right" type="number" step="0.01" min="0"
                defaultValue={c.budget_limit ?? ''} placeholder="—" onBlur={(e) => updateLimit(c, e.target.value)} />
              <button onClick={() => removeCategory(c.id)} className="text-faint hover:text-[#FF7B7B]"><Icon name="trash" size={15} /></button>
            </div>
          ))}
        </div>
        <form onSubmit={addCategory} className="flex gap-2 mt-4 pt-4 border-t border-line-soft">
          <input className="field" placeholder="Nova categoria" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
          <Button type="submit" variant="ghost" className="!px-3"><Icon name="plus" size={16} /></Button>
        </form>
      </Card>

      {/* Recorrências */}
      <Card>
        <Label className="mb-4">Receitas e gastos recorrentes</Label>
        {recurring.length === 0 ? (
          <p className="text-sm text-faint font-light">Crie dentro de uma conta (Despesa/Receita → "Todo mês" ou "Parcelada").</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recurring.map((r) => {
              const cancelled = r.active === 0;
              return (
                <div key={r.id} className={`flex items-center gap-3 py-1.5 ${cancelled ? 'opacity-50' : ''}`}>
                  <Chip tone={r.type === 'income' ? 'pos' : 'neu'}>{r.type === 'income' ? 'receita' : 'gasto'}</Chip>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate flex items-center gap-2">
                      <span className="truncate">{r.description} <span className="text-faint text-xs">· {r.person_name}</span></span>
                      {cancelled && <Chip tone="cau">cancelada</Chip>}
                    </div>
                    <div className="text-[11px] text-faint">
                      dia {r.day_of_month}{r.total_occurrences ? ` · ${r.total_occurrences}x (parcelada)` : ' · todo mês'}{r.category_name ? ` · ${r.category_name}` : ''}
                    </div>
                  </div>
                  <Money value={r.type === 'income' ? r.amount : -r.amount} className={`text-sm font-semibold ${r.type === 'income' ? 'text-positive' : ''}`} />
                  {!cancelled && (
                    <button onClick={() => cancelRecurring(r.id)} title="Cancelar (parar daqui pra frente)"
                      className="text-xs text-faint hover:text-caution transition-colors">Cancelar</button>
                  )}
                  <button onClick={() => removeRecurring(r.id)} title="Excluir recorrência" className="text-faint hover:text-[#FF7B7B]"><Icon name="trash" size={15} /></button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Groq + IA */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <Label>Chave da Groq API</Label>
          {settings && <Chip tone={settings.groq_configured ? 'pos' : 'cau'}>{settings.groq_configured ? `configurada (${settings.groq_source})` : 'não configurada'}</Chip>}
        </div>
        <div className="flex gap-2">
          <input className="field" type="password" placeholder="gsk_…" value={groqKey} onChange={(e) => setGroqKey(e.target.value)} />
          <Button variant="ghost" onClick={saveGroq} disabled={!groqKey}>Salvar</Button>
        </div>
        {savedMsg && <span className="text-sm text-positive">{savedMsg}</span>}

        <div className="mt-5 pt-5 border-t border-line-soft">
          <Label className="mb-3">Recursos de IA (dados enviados à Groq)</Label>
          <div className="flex flex-col gap-2.5">
            {settings && Object.entries(AI_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 text-sm">
                <span className={settings.groq_configured ? '' : 'text-faint'}>{label}</span>
                <input type="checkbox" className="w-4 h-4 accent-azure" disabled={!settings.groq_configured}
                  checked={!!settings.ai?.[key]} onChange={(e) => toggleAi(key, e.target.checked)} />
              </label>
            ))}
          </div>
          {settings && !settings.groq_configured && <p className="text-xs text-faint mt-2">Configure a chave para habilitar.</p>}
        </div>
      </Card>

      {/* Backup */}
      <Card>
        <Label className="mb-4">Backup / exportação</Label>
        <div className="flex gap-3">
          <a href="/api/export/json" className="text-sm text-azure hover:text-sky inline-flex items-center gap-1.5"><Icon name="upload" size={15} /> Backup JSON</a>
          <a href="/api/export/csv" className="text-sm text-azure hover:text-sky inline-flex items-center gap-1.5"><Icon name="list" size={15} /> Lançamentos CSV</a>
        </div>
      </Card>
    </div>
  );
}

import { useState, useRef } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { formatDay, formatMonth } from '../lib/format.js';
import { Button, Label, Money, Chip, Empty } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

export default function Import() {
  const { sources, people, categories, refreshPeople, refreshSources } = useStore();
  const [sourceId, setSourceId] = useState('');
  const [preview, setPreview] = useState(null);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const fileRef = useRef();

  const catByName = Object.fromEntries(categories.map((c) => [c.name, c.id]));
  const personByName = Object.fromEntries(people.map((p) => [p.name, p.id]));
  const selfPerson = people.find((p) => p.is_self) || people[0];

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    if (sourceId) fd.append('source_id', sourceId);
    try {
      const data = await api.upload('/import/preview', fd);
      setPreview(data);
      setRows(data.items.map((it) => ({
        ...it,
        // original do extrato é a descrição principal (e o que será salvo);
        // o rótulo da IA fica como sugestão secundária aplicável
        description: it.memo || it.description,
        ai_label: it.description && it.description !== it.memo ? it.description : null,
        exclude: it.duplicate,
        category_id: catByName[it.suggested_category] || '',
        category_name: it.suggested_category || '',
        person_id: personByName[it.suggested_person] || selfPerson?.id || '',
        person_name: it.suggested_person || selfPerson?.name || ''
      })));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  function setRow(i, patch) { setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r))); }
  function setCategory(i, id) { setRow(i, { category_id: id, category_name: categories.find((c) => c.id === Number(id))?.name || '' }); }
  function setPerson(i, id) { setRow(i, { person_id: id, person_name: people.find((p) => p.id === Number(id))?.name || '' }); }
  function applyPersonAll(id) {
    const name = people.find((p) => p.id === Number(id))?.name || '';
    setRows((rs) => rs.map((r) => (r.exclude ? r : { ...r, person_id: id, person_name: name })));
  }

  async function confirm() {
    setBusy(true); setError(null);
    try {
      const res = await api.post('/import/confirm', {
        source_id: sourceId ? Number(sourceId) : null,
        items: rows.map((r) => ({
          fitid: r.fitid, type: r.type, amount: r.amount, date: r.date, reference_month: r.reference_month,
          description: r.description, memo: r.memo, installment: r.installment, source: r.source,
          person_id: r.person_id ? Number(r.person_id) : null, person_name: r.person_name || null,
          category_id: r.category_id ? Number(r.category_id) : null, category_name: r.category_name || null,
          suggestion_source: r.suggestion_source, exclude: r.exclude
        }))
      });
      setResult(res); setPreview(null); setRows([]);
      refreshPeople(); refreshSources();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const included = rows.filter((r) => !r.exclude).length;

  return (
    <div className="flex flex-col gap-6">
      {!preview && (
        <div className="flex flex-col gap-5">
          <div>
            <Label className="mb-2">Cartão / fonte de origem</Label>
            <select className="field !w-auto" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">Selecione…</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <label className={`border border-dashed rounded-l p-12 flex flex-col items-center gap-3 cursor-pointer transition-colors ${sourceId ? 'border-azure/40 hover:bg-azure/5' : 'border-line opacity-50 pointer-events-none'}`}>
            <Icon name="upload" size={32} className="text-azure" />
            <div className="text-center">
              <div className="font-medium">{busy ? 'Processando…' : 'Enviar extrato (OFX ou PDF)'}</div>
              <div className="text-sm text-muted font-light mt-1">A IA sugere categoria e a quem pertence cada despesa. Você revisa e distribui.</div>
            </div>
            <input ref={fileRef} type="file" accept=".ofx,.pdf" className="hidden" onChange={handleFile} disabled={!sourceId || busy} />
          </label>
          {!sourceId && <p className="text-sm text-faint">Escolha o cartão de origem antes de enviar.</p>}
          {error && <p className="text-sm text-[#FF7B7B]">{error}</p>}
          {result && (
            <div className="p-5 rounded-m bg-positive/8 border border-positive/20 text-positive">
              Importação concluída: <b>{result.saved}</b> despesas distribuídas, {result.skipped} ignoradas.
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-semibold">{preview.bank} · {preview.format.toUpperCase()}</h2>
              <p className="text-sm text-muted font-light">
                {included} de {rows.length} serão importadas{preview.source ? ` para ${preview.source.name}` : ''}
                {preview.referenceMonth && ` · fatura de ${formatMonth(preview.referenceMonth)}`}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <select className="field !w-auto text-xs" defaultValue="" onChange={(e) => { if (e.target.value) applyPersonAll(e.target.value); e.target.value = ''; }}>
                <option value="">Atribuir todas a…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <Button variant="ghost" onClick={() => { setPreview(null); setRows([]); }}>Cancelar</Button>
              <Button onClick={confirm} disabled={busy || included === 0}>{busy ? 'Salvando…' : `Distribuir (${included})`}</Button>
            </div>
          </div>

          {preview.aiError && <div className="p-3 rounded-m bg-caution/10 border border-caution/20 text-caution text-sm">Sugestões da IA indisponíveis ({preview.aiError}). Classifique manualmente.</div>}
          {error && <p className="text-sm text-[#FF7B7B]">{error}</p>}

          <div className="bg-deep border border-line rounded-l overflow-hidden">
            <div className="grid grid-cols-[40px_64px_1fr_150px_150px_88px] gap-3 px-5 py-3 border-b border-line text-[11px] uppercase tracking-wider text-faint">
              <span></span><span>Data</span><span>Descrição</span><span>Categoria</span><span>De quem</span><span className="text-right">Valor</span>
            </div>
            <div className="divide-y divide-line-soft max-h-[55vh] overflow-auto">
              {rows.map((r, i) => (
                <div key={r.key} className={`grid grid-cols-[40px_64px_1fr_150px_150px_88px] gap-3 px-5 py-2.5 items-center ${r.exclude ? 'opacity-40' : ''}`}>
                  <input type="checkbox" checked={!r.exclude} onChange={(e) => setRow(i, { exclude: !e.target.checked })} className="w-4 h-4 accent-azure" />
                  <span className="text-xs text-muted">{formatDay(r.date)}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <input
                        className="bg-transparent text-sm font-medium text-paper w-full outline-none rounded-md px-1.5 -mx-1.5 py-0.5 transition-colors hover:bg-white/[0.03] focus:bg-void focus:ring-1 focus:ring-azure/40 truncate"
                        value={r.description}
                        onChange={(e) => setRow(i, { description: e.target.value })}
                        title="Descrição (do extrato) — editável"
                      />
                      {r.installment && <span className="text-faint text-xs flex-none">· {r.installment}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {r.ai_label && r.ai_label !== r.description && (
                        <button type="button" onClick={() => setRow(i, { description: r.ai_label })}
                          title="Usar a sugestão da IA como descrição"
                          className="group inline-flex items-center gap-1 text-[11px] text-faint hover:text-sky transition-colors">
                          <Icon name="spark" size={11} className="text-azure/60 group-hover:text-azure" />
                          <span className="text-muted group-hover:text-sky">{r.ai_label}</span>
                          <span className="text-azure/0 group-hover:text-azure/80 transition-colors">· usar</span>
                        </button>
                      )}
                      {r.card_last4 && <span className="text-[10px] text-faint">cartão ··{r.card_last4}</span>}
                      {r.duplicate && <Chip tone="cau">duplicado</Chip>}
                      {r.suggestion_source === 'local' && <span className="text-[10px] text-azure">do histórico</span>}
                    </div>
                  </div>
                  <select className="field !py-1.5 text-xs" value={r.category_id} onChange={(e) => setCategory(i, e.target.value)}>
                    <option value="">—</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select className="field !py-1.5 text-xs" value={r.person_id} onChange={(e) => setPerson(i, e.target.value)}>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Money value={-r.amount} className="text-sm text-right justify-self-end" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

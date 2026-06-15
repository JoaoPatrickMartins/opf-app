# STATUS — OPF

> Contexto vivo do progresso. Atualizado no **início** e **fim** de cada etapa para permitir retomada após interrupção.

**Última atualização:** 2026-06-15
**Fase atual:** ✅ v2 completa (F1–F8 + IA1–IA3) e verificada. Ver [PLANEJAMENTO-v2.md](PLANEJAMENTO-v2.md).

## v2 — progresso
- ✅ F1 Modelo & migração (people, sources; recomeço limpo + seed Própria). Boot/idempotência ok.
- ✅ F2 Backend pessoas (`lib/balances.js`, `routes/people.js`: caixa, gastos, extrato, por cartão, settlement). Verificado.
- ✅ F3 Backend cartões/fontes (`routes/sources.js`: CRUD, fatura/dívida). Verificado.
- ✅ F4 Transações v2 (expense/income/payment/transfer + contraparte) + "quem deve a quem". E2E: caixa ignora cartão, fatura abate, acerto neta a zero.
- ✅ F5 Receita parcelada 1/6 (`total_occurrences`) + gastos fixos. E2E: 1/6→3/6, para após N.
- ✅ F6 Importação v2 (alvo=cartão, IA sugere categoria+pessoa, despacha por pessoa). E2E com IA real.
- ✅ F7 Frontend v2 (store people/sources, Dashboard consolidado + settlement, Contas/People, PersonDetail admin completa, Cartões/Sources, Import v2, Settings com IA/export, TransactionForm v2).
- ✅ F8 Build OK + produção verificada (SPA + endpoints v2 + export + toggles IA).
- ✅ IA1 S12 limpeza de descrições (rótulo legível no import, memo original preservado) + S11 sugestão manual (`/ai/suggest`, botão "sugerir" no form).
- ✅ IA2 S13 insights (`/ai/insights`, cache por mês, "atualizar", fallback sem IA, mês por extenso) + S14 assinaturas (`/ai/subscriptions` heurística, painel + "criar recorrência").
- ✅ IA3 S15 Pergunte ao OPF (`/ai/ask`: NL→spec→consulta segura no código; caixa no Dashboard com valor + filtros).
- ✅ D6 interruptores por recurso em Configurações (import/manual/insights/subscriptions/ask).

**Verificação IA (Groq real):** suggest classificou "Dl *Uberrides"→Transporte/"Uber"; insight calmo com R$/mês por extenso; subscriptions achou Netflix (3 meses); ask "gastei com assinaturas"→R$55,90 exato; toggle off bloqueia. Build final OK.

Backend extra: `routes/export.js` (S6 CSV/JSON), `settings.js` com interruptores de IA por recurso (D6).
Nota: parser OFX decodifica latin1 (Windows-1252, conforme requisito). Arquivos OFX em UTF-8 podem mostrar acento trocado — avaliar detecção de charset se necessário.

## Correção do parser PDF Santander (fatura real)
- O parser antigo assumia estrutura errada. Reescrito `pdf-santander.js` para o **formato real**: valores sem "R$", linhas com marcador/ícone antes da data (`3`/`@`/`2`), cartão mascarado (`5201 XXXX XXXX 4705`), separação por cartão (titular + adicional `@`), seções Parcelamentos/Despesas, ignora Pagamentos e ANUIDADE.
- Testado com o texto da fatura real: **36 transações**, separadas por cartão (4705=20, 2620=16), soma R$ 2.282,36 (bate com os totais 1.280,64−19,50 + 1.021,22).
- **Extração por IA preferida no PDF** (`ai/extract.js`): mais robusta entre layouts. Envia o texto a partir de "Detalhamento da Fatura" (sem cortar), captura **Despesas + Parcelamentos de TODOS os cartões + anuidade**. O parser determinístico vira fallback; o import usa o que tiver MAIS itens. Erros em `aiError`.
- **Anuidade incluída** como despesa (parser e IA). Validação com a fatura real: 37 itens = R$ 2.301,86 (= total despesas Brasil).
- `card_last4` exibido na revisão (titular ··4705 vs adicional ··2620) para ajudar a atribuir a pessoa.
- Mês de referência do cartão: "compras realizadas até DD/MM" + ano do vencimento.

### Convenções v2 (decididas)
- Saldo da despesa de cartão só afeta o **caixa** quando a fatura é paga. Cada pessoa tem **caixa** (dinheiro) e **gastos do mês** (consciência, inclui cartão).
- `amount` armazenado como **magnitude positiva**; direção vem do `type`.
- acerto(P) = gastos no cartão − pagamentos feitos − transferências enviadas + recebidas. >0 deve, <0 a receber.

---

## (Histórico) v1.1 completa e verificada

## v1.1 — progresso
- ✅ A) Detalhe da conta + extrato por subconta — `GET /accounts/:id/statement`, página `/accounts/:id` (extrato agrupado por responsável, por categoria, totais; cartão mostra fatura/pagamentos/devedor/fechamento).
- ✅ B) Receita única + recorrente — `recurring_rules` + `lib/recurring.js` (materialização idempotente por mês), `routes/recurring.js` (CRUD), opção "Repetir todo mês" no form, gestão em Configurações.
- ✅ C) Pagamento de cartão — `type=payment` (positivo, abate o devedor, fora dos totais de gasto/receita), opção no form só para cartão. Pagamento fica no mês em que ocorre.
- ✅ D) Fechamento de cartão — `closing_day`/`due_day` em accounts, `lib/invoice.js#invoiceMonth` (compras após o fechamento → próxima fatura), aplicado em lançamento manual (expense) e import OFX; campos no cadastro de cartão.

**Verificado E2E:** fechamento (compra dia 3→fatura do mês, dia 20→próxima), pagamento no mês correto, statement (fatura/pagamento/devedor), recorrência materializada em múltiplos meses, migrations idempotentes no restart, build OK (49 módulos).

## Como retomar
1. Ler [PLANEJAMENTO.md](PLANEJAMENTO.md) para o plano completo.
2. Node via nvm: `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"`.
3. `npm install` → `npm run dev:backend` (3001) + `npm run dev:frontend` (5173). Ou `npm run build && npm start` (tudo em 3001).

## Próximo passo (melhorias futuras, fora do MVP)
- Export CSV/JSON para backup pela interface.
- Edição em lote por seleção múltipla na revisão de importação (hoje há "aplicar a todos").
- Testar com os arquivos reais (`Nubank_*.ofx`, `Fatura_*.pdf`) quando disponíveis.

## Ambiente
- Node v20.20.2 / npm 10.8.2 (via nvm, **não está no PATH padrão** — exportar antes de usar)
- Working dir: `/home/joaopatrick/Projects/opf-app`

## Log de progresso

### Fase 0 — Setup do monorepo
- ⏳ Em andamento — documentos de planejamento e status criados.

### Fase 1 — Backend: fundação
- ✅ `db.js` (migrations + seed de categorias), `index.js` (Express, CORS, serve build). Boot verificado.

### Fase 2 — Backend: rotas CRUD
- ✅ `accounts` (com saldo + subcontas), `categories`, `settings` (chave Groq/meta), `transactions` (filtros, /summary, /compare, /months). Verificado via curl.

### Fase 3 — Backend: parsers
- ✅ `ofx.js` e `pdf-santander.js`. Testados com dados sintéticos: dedup de pagamento, parcelas, seções ignoradas, mês de referência — tudo OK.

### Fase 4 — Backend: IA + aprendizado + importação
- ✅ `ai/learning.js` (normalização, histórico, lookup local), `ai/classify.js` (Groq batch), `routes/import.js` (preview com dedup + sugestões, confirm).

### Fase 5 — Frontend: fundação
- ✅ Vite + Tailwind (tokens OPF) + Space Grotesk. `lib/api`, `lib/format`, `lib/store` (contexto). Layout com sidebar/monograma, `MonthSelector`, `Icon` (sprite Fluxo), componentes base (`ui.jsx`, `Modal`).

### Fase 6 — Frontend: páginas
- ✅ `Dashboard` (gasto do mês em aurora, delta, barras por categoria, tendência 6 meses, insights, por responsável).
- ✅ `Transactions` (filtros conta/categoria/responsável/tipo, total, criar/editar/excluir via `TransactionForm`).
- ✅ `Import` (upload OFX/PDF, revisão editável com dedup/sugestões, "aplicar a todos", confirmar).
- ✅ `Accounts` (contas com saldo, subcontas inline).
- ✅ `Settings` (categorias + limites, meta de poupança, chave Groq).

### Fase 7 — Integração & verificação
- ✅ `npm run build` OK (48 módulos). E2E via curl: CRUD, summary, compare, import preview/confirm, **dedup por FITID**, **aprendizado local após confirmação**, degradação sem chave Groq. Modo produção (Express serve SPA + API) verificado. multer atualizado p/ 2.x.

## Notas / decisões em aberto
- Arquivos reais para teste (`Nubank_*.ofx`, `Fatura_*.pdf`) ainda não fornecidos — parsers validados com dados sintéticos fiéis à estrutura dos requisitos.
- Vuln moderada remanescente é do esbuild/vite (dev-only), aceitável para app local.

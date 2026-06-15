# OPF — Plano de Implementação

> App pessoal de consciência financeira. Monorepo `npm workspaces`: backend Node/Express/SQLite + frontend React/Vite/Tailwind. Identidade visual **Fluxo** (dark-first).
>
> Referências: [requisitos](.projeto/requisitos-app-financeiro.md) · [brand handoff](.projeto/OPF-Brand-Handoff.html)

## Princípios

- **Sem over-engineering.** Uso pessoal, local, sem autenticação.
- **Calmo e factual.** A UI revela padrões, não julga (ver tom de voz no handoff).
- **Resumível.** O [STATUS.md](STATUS.md) é atualizado no início e fim de cada etapa.

## Stack

| Camada | Escolha |
|---|---|
| Runtime | Node.js 20 (via nvm) |
| Backend | Express + better-sqlite3 |
| Upload | multer |
| PDF | pdf-parse |
| OFX | regex (SGML, não XML) |
| IA | Groq API (`llama-3.3-70b-versatile`) via fetch |
| Frontend | React 18 + Vite + TailwindCSS |
| Fonte | Space Grotesk |

## Design tokens (Fluxo)

```
--void #090D18 · --deep #121A2B · --surface-2 #1B2740
--azure #4DA6FF · --indigo #6366F1 · --sky #BFE0FF
--text #F0F6FF · --muted #93A4C4 · --faint #56627E
--positive #4FD1A6 · --caution #F2B872
--aurora linear-gradient(135deg, #4DA6FF, #6366F1)
radius: 10 / 16 / 22 / pill(999)  ·  spacing base 4
```
Aurora só em: saldo, ação primária, destaques de insight. Nunca vermelho de erro.

---

## Fases

### Fase 0 — Setup do monorepo
- [ ] `package.json` raiz com `workspaces: ["backend","frontend"]`
- [ ] `.gitignore`, `.env.example` (`GROQ_API_KEY`)
- [ ] Estrutura de pastas

### Fase 1 — Backend: fundação
- [ ] `backend/package.json` (express, better-sqlite3, cors, dotenv, multer, pdf-parse)
- [ ] `db.js` — conexão SQLite + migrations inline (accounts, subaccounts, categories, transactions, classification_history, settings)
- [ ] seed de categorias padrão
- [ ] `index.js` — app Express, CORS, JSON, montagem de rotas, servir build do frontend

### Fase 2 — Backend: rotas CRUD
- [ ] `routes/accounts.js` — contas + subcontas, saldo calculado, visão consolidada
- [ ] `routes/categories.js` — CRUD + `budget_limit`
- [ ] `routes/transactions.js` — list (filtros: mês/conta/categoria/subconta/tipo), create, update, delete, totais por categoria, comparativo mensal

### Fase 3 — Backend: parsers
- [ ] `parsers/ofx.js` — Nubank (TRNTYPE, DTPOSTED, TRNAMT, FITID, MEMO; ignora "Pagamento recebido"; detecta parcela; charset 1252)
- [ ] `parsers/pdf-santander.js` — blocos por titular, Parcelamentos/Despesas, mês da fatura

### Fase 4 — Backend: IA + aprendizado + importação
- [ ] `ai/learning.js` — normalização de memo, `classification_history`, lookup local prioritário, registro de correções
- [ ] `ai/classify.js` — chamada Groq em lote com histórico no prompt
- [ ] `routes/import.js` — detecta formato, parseia, dedup (FITID), classifica → preview; confirma → salva + registra aprendizado

### Fase 5 — Frontend: fundação
- [ ] Vite + Tailwind + tokens OPF + Space Grotesk
- [ ] `lib/api.js`, `lib/format.js` (moeda tabular, mês)
- [ ] Layout: sidebar com monograma, `MonthSelector`, router
- [ ] Componentes base: `Mark`, botões, chips, ícones (sprite SVG do handoff)

### Fase 6 — Frontend: páginas
- [ ] `Dashboard` — saldo (aurora), totais por categoria com barras, orçamento, insights calmos
- [ ] `Transactions` — lista + filtros + edição inline/modal
- [ ] `Import` — upload, tela de revisão editável (categoria/subconta/excluir), salvar
- [ ] `Accounts` — gerenciar contas e subcontas
- [ ] `Settings` — categorias, limites, chave Groq, poupança

### Fase 7 — Integração & verificação
- [ ] Rodar backend + frontend juntos
- [ ] Testar com arquivos reais (se fornecidos)
- [ ] Build estático servido pelo Express
- [ ] README de execução

---

---

## v1.1 — Correções e adições

### A. Detalhe da conta + extrato por subconta
- [ ] `GET /api/accounts/:id/statement?month=` — transações do mês na conta, **agrupadas por subconta**, com totais por subconta e por categoria, totais (gastos/receitas/pagamentos) e, para cartão, dados de fatura.
- [ ] Frontend: rota `/accounts/:id` com extrato mensal, separação por responsável e análise (saldo, fatura, devedor, comparativo).

### B. Receita unificada (única + recorrente)
- [ ] Tabela `recurring_rules` (type, conta, subconta, categoria, descrição, valor, dia do mês, start/end, active).
- [ ] `lib/recurring.js` — `materializeRecurring(month)`: gera a transação do mês para cada regra ativa (idempotente via `recurring_id`).
- [ ] `routes/recurring.js` — CRUD. Materializar ao listar/somar meses.
- [ ] Coluna `transactions.recurring_id`.
- [ ] Frontend: no form de receita, opção **única** ou **recorrente** (dia do mês). Gestão das recorrências em Configurações.

### C. Pagamento de cartão (abatimento)
- [ ] Novo `type = 'payment'`: entrada manual positiva na conta do cartão que abate o saldo devedor. Não conta como gasto nem receita no resumo.
- [ ] Frontend: opção "Pagamento do cartão" no form quando a conta é cartão de crédito.

### D. Fechamento de cartão (dia de fechamento)
- [ ] Colunas `accounts.closing_day` e `accounts.due_day`.
- [ ] `lib/invoice.js` — `invoiceMonth(date, closing_day)`: compras após o fechamento entram na próxima fatura.
- [ ] Aplicar em lançamentos manuais e import OFX para contas de cartão (PDF mantém mês do cabeçalho quando houver).
- [ ] Frontend: campos de fechamento/vencimento ao criar/editar cartão.

---

## Decisões assumidas (pontos em aberto dos requisitos)
- **Backup**: export JSON/CSV fica para depois (fora do MVP).
- **Edição em lote** na revisão de importação: incluir seleção múltipla simples se o tempo permitir.
- **Dedup OFX×PDF**: FITID cobre OFX; para PDF, dedup por (data+valor+descrição normalizada) dentro da própria importação.
- **Cartão adicional**: deixar o usuário decidir a subconta na revisão (IA sugere).

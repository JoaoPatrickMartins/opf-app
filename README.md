# OPF · o caminho do seu dinheiro

App pessoal de consciência financeira. Revela para onde vai o dinheiro e os padrões que se repetem — sem julgar, sem cobrar. Identidade visual **Fluxo** (dark-first).

> Documentos do projeto: [PLANEJAMENTO.md](PLANEJAMENTO.md) · [STATUS.md](STATUS.md) · [requisitos](.projeto/requisitos-app-financeiro.md) · [brand handoff](.projeto/OPF-Brand-Handoff.html)

## Stack

Monorepo `npm workspaces`:

- **backend/** — Node + Express + SQLite (better-sqlite3). Parsers OFX/PDF, classificação por IA (Groq) e aprendizado local.
- **frontend/** — React + Vite + TailwindCSS, com os tokens da direção Fluxo.

## Pré-requisitos

- Node.js 20+ (neste ambiente, via nvm: `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"`)

## Instalação

```bash
npm install            # instala backend + frontend (workspaces)
cp .env.example .env   # opcional: preencha GROQ_API_KEY (ou configure pela tela de Configurações)
```

## Desenvolvimento

Em dois terminais:

```bash
npm run dev:backend    # API em http://localhost:3001
npm run dev:frontend   # UI em http://localhost:5173 (proxy /api -> 3001)
```

Abra **http://localhost:5173**.

## Produção (build estático servido pelo Express)

```bash
npm run build          # gera frontend/dist
npm start              # Express serve a API + o build em http://localhost:3001
```

## Modelo (v2 — centrado em pessoas)

- **Contas = pessoas** (Própria, Sogra, Esposa…). Cada uma tem **saldo de caixa**, receitas e despesas próprias. Toda a administração acontece dentro da conta.
- **Cartões & fontes** (Nubank, Santander, Carteira, Dinheiro) são a **origem** de uma despesa.
- Despesa de **cartão de crédito** não baixa o caixa da pessoa até a **fatura ser paga** (entrada `Pagar cartão`). Ela aparece nos "gastos do mês" (consciência).
- **Quem deve a quem**: quando alguém paga uma fatura com despesas de outra pessoa, surge o acerto; quita-se com uma **transferência** entre contas.

## Como usar

1. **Cartões & fontes** — cadastre Nubank/Santander (com dia de fechamento) e carteira/dinheiro.
2. **Contas** — crie as pessoas (Própria já vem semeada). Abra uma conta para administrar tudo: despesa, receita (única/recorrente/parcelada 1/N), pagar cartão, transferir, extrato e despesas por cartão.
3. **Importar** — escolha o **cartão de origem**, envie **OFX (Nubank)** ou **PDF (Santander)**. A IA sugere categoria + a quem pertence; você revisa e **distribui** cada despesa para a conta da pessoa.
4. **Resumo** — gastos do mês, por categoria, por conta, comparativo, "quem deve a quem", insight calmo e **Pergunte ao OPF**.
5. **Configurações** — categorias/limites, recorrências, chave Groq, **interruptores de IA** e backup CSV/JSON.

## IA (Groq) — opcional, por recurso

Cada recurso liga/desliga em Configurações; a IA cuida só de **linguagem e classificação** — números são sempre calculados no código.

- **Importação**: sugere categoria + pessoa e gera rótulo legível (ex.: `Dl *Uberrides` → "Uber").
- **Entrada manual**: botão "sugerir" a categoria.
- **Insights do mês**: 1–2 frases no tom calmo (cacheadas).
- **Assinaturas**: detecção heurística de cobranças recorrentes (a IA só redige).
- **Pergunte ao OPF**: pergunta em linguagem natural → consulta estruturada segura.

Aprendizado: cada classificação manual vira `memo → categoria, pessoa`; importações futuras usam o histórico local antes de chamar a IA. Sem chave Groq, tudo funciona — só sem as sugestões.

## Dados

- Tudo local em `backend/data/finance.db` (SQLite). Sem autenticação, uso pessoal.
- Para backup, basta copiar esse arquivo.

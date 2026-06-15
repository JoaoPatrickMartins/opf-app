# Levantamento de requisitos — app de organização financeira pessoal

## Contexto

App de uso pessoal para consciência financeira. Foco em entender para onde vai o dinheiro e identificar padrões de gasto ao longo do tempo — não é uma ferramenta de controle rígido ou orçamento.

---

## Perfil de uso

- Registro feito manualmente no final do dia ou via importação de extrato
- Usuário possui mais de uma conta/cartão bancário
- Interface desktop/web (sem necessidade de ser mobile-first)

---

## Objetivos prioritários

1. Ver para onde vai o dinheiro
2. Entender padrões de gasto
3. Guardar dinheiro / poupar
4. Não estourar o orçamento

---

## Stack definida

Monorepo simples, uso pessoal, sem over-engineering.

```
/
├── backend/          Node.js + Express + SQLite (via better-sqlite3)
├── frontend/         React + Vite + TailwindCSS
├── package.json      (workspaces npm)
└── .env              GROQ_API_KEY
```

### Justificativas

| Camada | Escolha | Motivo |
|---|---|---|
| Runtime | Node.js | Mesmo ecossistema no mono-repo, sem instalar nada extra |
| Backend | Express | Mínimo de boilerplate para uma API REST simples |
| Banco de dados | SQLite (better-sqlite3) | Arquivo local, zero configuração, portável, suficiente para uso pessoal |
| Frontend | React + Vite | Rápido de montar, componentes reutilizáveis |
| Estilo | TailwindCSS | Produtividade sem CSS manual |
| IA | Groq API (llama-3.3-70b) | Rápido, gratuito no tier inicial, ótimo para classificação de texto |
| Parser PDF | pdf-parse (Node) | Extrai texto bruto do PDF para processamento posterior |
| Parser OFX | xml2js ou regex simples | OFX é SGML, não XML válido — regex é mais confiável para esse caso |
| Monorepo | npm workspaces | Sem ferramentas extras (sem Turborepo, sem Nx) |

### Estrutura de pastas

```
/
├── package.json                  # workspaces: ["backend", "frontend"]
├── .env                          # GROQ_API_KEY=...
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── index.js              # Express app + rotas
│   │   ├── db.js                 # Conexão SQLite + migrations inline
│   │   ├── routes/
│   │   │   ├── transactions.js
│   │   │   ├── accounts.js
│   │   │   ├── categories.js
│   │   │   └── import.js
│   │   ├── parsers/
│   │   │   ├── ofx.js            # Parser OFX (Nubank)
│   │   │   └── pdf-santander.js  # Parser PDF (Santander)
│   │   └── ai/
│   │       ├── classify.js       # Chamada Groq API
│   │       └── learning.js       # Lógica de aprendizado por histórico
│   └── data/
│       └── finance.db            # SQLite gerado automaticamente
└── frontend/
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── pages/
        │   ├── Dashboard.jsx     # Resumo mensal
        │   ├── Transactions.jsx  # Lista + filtros
        │   ├── Import.jsx        # Upload + revisão pré-confirmação
        │   ├── Accounts.jsx      # Gerenciar contas e subcontas
        │   └── Settings.jsx      # Categorias, limites, chave Groq
        └── components/
            ├── TransactionRow.jsx
            ├── ClassifyModal.jsx
            └── MonthSelector.jsx
```

---

## Requisitos funcionais

### Contas

- Cadastro de múltiplas contas com nome livre (ex: Nubank, Santander, Carteira)
- Cada conta tem um tipo: cartão de crédito, conta corrente, carteira
- Saldo por conta (calculado a partir dos lançamentos)
- Visão consolidada de todas as contas

### Subcontas / Responsáveis

- Dentro de cada conta, o usuário pode criar subcontas com nome livre
  - Exemplos: "Sogra", "Filha", "Trabalho", "Casa"
- Um lançamento pode ser atribuído a uma subconta (ou deixado sem subconta = próprio)
- Relatório mensal mostra separação: "meus gastos" vs "gastos da Sogra", etc.
- Visão de gastos filtrável por subconta

### Lançamentos manuais

Campos:
- Valor
- Tipo: gasto ou receita
- Categoria
- Conta
- Subconta / responsável (opcional)
- Data
- Descrição (opcional)

Operações: criar, editar, excluir.

### Importação de extratos

#### Formato OFX — Nubank

Campos relevantes por transação:

```
<TRNTYPE>   — DEBIT (gasto) ou CREDIT (pagamento/estorno)
<DTPOSTED>  — data no formato YYYYMMDD[-3:BRT]
<TRNAMT>    — valor (negativo = débito, positivo = crédito)
<FITID>     — identificador único da transação (usado para deduplicação)
<MEMO>      — descrição do estabelecimento
```

Regras:
- Ignorar CREDIT com MEMO "Pagamento recebido" (pagamentos de fatura)
- Detectar parcelas pelo padrão `- Parcela X/Y` no MEMO
- Deduplicar por FITID: se o FITID já existe no banco, ignorar
- Data de referência: mês/ano de DTPOSTED

#### Formato PDF — Santander

Estrutura do PDF após extração de texto:
- Seção `Detalhamento da Fatura` contém blocos por titular
- Cada bloco começa com `NOME - XXXX XXXX XXXX NNNN`
- Subseções: `Parcelamentos` e `Despesas`
- Linha de parcelamento: `DD/MM  NOME DA COMPRA  PP/TT  R$ valor`
- Linha de despesa: `DD/MM  NOME DO ESTABELECIMENTO  R$ valor`

Regras:
- Ignorar seção "Pagamento e Demais Créditos"
- Ignorar "ANUIDADE DIFERENCIADA" (configurável)
- Associar lançamentos ao cartão correto via número identificado no cabeçalho do bloco
- Data de referência: mês da fatura (extraído do cabeçalho do PDF, ex: "compras realizadas até 18/05")

#### Fluxo de importação

1. Usuário faz upload do arquivo (OFX ou PDF)
2. Backend detecta formato e banco de origem automaticamente
3. Backend parseia e envia as transações para a Groq API para classificação em lote
4. Frontend exibe tela de revisão com as sugestões da IA já preenchidas:
   - Categoria sugerida (editável)
   - Subconta sugerida (editável)
   - Checkbox para excluir da importação
5. Usuário confirma ou ajusta cada linha e clica em "Salvar importação"
6. Backend salva apenas os lançamentos confirmados, registra as classificações manuais no histórico de aprendizado

---

### Classificação por IA (Groq API)

#### O que a IA classifica

Para cada transação importada, a IA sugere:
1. **Categoria** — uma das categorias cadastradas (Alimentação, Transporte, etc.)
2. **Subconta** — uma das subcontas existentes, ou nenhuma

#### Como funciona

- Chamada em lote: todas as transações da importação são enviadas juntas em uma única chamada à Groq
- Modelo: `llama-3.3-70b-versatile` (rápido e gratuito no tier inicial)
- Prompt inclui:
  - Lista de categorias disponíveis
  - Lista de subcontas disponíveis
  - Histórico de aprendizado: pares `{memo} → {categoria, subconta}` das classificações manuais anteriores
  - Todas as transações do lote em JSON
- Resposta esperada: JSON com `[{ fitid, categoria, subconta }]`

#### Exemplo de prompt enviado à Groq

```
Você é um classificador de gastos financeiros pessoais.

Categorias disponíveis: Alimentação, Transporte, Moradia, Saúde, Lazer, Assinaturas, Compras online, Outros

Subcontas disponíveis: Sogra, Filha (ou "nenhuma" se for gasto próprio)

Histórico de classificações anteriores (aprenda com eles):
- "Super Bom Supermercado" → Alimentação, nenhuma
- "Posto Universo" → Transporte, nenhuma
- "Conta Vivo" → Assinaturas, Sogra
- "Apaixonados Por 4 Pata" → Saúde, nenhuma

Classifique as transações abaixo. Responda APENAS com JSON no formato:
[{ "fitid": "...", "categoria": "...", "subconta": "..." }]

Transações:
[
  { "fitid": "abc1", "memo": "Drogaria Lider Farma", "valor": 95.97 },
  { "fitid": "abc2", "memo": "Dl *Uberrides", "valor": 11.94 },
  { "fitid": "abc3", "memo": "Dog Lovers Pelinca", "valor": 240.00 }
]
```

---

### Sistema de aprendizado

O aprendizado é simples e baseado em histórico local — sem treino de modelo.

#### Como funciona

- Toda vez que o usuário **confirma ou corrige manualmente** a categoria/subconta de uma transação (seja na revisão de importação ou editando um lançamento existente), o sistema salva o par:
  ```
  memo_normalizado → { categoria, subconta }
  ```
- "Memo normalizado" = lowercase, sem caracteres especiais, sem números de parcela (ex: "Parcela 2/3" é removido)
- Esses pares são armazenados na tabela `classification_history` do SQLite

#### Como o aprendizado é usado

- A cada nova classificação pela Groq, o backend consulta o histórico e inclui no prompt os pares mais relevantes (até 30 exemplos, ordenados por frequência de uso)
- Se o memo de uma transação nova bater exatamente com um memo do histórico local, a classificação local tem prioridade sobre a IA (sem nem chamar a API)

#### Tabela SQLite

```sql
CREATE TABLE classification_history (
  id INTEGER PRIMARY KEY,
  memo_normalized TEXT NOT NULL,
  categoria TEXT NOT NULL,
  subconta TEXT,
  uses INTEGER DEFAULT 1,
  last_used_at TEXT,
  UNIQUE(memo_normalized)
);
```

---

### Separação mensal

- Todo lançamento pertence a um `reference_month` (formato: `YYYY-MM`)
- Para cartão: `reference_month` = mês da fatura, não da compra
- Para conta corrente/OFX: `reference_month` = mês da data da transação
- O app navega entre meses com seletor `← Maio 2026 →`
- Parcelamentos aparecem no mês em que a parcela cai

### Categorias

Pré-definidas e editáveis pelo usuário:
Alimentação, Transporte, Moradia, Saúde, Lazer, Assinaturas, Compras online, Outros

### Poupança

- Registro de transferência para reserva como tipo especial de lançamento
- Meta de poupança mensal (opcional, visível no resumo)

### Orçamento

- Limite configurável por categoria
- Alerta visual simples na listagem quando o limite é ultrapassado no mês

### Visualização

- Lista de lançamentos por mês, filtrável por conta, categoria, subconta e tipo
- Totais por categoria no mês
- Comparativo de totais entre meses (tabela simples)
- Separação clara entre gastos próprios e de subcontas

---

## Modelo de dados (SQLite)

```sql
-- Contas (Nubank, Santander, Carteira...)
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'credit_card' | 'checking' | 'wallet'
  created_at TEXT DEFAULT (datetime('now'))
);

-- Subcontas (Sogra, Filha...)
CREATE TABLE subaccounts (
  id INTEGER PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(id),
  name TEXT NOT NULL
);

-- Categorias
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  budget_limit REAL -- opcional
);

-- Lançamentos
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  fitid TEXT UNIQUE,              -- para deduplicação OFX
  account_id INTEGER REFERENCES accounts(id),
  subaccount_id INTEGER REFERENCES subaccounts(id),
  category_id INTEGER REFERENCES categories(id),
  reference_month TEXT NOT NULL,  -- 'YYYY-MM'
  date TEXT NOT NULL,             -- 'YYYY-MM-DD'
  description TEXT NOT NULL,
  amount REAL NOT NULL,           -- positivo = receita, negativo = gasto
  type TEXT NOT NULL,             -- 'expense' | 'income' | 'transfer'
  installment TEXT,               -- '2/6' se parcelado
  source TEXT,                    -- 'manual' | 'ofx' | 'pdf'
  ai_suggested INTEGER DEFAULT 0, -- 1 se classificação foi da IA
  confirmed INTEGER DEFAULT 0,    -- 1 se usuário confirmou
  created_at TEXT DEFAULT (datetime('now'))
);

-- Histórico de aprendizado da IA
CREATE TABLE classification_history (
  id INTEGER PRIMARY KEY,
  memo_normalized TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL,
  subconta TEXT,
  uses INTEGER DEFAULT 1,
  last_used_at TEXT
);
```

---

## Requisitos não funcionais

- Dados armazenados localmente em SQLite (arquivo `backend/data/finance.db`)
- Interface web acessada via `localhost:5173` (Vite dev) ou build estático servido pelo Express
- Sem autenticação (uso pessoal, local)
- Chave da Groq configurada via `.env` ou pela tela de configurações do app
- Suporte a OFX charset Windows-1252/USASCII e PDF de fatura do Santander

---

## Fora do escopo (por ora)

- Integração com Open Finance / APIs bancárias
- App mobile nativo
- Compartilhamento entre usuários
- Gráficos visuais (previsto para versão futura)
- Suporte a outros bancos além de Nubank (OFX) e Santander (PDF)
- Autenticação / login

---

## Pontos em aberto para decisão futura

- **Backup dos dados**: exportar o `finance.db` manualmente? Ou adicionar export CSV/JSON pela interface?
- **Edição em lote**: na tela de revisão de importação, permitir selecionar várias linhas e classificar todas de uma vez (mesma categoria/subconta)?
- **Tratamento de lançamentos duplicados entre OFX e PDF**: a mesma compra pode aparecer no OFX do Nubank e eventualmente em outro extrato. A deduplicação por FITID cobre o OFX, mas o PDF não tem FITID — será necessário detectar duplicatas por (data + valor + descrição similar)?
- **Lançamentos do cartão adicional (Santander 2620)**: associar automaticamente a uma subconta fixa, ou deixar o usuário decidir na revisão?

---

## Próximos passos

1. Inicializar monorepo com `npm workspaces`
2. Configurar backend: Express + SQLite + migrations automáticas na inicialização
3. Implementar parsers OFX e PDF
4. Implementar integração com Groq API (classificação em lote)
5. Implementar lógica de aprendizado local (`classification_history`)
6. Desenvolver frontend: telas de Importação → Revisão → Dashboard → Listagem
7. Testar com os arquivos reais: `Nubank_2026-06-15.ofx` e `Fatura_052026_JOAO_4705.pdf`

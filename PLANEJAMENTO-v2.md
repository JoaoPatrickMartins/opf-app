# OPF — Planejamento v2 (redesenho centrado em pessoas)

> Proposta de evolução com base no que já existe. **Nada aqui foi implementado ainda** — este documento existe para você aceitar/rejeitar item a item.
> Base: [PLANEJAMENTO.md](PLANEJAMENTO.md) (v1/v1.1) · [requisitos](.projeto/requisitos-app-financeiro.md)

---

## 1. O que muda no conceito

Hoje o modelo é **centrado na conta bancária**: a conta (Nubank, Santander) é o item principal e as pessoas são "subcontas" dentro dela.

Você está pedindo o oposto: **centrar na pessoa**. A unidade principal passa a ser a **conta da pessoa** (Própria, Sogra, Esposa…), e o cartão vira apenas a **origem** de uma despesa.

| Conceito | Hoje (v1.1) | Proposto (v2) |
|---|---|---|
| Unidade principal | Conta bancária | **Conta = pessoa** (Própria, Sogra, Esposa) |
| Pessoa | Subconta (aninhada) | Promovida a conta de 1ª classe, com saldo próprio |
| Cartão/banco | Conta principal | **Fonte/origem** etiquetada na despesa |
| Despesa | Pertence à conta+subconta | Pertence a **uma pessoa** + (opcional) um cartão |
| Importação | Vai para uma conta | Importa de **um cartão** e **distribui** cada despesa para a pessoa classificada |
| Saldo | Só somatório da conta | Saldo por pessoa + dívida por cartão + **transferências** |

---

## 2. Modelo de dados proposto

Duas entidades distintas, em vez de conta+subconta:

```sql
-- PESSOAS  ("contas" no seu vocabulário): Própria, Sogra, Esposa…
people (
  id, name, is_self INTEGER,          -- is_self=1 marca "Própria"
  initial_balance REAL DEFAULT 0,     -- saldo inicial (opcional)
  color TEXT, created_at
)

-- FONTES / CARTÕES: Nubank, Santander, Carteira, Conta corrente
sources (
  id, name,
  type TEXT,                          -- 'credit_card' | 'checking' | 'wallet' | 'cash'
  closing_day INTEGER, due_day INTEGER,
  created_at
)

-- LANÇAMENTOS
transactions (
  id, fitid,
  person_id  -> people,               -- DONO da despesa/receita (sempre)
  source_id  -> sources,              -- origem (cartão/banco); opcional p/ dinheiro
  category_id,
  type TEXT,                          -- 'expense' | 'income' | 'payment' | 'transfer'
  counterparty_person_id -> people,   -- destino, quando type='transfer'
  reference_month, date, description, amount,
  installment, source, ai_suggested, confirmed, recurring_id, created_at
)

-- RECORRÊNCIA / PARCELADO (receita 1/6, gasto fixo)
recurring_rules (
  ... + person_id, source_id,
  total_occurrences INTEGER           -- NULL = infinita; 6 = "parcela 1/6"
)

-- APRENDIZADO: agora sugere CATEGORIA + PESSOA (antes era subconta)
classification_history ( memo_normalized, categoria, person_name, uses, last_used_at )
```

### Como os saldos passam a funcionar  ✅ decisão: despesa de cartão só afeta o saldo QUANDO a fatura é paga

Cada pessoa tem **dois números distintos** (porque cartão ≠ dinheiro):

1. **Saldo de caixa** (dinheiro disponível para pagar coisas):
   `saldo inicial + receitas − despesas diretas (dinheiro/débito) − pagamentos de fatura feitos − transferências enviadas + transferências recebidas`
   → **despesas no cartão NÃO reduzem o caixa** até a fatura ser paga.

2. **Gastos do mês** (consciência — "para onde foi o dinheiro"):
   inclui as despesas de cartão atribuídas à pessoa, mesmo antes de pagar. É a visão de padrão/análise.

- **Dívida/fatura do cartão** = despesas no cartão − pagamentos ao cartão (por cartão, independe de pessoa).
- **Pagamento de cartão** (`type=payment`): a pessoa paga X → reduz o **caixa** dela e abate a fatura do cartão.
- **Transferência** (`type=transfer`): move saldo de uma pessoa para outra (`counterparty_person_id`).

### "Quem deve a quem" (S2) — consequência direta da decisão acima
Quando a Própria paga a fatura do Nubank que inclui R$200 de despesas da Sogra, a **Sogra passa a dever R$200 à Própria**. A visão de acerto mostra, por pessoa, a parcela de despesa de cartão ainda não acertada → a quem ela deve (quem pagou a fatura). Acerto é quitado com uma **transferência**.

---

## 3. Fluxos principais (v2)

### 3.1 Conta da pessoa = central de administração
Abrir uma pessoa (Própria/Sogra/Esposa) dá acesso a **tudo dela**:
- ➕ Adicionar / ✏️ editar / 🗑️ remover **despesa**
- Ver **todas as despesas** do mês
- Ver **despesas separadas por cartão** (Nubank, Santander, dinheiro)
- Ver **extrato** (linha do tempo do mês)
- ➕ Adicionar / ✏️ editar / 🗑️ remover **receita** (única, recorrente ou parcelada 1/6)
- Ver **saldo** atual e do mês
- **Transferir** saldo/despesa para outra pessoa

> Despesas e receitas são **sempre** criadas dentro de uma pessoa. Não há mais criação "solta".

### 3.2 Importação (continua única e global)
1. Escolher **o cartão de origem** (Nubank OFX / Santander PDF).
2. Backend parseia, deduplica e **classifica em lote com a IA**: sugere **categoria + pessoa** por linha.
3. Tela de revisão (como hoje): editar categoria e **pessoa** (Própria/Sogra/Esposa), excluir linhas.
4. Ao **finalizar**, cada despesa é **enviada para a conta da pessoa** classificada, etiquetada com o cartão de origem — e a IA **aprende** com as edições manuais.

### 3.3 Receita parcelada "1/6"
Receita com número fixo de ocorrências: registra como `total_occurrences=6`. A cada mês materializa uma parcela; a UI mostra o progresso **"recebida 2/6"**. Diferente da recorrente infinita (salário) e da única.

### 3.4 Saldos e transferências
- Saldo inicial opcional por pessoa.
- Transferência entre pessoas (ex.: você cobre uma despesa da Sogra → registra transferência).
- Pagamento de fatura sai do saldo da pessoa e abate o cartão.

---

## 4. Plano de execução proposto (fases)

- **F1 — Modelo & migração**: novas tabelas `people`/`sources`, migrar dados atuais, ajustar seeds.
- **F2 — Backend pessoas**: CRUD de pessoas, endpoints de saldo, extrato por pessoa, despesas por cartão.
- **F3 — Backend fontes/cartões**: CRUD de cartões/fontes (fechamento/vencimento), dívida do cartão.
- **F4 — Transferências & pagamentos**: `type=transfer`/`payment` com contraparte; cálculo de saldos.
- **F5 — Receita parcelada**: `total_occurrences` + progresso "x/N".
- **F6 — Importação v2**: alvo = cartão; sugestão de **pessoa**; despacho para pessoas no finalizar; aprendizado por pessoa.
- **F7 — Frontend**: página da Pessoa (admin completa), Importação revisada, Dashboard consolidado, transferências.
- **F8 — Verificação E2E + build + atualização de STATUS**.

---

## 5. Menu de melhorias/adições — aceite ou rejeite

Marque o que quer. **[Núcleo]** = pedido diretamente por você; **[Sugestão]** = melhoria que proponho.

### Já no seu pedido (núcleo) — todos aceitos
- [x] **N1** Conta centrada na pessoa (Própria/Sogra/Esposa) com saldo próprio
- [x] **N2** Despesa pertence a uma pessoa; importação distribui por pessoa
- [x] **N3** Despesas separadas por cartão dentro da pessoa
- [x] **N4** CRUD completo de despesa e receita dentro da conta da pessoa
- [x] **N5** Receita única, recorrente e **parcelada 1/6** por pessoa
- [x] **N6** Saldo por conta + **transferências** entre contas
- [x] **N7** Importação única, alvo = cartão, com IA sugerindo categoria + pessoa e aprendendo

### Sugestões — status após sua escolha
- [x] **S1** **Dashboard consolidado** (todas as pessoas) + alternar para visão por pessoa — *aceito*
- [x] **S2** **"Quem deve a quem"** — acerto de contas entre pessoas — *aceito* (essencial, dada a decisão de saldo)
- [x] **S4** **Gastos fixos recorrentes** (não só receita) por pessoa — *aceito*
- [x] **S6** **Export / backup** CSV/JSON pela interface — *aceito*
- [x] **S3** **Saldo inicial** por pessoa — *incluído por dependência* (a decisão de saldo de caixa pede um ponto de partida)
- [ ] **S5** Alerta calmo de vencimento de fatura — *não selecionado*
- [ ] **S7** Dedup OFX × PDF além do FITID — *não selecionado*
- [ ] **S8** Edição em lote real na revisão — *não selecionado*
- [ ] **S9** Fatura aberta vs. fechada do cartão — *não selecionado*
- [ ] **S10** Renomear "subconta" → "pessoa" na UI — *coberto naturalmente pelo redesenho*

---

## 6. Decisões — RESOLVIDAS

1. **Estrutura do modelo** → ✅ **Duas entidades: Pessoas + Cartões/Fontes.**
2. **Saldo da despesa de cartão** → ✅ **Só afeta o caixa quando a fatura é paga** (ver §2: dois números por pessoa + "quem deve a quem").
3. **Dados atuais** → ✅ **Recomeçar limpo** (seed da pessoa "Própria"; você cria Sogra/Esposa).
4. **Adições aceitas** → S1, S2, S4, S6 (+ S3 por dependência).

## 7. Recursos de IA (Groq) — S11–S15 · aceitos, design em discussão

> Princípio comum: **IA só cuida de linguagem e classificação; números são sempre calculados no código** e passados prontos (evita valores alucinados). Todos degradam em silêncio sem a chave Groq.

- [x] **S11 · Classificação na entrada manual** — sugerir categoria + pessoa ao lançar à mão. Histórico local instantâneo; Groq sob demanda.
- [x] **S12 · Limpeza de descrições** — `Dl *Uberrides` → "Uber". Em lote na importação; mantém o memo original para dedup/aprendizado; rótulo editável.
- [x] **S13 · Insights/resumo calmo do mês** — código calcula os fatos, IA redige no tom Fluxo. Cacheado por mês, com "atualizar".
- [x] **S14 · Detecção de assinaturas/recorrências** — heurística detecta (mesmo estabelecimento ~mensal, valor parecido); IA só redige o aviso e sugere criar regra (liga no S4).
- [x] **S15 · "Pergunte ao OPF"** — pergunta em linguagem natural → IA traduz para **consulta estruturada** (período, pessoa, cartão, categoria, tipo + soma/média/contagem/comparação) executada no código; resposta com a tabela junto. *Fase futura.*

### Dúvidas — RESOLVIDAS
- **D1** (S11) → ✅ Histórico local instantâneo + Groq **só no botão "sugerir"**.
- **D2** (S12) → ✅ Limpar **em lote na importação**, guardar **memo original + rótulo limpo editável**.
- **D3** (S13) → ✅ Fatos no código + IA redige 1–2 frases, **cacheado por mês** com "atualizar"; sem chave, insight sem IA.
- **D4** (S14) → ✅ Detecção **heurística**; IA **só redige** o aviso e propõe criar recorrência.
- **D5** (S15) → ✅ **NL → consulta estruturada segura** (código calcula, mostra tabela); caixa "Pergunte ao OPF" no Dashboard.
- **D6** (geral) → ✅ **Interruptor por recurso** em Configurações (liga/desliga S11–S15).

## ✅ STATUS: IMPLEMENTADO E VERIFICADO

Todas as fases F1–F8 e os recursos de IA S11–S15 foram implementados e testados (E2E com Groq real). Detalhes no [STATUS.md](STATUS.md).

## 8. Plano de execução — TRAVADO

**Ordem:** modelo novo **F1→F8 primeiro**, recursos de IA (S11–S15) **logo depois**.

| Fase | Conteúdo |
|---|---|
| F1 | Modelo & migração: `people`, `sources`; recomeçar limpo (seed "Própria") |
| F2 | Backend pessoas: CRUD, saldo de caixa, gastos do mês, extrato, despesas por cartão |
| F3 | Backend cartões/fontes: CRUD, fechamento/vencimento, dívida/fatura |
| F4 | Transferências & pagamentos (`transfer`/`payment` com contraparte) + "quem deve a quem" (S2) |
| F5 | Receita parcelada `1/6` (`total_occurrences`) + gastos fixos recorrentes (S4) |
| F6 | Importação v2: alvo = cartão; IA sugere categoria + pessoa; despacho por pessoa; aprendizado |
| F7 | Frontend: página da Pessoa (admin completa), Dashboard consolidado (S1), transferências, export (S6) |
| F8 | Verificação E2E + build + STATUS |
| IA1 | S12 (limpeza) + S11 (sugestão manual) — reaproveitam o pipeline da importação |
| IA2 | S13 (insights) + S14 (assinaturas) |
| IA3 | S15 (Pergunte ao OPF) |
| — | Interruptores de IA por recurso em Configurações (D6) |

Atualizar o [STATUS.md](STATUS.md) no início/fim de cada fase, como nas versões anteriores.

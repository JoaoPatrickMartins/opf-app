import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'finance.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---- v2: recomeço limpo — remove o esquema legado da v1 (conta+subconta) se presente ----
const hasLegacyAccounts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'").get();
const txCols = db.prepare('PRAGMA table_info(transactions)').all();
const txIsLegacy = txCols.length && !txCols.some((c) => c.name === 'person_id');
if (hasLegacyAccounts || txIsLegacy) {
  db.exec(`
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS subaccounts;
    DROP TABLE IF EXISTS accounts;
    DROP TABLE IF EXISTS recurring_rules;
    DROP TABLE IF EXISTS classification_history;
  `);
}

// ---- Esquema v2 ----
db.exec(`
  -- Pessoas / "contas": Própria, Sogra, Esposa…
  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    is_self INTEGER DEFAULT 0,
    initial_balance REAL DEFAULT 0,
    color TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Fontes / cartões: Nubank, Santander, Carteira, Conta corrente, Dinheiro
  CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,           -- 'credit_card' | 'checking' | 'wallet' | 'cash'
    closing_day INTEGER,
    due_day INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    budget_limit REAL
  );

  -- Lançamentos. amount é SEMPRE magnitude positiva; direção vem do type.
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY,
    fitid TEXT UNIQUE,
    person_id INTEGER REFERENCES people(id) ON DELETE CASCADE,
    source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    counterparty_person_id INTEGER REFERENCES people(id) ON DELETE SET NULL, -- destino do transfer
    type TEXT NOT NULL,           -- 'expense' | 'income' | 'payment' | 'transfer'
    reference_month TEXT NOT NULL,
    date TEXT NOT NULL,
    description TEXT NOT NULL,     -- rótulo exibido (pode ser limpo pela IA)
    memo_original TEXT,           -- texto cru do extrato (dedup/aprendizado)
    amount REAL NOT NULL,         -- magnitude positiva
    installment TEXT,
    source TEXT,                  -- 'manual' | 'ofx' | 'pdf' | 'recurring'
    ai_suggested INTEGER DEFAULT 0,
    confirmed INTEGER DEFAULT 0,
    recurring_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tx_month ON transactions(reference_month);
  CREATE INDEX IF NOT EXISTS idx_tx_person ON transactions(person_id);
  CREATE INDEX IF NOT EXISTS idx_tx_source ON transactions(source_id);

  -- Recorrência: receita/gasto fixo; total_occurrences NULL = infinito, N = parcelado (1/N)
  CREATE TABLE IF NOT EXISTS recurring_rules (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'income',  -- 'income' | 'expense'
    person_id INTEGER REFERENCES people(id) ON DELETE CASCADE,
    source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    day_of_month INTEGER NOT NULL DEFAULT 1,
    start_month TEXT NOT NULL,
    end_month TEXT,
    total_occurrences INTEGER,            -- NULL = infinita
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Aprendizado: memo -> categoria + pessoa
  CREATE TABLE IF NOT EXISTS classification_history (
    id INTEGER PRIMARY KEY,
    memo_normalized TEXT NOT NULL UNIQUE,
    categoria TEXT NOT NULL,
    person_name TEXT,
    uses INTEGER DEFAULT 1,
    last_used_at TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ---- Seeds ----
const DEFAULT_CATEGORIES = [
  'Alimentação', 'Transporte', 'Moradia', 'Saúde',
  'Lazer', 'Assinaturas', 'Compras online', 'Outros'
];
if (db.prepare('SELECT COUNT(*) AS n FROM categories').get().n === 0) {
  const insert = db.prepare('INSERT INTO categories (name) VALUES (?)');
  db.transaction((names) => names.forEach((n) => insert.run(n)))(DEFAULT_CATEGORIES);
}

// Pessoa "Própria" semeada por padrão
if (db.prepare('SELECT COUNT(*) AS n FROM people').get().n === 0) {
  db.prepare('INSERT INTO people (name, is_self, color) VALUES (?, 1, ?)').run('Própria', '#4DA6FF');
}

export default db;

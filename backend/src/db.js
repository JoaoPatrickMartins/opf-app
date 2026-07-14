import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';

// .env mora na raiz do monorepo (dev); no app empacotado, o caminho vem em OPF_ENV_PATH.
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: process.env.OPF_ENV_PATH || join(__dirname, '..', '..', '.env') });

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'opf';

if (!URI) {
  throw new Error('MONGODB_URI não configurada — defina no .env da raiz do projeto.');
}

const client = new MongoClient(URI);
let _db = null;

// Conecta ao Atlas. Chamado uma vez no bootstrap do servidor (index.js).
export async function connect() {
  if (_db) return _db;
  await client.connect();
  _db = client.db(DB_NAME);
  return _db;
}

export function getDb() {
  if (!_db) throw new Error('MongoDB não conectado — chame connect() antes.');
  return _db;
}

// Getters de coleção (mesmos nomes das tabelas v2).
export const col = {
  people: () => getDb().collection('people'),
  sources: () => getDb().collection('sources'),
  categories: () => getDb().collection('categories'),
  transactions: () => getDb().collection('transactions'),
  recurring: () => getDb().collection('recurring_rules'),
  learning: () => getDb().collection('classification_history'),
  settings: () => getDb().collection('settings'),
  counters: () => getDb().collection('counters')
};

// Emula AUTOINCREMENT do SQLite: sequência por coleção guardada em `counters`.
export async function nextId(name) {
  const doc = await col.counters().findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return doc.seq;
}

// Converte um documento do Mongo para o formato da API (contrato v1/SQLite): _id -> id.
// Coleções com _id não-numérico (settings, classification_history) não expõem `id`.
export function serialize(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  if (typeof _id === 'number') return { id: _id, ...rest };
  return { ...rest, _id };
}

export const serializeAll = (docs) => docs.map(serialize);

const DEFAULT_CATEGORIES = [
  'Alimentação', 'Transporte', 'Moradia', 'Saúde',
  'Lazer', 'Assinaturas', 'Compras online', 'Outros'
];

// Cria índices e semeia dados iniciais. Idempotente.
export async function initSchema() {
  // Índices de transactions (espelham idx_tx_* do SQLite)
  await col.transactions().createIndexes([
    { key: { reference_month: 1 }, name: 'idx_tx_month' },
    { key: { person_id: 1 }, name: 'idx_tx_person' },
    { key: { source_id: 1 }, name: 'idx_tx_source' }
  ]);
  // fitid UNIQUE — índice PARCIAL: no Mongo múltiplos nulls quebrariam um único normal.
  await col.transactions().createIndex(
    { fitid: 1 },
    { unique: true, partialFilterExpression: { fitid: { $type: 'string' } }, name: 'uniq_tx_fitid' }
  );
  // Idempotência da materialização de recorrências: 1 lançamento por (regra, mês).
  // Também serve às consultas por recurring_id (prefixo do índice composto).
  await col.transactions().createIndex(
    { recurring_id: 1, reference_month: 1 },
    { unique: true, partialFilterExpression: { recurring_id: { $type: 'number' } }, name: 'uniq_tx_recurring_month' }
  );
  await col.categories().createIndex({ name: 1 }, { unique: true, name: 'uniq_cat_name' });

  // ---- Seeds ----
  if (await col.categories().countDocuments() === 0) {
    for (const name of DEFAULT_CATEGORIES) {
      await col.categories().insertOne({ _id: await nextId('categories'), name, budget_limit: null });
    }
  }
  if (await col.people().countDocuments() === 0) {
    await col.people().insertOne({
      _id: await nextId('people'),
      name: 'Própria',
      is_self: 1,
      initial_balance: 0,
      color: '#4DA6FF',
      created_at: new Date().toISOString()
    });
  }
}

export default client;

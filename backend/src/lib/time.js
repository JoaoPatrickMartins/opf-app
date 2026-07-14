// Mês atual do servidor no formato 'YYYY-MM'.
export function currentMonthServer() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Data de hoje do servidor no formato 'YYYY-MM-DD' (mesmo formato de transactions.date).
export function todayServer() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

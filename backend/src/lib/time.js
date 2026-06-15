// Mês atual do servidor no formato 'YYYY-MM'.
export function currentMonthServer() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

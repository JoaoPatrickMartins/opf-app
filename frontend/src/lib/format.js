const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// 4218.9 -> "4.218,90" (sem símbolo)
export function formatAmount(value) {
  return Math.abs(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// com símbolo R$
export function formatBRL(value) {
  return `R$ ${formatAmount(value)}`;
}

// '2026-05' -> 'Maio 2026'
export function formatMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${MONTHS_PT[Number(m) - 1]} ${y}`;
}

// '2026-05' -> 'Mai 2026' (curto)
export function formatMonthShort(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${MONTHS_PT[Number(m) - 1].slice(0, 3)} ${y}`;
}

// '2026-05-15' -> '15/05'
export function formatDay(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

// mês atual no formato YYYY-MM
export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// navega N meses a partir de um YYYY-MM
export function addMonths(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

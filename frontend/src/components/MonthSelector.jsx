import { useStore } from '../lib/store.jsx';
import { formatMonth, addMonths } from '../lib/format.js';

export default function MonthSelector() {
  const { month, setMonth } = useStore();
  return (
    <div className="flex items-center gap-2 bg-deep border border-line rounded-full px-2 py-1">
      <button
        onClick={() => setMonth(addMonths(month, -1))}
        className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-white/5 transition-colors"
        aria-label="Mês anterior"
      >
        ‹
      </button>
      <span className="text-sm font-medium min-w-[120px] text-center select-none">{formatMonth(month)}</span>
      <button
        onClick={() => setMonth(addMonths(month, 1))}
        className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-white/5 transition-colors"
        aria-label="Próximo mês"
      >
        ›
      </button>
    </div>
  );
}

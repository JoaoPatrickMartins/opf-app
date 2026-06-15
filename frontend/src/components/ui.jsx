// Componentes base do sistema OPF · Fluxo.

// Monograma OPF dentro do anel de gradiente.
export function Mark({ size = 40 }) {
  const ring = Math.max(2, Math.round(size * 0.05));
  return (
    <span
      className="relative inline-flex items-center justify-center rounded-full font-semibold flex-none"
      style={{ width: size, height: size, background: '#0B1424', color: '#EAF3FF', fontSize: size * 0.3 }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          padding: ring,
          background: 'conic-gradient(from 210deg, #4DA6FF, #6366F1, #4DA6FF)',
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude'
        }}
      />
      OPF
    </span>
  );
}

export function Button({ variant = 'primary', className = '', ...props }) {
  const base = 'font-semibold text-sm rounded-full px-5 py-2.5 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-aurora text-[#07101F] hover:opacity-90',
    secondary: 'bg-transparent text-sky border border-azure/50 hover:bg-azure/10',
    ghost: 'bg-white/5 text-paper hover:bg-white/10',
    danger: 'bg-transparent text-[#FF7B7B] border border-[#FF7B7B]/40 hover:bg-[#FF7B7B]/10'
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Chip({ tone = 'neu', children }) {
  const tones = {
    pos: 'bg-positive/15 text-positive',
    neu: 'bg-azure/15 text-[#9CCBFF]',
    cau: 'bg-caution/15 text-caution'
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ className = '', children }) {
  return <div className={`bg-deep border border-line rounded-l p-7 ${className}`}>{children}</div>;
}

export function Label({ children, className = '' }) {
  return <div className={`label-cap text-faint ${className}`}>{children}</div>;
}

// Valor monetário com símbolo menor em tom muted.
export function Money({ value, big = false, grad = false, className = '' }) {
  const abs = Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = value < 0 ? '-' : '';
  return (
    <span className={`amount ${grad ? 'grad-text' : ''} ${className}`} style={big ? { fontSize: 40, fontWeight: 500, letterSpacing: '-0.02em' } : {}}>
      <span className="text-muted mr-1" style={big ? { fontSize: 20, WebkitTextFillColor: '#93A4C4' } : {}}>{sign}R$</span>
      {abs}
    </span>
  );
}

// Estado vazio calmo.
export function Empty({ children }) {
  return <div className="text-center text-muted font-light py-16">{children}</div>;
}

// Stepper numérico premium (− valor +). Substitui as setas nativas.
export function NumberStepper({ value, onChange, min = 0, max = 999, step = 1, width = 56 }) {
  const num = value === '' || value == null ? min : Number(value);
  const clamp = (v) => Math.min(max, Math.max(min, v));
  const setVal = (v) => onChange(String(clamp(v)));
  return (
    <div className="inline-flex items-center rounded-full border border-line bg-void overflow-hidden select-none focus-within:border-azure/50 transition-colors">
      <button type="button" tabIndex={-1} onClick={() => setVal(num - step)} disabled={num <= min}
        className="w-8 h-8 flex items-center justify-center text-muted hover:text-paper hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-lg leading-none">−</button>
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => e.target.value !== '' && setVal(Number(e.target.value))}
        className="bg-transparent text-center amount text-sm text-paper outline-none py-1.5"
        style={{ width }} />
      <button type="button" tabIndex={-1} onClick={() => setVal(num + step)} disabled={num >= max}
        className="w-8 h-8 flex items-center justify-center text-muted hover:text-paper hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-lg leading-none">+</button>
    </div>
  );
}

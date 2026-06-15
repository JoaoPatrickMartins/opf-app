import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Mark } from './ui.jsx';
import Icon from './Icon.jsx';
import MonthSelector from './MonthSelector.jsx';

const NAV = [
  { to: '/', label: 'Resumo', icon: 'donut', end: true },
  { to: '/people', label: 'Contas', icon: 'users' },
  { to: '/sources', label: 'Cartões & fontes', icon: 'card' },
  { to: '/import', label: 'Importar', icon: 'upload' },
  { to: '/settings', label: 'Configurações', icon: 'settings' }
];

export default function Layout() {
  const { pathname } = useLocation();
  const showMonth = pathname === '/' || /^\/people\/\d+$/.test(pathname);
  const current = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to) && n.to !== '/'));

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 flex-none border-r border-line bg-deep/40 flex flex-col">
        <div className="flex items-center gap-3 px-6 py-7">
          <Mark size={40} />
          <div>
            <div className="font-semibold leading-none">OPF<span className="text-muted font-light"> app</span></div>
            <div className="text-[10px] text-faint tracking-wider mt-1 uppercase">o caminho do seu dinheiro</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3 mt-2">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-m text-sm transition-colors ${
                  isActive ? 'bg-azure/12 text-paper' : 'text-muted hover:text-paper hover:bg-white/5'
                }`}>
              <Icon name={n.icon} size={18} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-6 py-5 text-[11px] text-faint font-light">Uso pessoal · dados locais</div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="flex items-center justify-between px-10 py-6 border-b border-line-soft">
          <div className="text-faint text-sm font-light">{current?.label || 'OPF'}</div>
          {showMonth && <MonthSelector />}
        </header>
        <div className="px-10 py-8 max-w-5xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

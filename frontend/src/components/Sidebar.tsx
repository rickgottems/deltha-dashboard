import { NavLink, useNavigate } from 'react-router-dom';
import {
  Calendar,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/', label: 'Executivo', icon: LayoutDashboard, end: true },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/receitas', label: 'Receitas', icon: TrendingUp },
  { to: '/despesas', label: 'Despesas', icon: TrendingDown },
  { to: '/vendas', label: 'Vendas', icon: ShoppingCart },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/operacoes', label: 'Operações', icon: ClipboardList },
  { to: '/calendario', label: 'Calendário', icon: Calendar },
  { to: '/relatorios', label: 'Relatórios', icon: FileText },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function Sidebar() {
  const { company, user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-[#05081a]">
      <div className="flex items-center gap-2.5 px-5 pb-6 pt-6">
        <img src="/deltha-mark.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
        <div>
          <div className="text-sm font-extrabold tracking-[0.14em]">
            RADAR DELTHA<span className="text-accent">·</span>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-mut">Gestão empresarial</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                isActive ? 'bg-accent/10 text-accent' : 'text-mut hover:bg-panel2 hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-accent" />}
                <Icon size={17} strokeWidth={2} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line px-5 py-4">
        <div className="mb-2 min-w-0">
          <div className="truncate text-xs font-semibold text-ink">{company?.name}</div>
          <div className="truncate text-[10px] text-mut">{user?.email}</div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-mut transition-colors hover:text-neg"
        >
          <LogOut size={13} />
          Sair
        </button>
      </div>
    </aside>
  );
}

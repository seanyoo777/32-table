import { NavLink } from 'react-router-dom'
import {
  Home, Trophy, TableProperties, ClipboardList, Calendar,
  Zap, QrCode, Monitor, Settings, LayoutDashboard
} from 'lucide-react'

const navItems = [
  { to: '/', label: '홈', icon: Home, exact: true },
  { to: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { to: '/rankings', label: '랭킹', icon: Trophy },
  { to: '/tournament', label: '토너먼트', icon: TableProperties },
  { to: '/league', label: '리그전', icon: ClipboardList },
  { to: '/schedule', label: '경기일정', icon: Calendar },
  { to: '/score', label: '점수입력', icon: Zap },
  { to: '/checkin', label: 'QR 체크인', icon: QrCode },
  { to: '/liveboard', label: '라이브보드', icon: Monitor },
]

export default function Sidebar() {
  return (
    <aside className="w-[220px] flex-shrink-0 h-screen bg-gray-900 flex flex-col select-none">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🏓</span>
          <div>
            <div className="font-bold text-white text-sm leading-tight">탁구대회</div>
            <div className="text-gray-400 text-xs">관리 시스템</div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ' +
              (isActive
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-gray-800')
            }
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Settings + version at bottom */}
      <div className="px-3 py-3 border-t border-gray-800 flex-shrink-0 space-y-0.5">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ' +
            (isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800')
          }
        >
          <Settings size={16} strokeWidth={2} />
          설정
        </NavLink>
        <div className="px-3 pt-1 text-xs text-gray-600">v3.0 · 탁구대회 관리</div>
      </div>
    </aside>
  )
}

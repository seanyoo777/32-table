import { NavLink } from 'react-router-dom'
import { Home, Trophy, TableProperties, ClipboardList, Calendar, Users, LayoutDashboard, QrCode, Monitor, Settings } from 'lucide-react'

const navItems = [
  { to: '/', label: '홈', icon: Home, exact: true },
  { to: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { to: '/rankings', label: '랭킹', icon: Trophy },
  { to: '/tournament', label: '토너먼트', icon: TableProperties },
  { to: '/league', label: '리그전', icon: ClipboardList },
  { to: '/schedule', label: '경기일정', icon: Calendar },
  { to: '/score', label: '점수입력', icon: Users },
  { to: '/checkin', label: 'QR체크인', icon: QrCode },
  { to: '/liveboard', label: '라이브보드', icon: Monitor },
  { to: '/settings', label: '설정', icon: Settings },
]

export default function Navbar() {
  return (
    <nav className="bg-blue-700 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center h-14">
          <div className="flex items-center gap-2 mr-8 flex-shrink-0">
            <span className="text-xl">🏓</span>
            <span className="font-bold text-lg tracking-tight">탁구대회 관리</span>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {navItems.map(({ to, label, icon: Icon, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ` +
                  (isActive ? 'bg-white/20 text-white' : 'text-blue-100 hover:bg-white/10 hover:text-white')
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}

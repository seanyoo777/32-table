import { NavLink } from 'react-router-dom'
import { useStore } from '../store/useStore'
import {
  Home, Trophy, TableProperties, ClipboardList, Calendar,
  Zap, QrCode, Monitor, Settings, LayoutDashboard, BarChart3, Sun, Moon, X
} from 'lucide-react'

export default function Sidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const { matchCalls, liveMatches, scoreRecords, appSettings, updateAppSettings } = useStore()
  const pendingCalls = matchCalls.filter(c => !c.acknowledged).length
  const unverified = scoreRecords.filter(r => !r.verified).length
  const isDark = appSettings.theme === 'dark'

  const navItems = [
    { to: '/', label: '홈', icon: Home, exact: true, badge: 0 },
    { to: '/dashboard', label: '대시보드', icon: LayoutDashboard, badge: pendingCalls + unverified },
    { to: '/rankings', label: '랭킹', icon: Trophy, badge: 0 },
    { to: '/tournament', label: '토너먼트', icon: TableProperties, badge: 0 },
    { to: '/league', label: '리그전', icon: ClipboardList, badge: 0 },
    { to: '/schedule', label: '경기일정', icon: Calendar, badge: 0 },
    { to: '/score', label: '점수입력', icon: Zap, badge: liveMatches.length },
    { to: '/checkin', label: 'QR 체크인', icon: QrCode, badge: 0 },
    { to: '/liveboard', label: '라이브보드', icon: Monitor, badge: 0 },
    { to: '/stats', label: '통계·리포트', icon: BarChart3, badge: 0 },
  ]

  return (
    <>
      {/* 모바일 백드롭 */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />
      )}
      <aside className={
        'w-[220px] flex-shrink-0 h-screen bg-gray-900 flex flex-col select-none z-50 ' +
        'fixed inset-y-0 left-0 transition-transform duration-200 md:static md:translate-x-0 ' +
        (mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0')
      }>
      {/* Logo */}
      <div className="px-5 py-4 border-b border-gray-800 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🏓</span>
          <div>
            <div className="font-bold text-white text-sm leading-tight">탁구대회</div>
            <div className="text-gray-400 text-xs">관리 시스템</div>
          </div>
        </div>
        <button onClick={onClose} className="md:hidden text-gray-400 hover:text-white p-1"><X size={18} /></button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, exact, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            onClick={onClose}
            className={({ isActive }) =>
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ' +
              (isActive
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-gray-800')
            }
          >
            <Icon size={16} strokeWidth={2} />
            <span className="flex-1">{label}</span>
            {badge > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Settings + version at bottom */}
      <div className="px-3 py-3 border-t border-gray-800 flex-shrink-0 space-y-0.5">
        <button
          onClick={() => updateAppSettings({ theme: isDark ? 'light' : 'dark' })}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          {isDark ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
          <span className="flex-1 text-left">{isDark ? '라이트 모드' : '다크 모드'}</span>
        </button>
        <NavLink
          to="/settings"
          onClick={onClose}
          className={({ isActive }) =>
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ' +
            (isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800')
          }
        >
          <Settings size={16} strokeWidth={2} />
          설정
        </NavLink>
        <div className="px-3 pt-1 text-xs text-gray-600">v3.9 · 탁구대회 관리</div>
      </div>
      </aside>
    </>
  )
}

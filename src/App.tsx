import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import { ErrorBoundary } from './components/ErrorBoundary'
import Home from './pages/Home'
import Rankings from './pages/Rankings'
import Tournament from './pages/Tournament'
import League from './pages/League'
import Schedule from './pages/Schedule'
import Score from './pages/Score'
import Dashboard from './pages/Dashboard'
import CheckIn from './pages/CheckIn'
import LiveBoard from './pages/LiveBoard'
import Settings from './pages/Settings'
import PublicTournament from './pages/PublicTournament'

const pages: { path: string; element: React.ReactElement; label: string }[] = [
  { path: '/', element: <Home />, label: '홈' },
  { path: '/dashboard', element: <Dashboard />, label: '대시보드' },
  { path: '/rankings', element: <Rankings />, label: '랭킹' },
  { path: '/tournament', element: <Tournament />, label: '토너먼트' },
  { path: '/league', element: <League />, label: '리그전' },
  { path: '/schedule', element: <Schedule />, label: '경기일정' },
  { path: '/score', element: <Score />, label: '점수입력' },
  { path: '/checkin', element: <CheckIn />, label: 'QR체크인' },
  { path: '/liveboard', element: <LiveBoard />, label: '라이브보드' },
  { path: '/settings', element: <Settings />, label: '설정' },
]

function MainLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          {pages.map(({ path, element, label }) => (
            <Route
              key={path}
              path={path}
              element={<ErrorBoundary fallbackLabel={label}>{element}</ErrorBoundary>}
            />
          ))}
        </Routes>
      </main>
      <footer className="text-center text-xs text-gray-400 py-3 border-t mt-auto">
        🏓 탁구 대회 관리 시스템 v3.0 — USATT Elo 레이팅 · QR 체크인 · 라이브 보드
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/public/:id" element={<PublicTournament />} />
        <Route path="/*" element={<MainLayout />} />
      </Routes>
    </BrowserRouter>
  )
}

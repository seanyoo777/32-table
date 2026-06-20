import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import { ErrorBoundary } from './components/ErrorBoundary'

// 라우트 코드 스플리팅 — 초기 번들에서 분리하여 첫 로딩 속도 개선
const Home = lazy(() => import('./pages/Home'))
const Rankings = lazy(() => import('./pages/Rankings'))
const Tournament = lazy(() => import('./pages/Tournament'))
const League = lazy(() => import('./pages/League'))
const Schedule = lazy(() => import('./pages/Schedule'))
const Score = lazy(() => import('./pages/Score'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const CheckIn = lazy(() => import('./pages/CheckIn'))
const LiveBoard = lazy(() => import('./pages/LiveBoard'))
const Stats = lazy(() => import('./pages/Stats'))
const Settings = lazy(() => import('./pages/Settings'))
const PublicTournament = lazy(() => import('./pages/PublicTournament'))

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
  { path: '/stats', element: <Stats />, label: '통계·리포트' },
  { path: '/settings', element: <Settings />, label: '설정' },
]

function PageLoader() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <div className="w-8 h-8 border-3 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        <span className="text-sm">불러오는 중…</span>
      </div>
    </div>
  )
}

function MainLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-hidden">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {pages.map(({ path, element, label }) => (
              <Route
                key={path}
                path={path}
                element={<ErrorBoundary fallbackLabel={label}>{element}</ErrorBoundary>}
              />
            ))}
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/public/:id" element={<PublicTournament />} />
          <Route path="/*" element={<MainLayout />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

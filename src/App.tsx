import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
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

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/rankings" element={<Rankings />} />
            <Route path="/tournament" element={<Tournament />} />
            <Route path="/league" element={<League />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/score" element={<Score />} />
            <Route path="/checkin" element={<CheckIn />} />
            <Route path="/liveboard" element={<LiveBoard />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <footer className="text-center text-xs text-gray-400 py-3 border-t mt-auto">
          🏓 탁구 대회 관리 시스템 v3.0 — USATT Elo 레이팅 · QR 체크인 · 라이브 보드
        </footer>
      </div>
    </BrowserRouter>
  )
}

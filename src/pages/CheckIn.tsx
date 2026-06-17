import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { parseQR, playerQRValue } from '../components/QRCodeDisplay'
import QRCodeDisplay from '../components/QRCodeDisplay'
import { getRatingLabel } from '../utils/ratingUtils'
import { QrCode, CheckCircle, Search, Users, Printer, RefreshCw, Wifi, Download } from 'lucide-react'
import type { Player } from '../types'

export default function CheckInPage() {
  const { players, updatePlayer } = useStore()
  const [tab, setTab] = useState<'station' | 'list' | 'card'>('station')
  const [query, setQuery] = useState('')
  const [lastScanned, setLastScanned] = useState<Player | null>(null)
  const [scanStatus, setScanStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [scanInput, setScanInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const checkedIn = players.filter(p => p.checkedIn)
  const notCheckedIn = players.filter(p => !p.checkedIn)

  const filtered = players.filter(p =>
    p.name.includes(query) || p.school.includes(query) || p.registrationNo?.includes(query)
  )

  useEffect(() => {
    if (tab === 'station') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [tab])

  function handleScan(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return
    setScanInput('')

    const parsed = parseQR(trimmed)
    let found: Player | undefined

    if (parsed.type === 'player') {
      found = players.find(p => p.id === parsed.payload[0])
    } else {
      // Allow direct name or ID input (manual fallback)
      found = players.find(p => p.id === trimmed || p.name === trimmed || p.registrationNo === trimmed)
    }

    if (found) {
      updatePlayer(found.id, { checkedIn: true })
      setLastScanned({ ...found, checkedIn: true })
      setScanStatus('success')
    } else {
      setLastScanned(null)
      setScanStatus('error')
    }
    setTimeout(() => setScanStatus('idle'), 3000)
  }

  function manualCheckIn(id: string) {
    const p = players.find(x => x.id === id)
    if (p) {
      updatePlayer(id, { checkedIn: true })
      setLastScanned(p)
    }
  }

  function resetAll() {
    players.forEach(p => updatePlayer(p.id, { checkedIn: false }))
  }

  function exportAttendanceCSV() {
    const rows = ['이름,소속,부문,성별,레이팅,체크인']
    for (const p of [...players].sort((a, b) => a.name.localeCompare(b.name))) {
      rows.push([p.name, p.school, p.division, p.gender, p.rating ?? 1000, p.checkedIn ? 'O' : 'X'].join(','))
    }
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `체크인현황_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const tabs = [
    { id: 'station' as const, label: '체크인 스테이션', icon: QrCode },
    { id: 'list' as const, label: `체크인 현황 (${checkedIn.length}/${players.length})`, icon: Users },
    { id: 'card' as const, label: 'QR 선수증 출력', icon: Printer },
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50 px-5 py-4 gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <QrCode size={20} className="text-blue-500" />
          디지털 체크인 시스템
        </h1>
        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
          <Wifi size={13} /> 실시간 연동
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              tab === id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── 체크인 스테이션 ── */}
      {tab === 'station' && (
        <div className="space-y-4">
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card text-center py-3">
              <div className="text-2xl font-bold text-blue-600">{checkedIn.length}</div>
              <div className="text-xs text-gray-400 mt-0.5">체크인 완료</div>
            </div>
            <div className="card text-center py-3">
              <div className="text-2xl font-bold text-orange-500">{notCheckedIn.length}</div>
              <div className="text-xs text-gray-400 mt-0.5">미체크인</div>
            </div>
            <div className="card text-center py-3">
              <div className="text-2xl font-bold text-green-600">
                {players.length > 0 ? Math.round(checkedIn.length / players.length * 100) : 0}%
              </div>
              <div className="text-xs text-gray-400 mt-0.5">참가율</div>
            </div>
          </div>

          {/* Scanner Area */}
          <div className={`card transition-all border-2 ${
            scanStatus === 'success' ? 'border-green-400 bg-green-50' :
            scanStatus === 'error' ? 'border-red-400 bg-red-50' :
            'border-blue-200 bg-blue-50'
          }`}>
            <div className="text-center space-y-3 py-4">
              <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center ${
                scanStatus === 'success' ? 'bg-green-500' :
                scanStatus === 'error' ? 'bg-red-500' : 'bg-blue-600'
              }`}>
                {scanStatus === 'success' ? <CheckCircle size={36} className="text-white" /> :
                 scanStatus === 'error' ? <span className="text-white text-2xl">✗</span> :
                 <QrCode size={36} className="text-white" />}
              </div>

              {scanStatus === 'success' && lastScanned && (
                <div className="animate-pulse">
                  <p className="text-green-700 font-bold text-lg">{lastScanned.name} 선수</p>
                  <p className="text-green-600 text-sm">{lastScanned.school} · {lastScanned.division}</p>
                  <p className="text-green-500 text-xs mt-1">✓ 체크인 완료!</p>
                </div>
              )}
              {scanStatus === 'error' && (
                <div>
                  <p className="text-red-700 font-bold">등록되지 않은 선수</p>
                  <p className="text-red-500 text-sm">QR코드 또는 이름을 다시 확인해주세요</p>
                </div>
              )}
              {scanStatus === 'idle' && (
                <div>
                  <p className="text-blue-700 font-semibold">QR코드를 스캔하거나 이름/번호를 입력하세요</p>
                  <p className="text-blue-500 text-sm">선수 QR코드를 리더기에 가져다 대세요</p>
                </div>
              )}

              <input
                ref={inputRef}
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScan(scanInput) }}
                placeholder="QR 스캔 또는 이름/등록번호 입력 후 Enter"
                className="input w-full max-w-sm mx-auto text-center"
                autoFocus
              />
              <button
                onClick={() => handleScan(scanInput)}
                className="btn-primary px-6"
              >
                체크인 확인
              </button>
            </div>
          </div>

          {/* Quick Manual Search */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700 text-sm">수동 체크인 (이름 검색)</h2>
              <button onClick={resetAll} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                <RefreshCw size={11} /> 전체 초기화
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="input pl-8"
                placeholder="선수 이름, 소속, 등록번호 검색..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
              {filtered.slice(0, 20).map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${p.checkedIn ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="font-medium text-sm">{p.name}</span>
                    <span className="text-xs text-gray-400">{p.school} · {p.division}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${getRatingLabel(p.rating).bg} ${getRatingLabel(p.rating).color}`}>
                      {p.rating}
                    </span>
                  </div>
                  {p.checkedIn ? (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle size={12} /> 완료
                    </span>
                  ) : (
                    <button
                      onClick={() => manualCheckIn(p.id)}
                      className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                    >
                      체크인
                    </button>
                  )}
                </div>
              ))}
              {filtered.length > 20 && (
                <p className="text-center text-xs text-gray-400 py-2">이름을 더 입력하면 결과가 좁혀집니다...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 체크인 현황 ── */}
      {tab === 'list' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={exportAttendanceCSV} className="btn-secondary text-sm flex items-center gap-1.5">
              <Download size={14} /> 출석 CSV
            </button>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${players.length > 0 ? checkedIn.length / players.length * 100 : 0}%` }}
            />
          </div>
          <div className="text-sm text-gray-500 text-center">
            {checkedIn.length}명 체크인 / {notCheckedIn.length}명 미체크인
          </div>

          {/* By Division */}
          {(['초등','중등','고등','대학','일반','생활체육'] as const).map(div => {
            const divPlayers = players.filter(p => p.division === div)
            const divIn = divPlayers.filter(p => p.checkedIn)
            return (
              <div key={div} className="card py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{div}</span>
                  <span className="text-xs text-gray-500">{divIn.length}/{divPlayers.length}명</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${divPlayers.length > 0 ? divIn.length / divPlayers.length * 100 : 0}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {divPlayers.filter(p => !p.checkedIn).slice(0, 10).map(p => (
                    <span key={p.id} className="text-[10px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">
                      {p.name}
                    </span>
                  ))}
                  {divPlayers.filter(p => !p.checkedIn).length > 10 && (
                    <span className="text-[10px] text-gray-400">+{divPlayers.filter(p => !p.checkedIn).length - 10}명</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── QR 선수증 출력 ── */}
      {tab === 'card' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              className="input flex-1"
              placeholder="선수 이름 또는 소속 검색..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <button
              onClick={() => window.print()}
              className="btn-primary flex items-center gap-1.5"
            >
              <Printer size={15} /> 인쇄
            </button>
          </div>
          <p className="text-xs text-gray-400">선수 QR코드를 출력하여 배포하세요. 체크인 스테이션에서 스캔하면 즉시 등록됩니다.</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 print:grid-cols-4">
            {(query ? filtered : players).slice(0, 40).map(p => {
              const label = getRatingLabel(p.rating)
              return (
                <div key={p.id} className="border border-gray-200 rounded-xl p-3 bg-white shadow-sm flex flex-col items-center gap-2 print:break-inside-avoid">
                  <div className="w-full flex items-center justify-between">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${label.bg} ${label.color}`}>
                      {label.label}
                    </span>
                    <span className="text-[10px] text-gray-400">{p.division}</span>
                  </div>
                  {p.photoUrl ? (
                    <img src={p.photoUrl} alt={p.name} className="w-16 h-16 rounded-full object-cover border-2 border-gray-100" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    <QRCodeDisplay value={playerQRValue(p.id)} size={80} />
                  )}
                  <div className="text-center">
                    <p className="font-bold text-sm text-gray-800">{p.name}</p>
                    <p className="text-[10px] text-gray-500">{p.school}</p>
                    <p className="text-[10px] text-blue-600 font-mono mt-0.5">레이팅 {p.rating}</p>
                    {p.registrationNo && (
                      <p className="text-[10px] text-gray-400">#{p.registrationNo}</p>
                    )}
                  </div>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${p.gender === '남' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}`}>
                    {p.gender}자부
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

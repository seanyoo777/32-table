import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { parseQR, playerQRValue } from '../components/QRCodeDisplay'
import QRCodeDisplay from '../components/QRCodeDisplay'
import { getRatingLabel } from '../utils/ratingUtils'
import { genId } from '../utils/bracketUtils'
import { QrCode, CheckCircle, Search, Users, Printer, RefreshCw, Wifi, Download, DollarSign, UserPlus, X } from 'lucide-react'
import type { Player, Division } from '../types'

function hl(text: string, q: string) {
  if (!q) return <>{text}</>
  const i = text.indexOf(q)
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<mark className="bg-yellow-200 text-yellow-900 not-italic rounded-sm">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
}

export default function CheckInPage() {
  const { players, updatePlayer, addPlayer, toggleFeePaid, resetFeePaid } = useStore()
  const [tab, setTab] = useState<'station' | 'list' | 'fee' | 'card'>('station')
  const [feeAmount, setFeeAmount] = useState(5000)
  const [feeQuery, setFeeQuery] = useState('')
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastScanned, setLastScanned] = useState<Player | null>(null)
  const [scanStatus, setScanStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [scanInput, setScanInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [showWalkin, setShowWalkin] = useState(false)
  const [walkinName, setWalkinName] = useState('')
  const [walkinSchool, setWalkinSchool] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)

  function playBeep(type: 'success' | 'error') {
    if (!soundEnabled) return
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = type === 'success' ? 'sine' : 'sawtooth'
      osc.frequency.value = type === 'success' ? 880 : 280
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (type === 'success' ? 0.2 : 0.35))
      osc.start(); osc.stop(ctx.currentTime + (type === 'success' ? 0.2 : 0.35))
    } catch { /* AudioContext unavailable */ }
  }
  const [walkinDiv, setWalkinDiv] = useState<Division>('일반')
  const [walkinGender, setWalkinGender] = useState<'남' | '여'>('남')
  const [divFilter, setDivFilter] = useState<string>('')

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
      playBeep('success')
    } else {
      setLastScanned(null)
      setScanStatus('error')
      playBeep('error')
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

  function uncheckIn(id: string) {
    updatePlayer(id, { checkedIn: false })
    if (lastScanned?.id === id) setLastScanned(null)
  }

  function resetAll() {
    players.forEach(p => updatePlayer(p.id, { checkedIn: false }))
  }

  function checkInAll() {
    players.filter(p => !p.checkedIn).forEach(p => updatePlayer(p.id, { checkedIn: true }))
  }

  function handleWalkin() {
    if (!walkinName.trim()) return
    const newPlayer: Player = {
      id: genId(), name: walkinName.trim(), school: walkinSchool.trim() || '현장등록',
      division: walkinDiv, gender: walkinGender,
      points: 0, wins: 0, losses: 0, rating: 1000, gamesPlayed: 0,
      checkedIn: true, createdAt: new Date().toISOString(),
    }
    addPlayer(newPlayer)
    setLastScanned(newPlayer)
    setScanStatus('success')
    setShowWalkin(false)
    setWalkinName(''); setWalkinSchool('')
    setTimeout(() => setScanStatus('idle'), 3000)
  }

  function openWalkin(prefill = '') {
    setWalkinName(prefill)
    setWalkinSchool('')
    setShowWalkin(true)
  }

  function exportAttendanceCSV() {
    const rows = ['이름,소속,부문,성별,레이팅,체크인,참가비납부']
    for (const p of [...players].sort((a, b) => a.name.localeCompare(b.name))) {
      rows.push([p.name, p.school, p.division, p.gender, p.rating ?? 1000, p.checkedIn ? 'O' : 'X', p.feePaid ? 'O' : 'X'].join(','))
    }
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `체크인현황_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportNotCheckedInCSV() {
    const rows = ['이름,소속,부문,성별,연락처']
    for (const p of [...notCheckedIn].sort((a, b) => a.name.localeCompare(b.name))) {
      rows.push([p.name, p.school, p.division, p.gender, p.phone ?? ''].join(','))
    }
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `미체크인_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const feePaid = players.filter(p => p.feePaid)
  const feeFiltered = feeQuery
    ? players.filter(p => p.name.includes(feeQuery) || p.school.includes(feeQuery))
    : players

  const tabs = [
    { id: 'station' as const, label: '체크인 스테이션', icon: QrCode },
    { id: 'list' as const, label: `체크인 현황 (${checkedIn.length}/${players.length})`, icon: Users },
    { id: 'fee' as const, label: `참가비 납부 (${feePaid.length}/${players.length})`, icon: DollarSign },
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

      {/* Check-in progress bar */}
      {players.length > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <div className="flex items-center gap-2">
              {(() => {
                const R = 12, circ = 2 * Math.PI * R
                const pct = Math.round(checkedIn.length / players.length * 100)
                const dash = (checkedIn.length / players.length) * circ
                const color = pct === 100 ? '#22c55e' : pct >= 50 ? '#14b8a6' : '#f59e0b'
                return (
                  <svg width={30} height={30} viewBox="0 0 30 30">
                    <circle cx={15} cy={15} r={R} fill="none" stroke="#e5e7eb" strokeWidth={4} />
                    <circle cx={15} cy={15} r={R} fill="none" stroke={color} strokeWidth={4}
                      strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                      transform="rotate(-90 15 15)" />
                    <text x={15} y={19} textAnchor="middle" fontSize={7} fontWeight="bold" fill={color}>{pct}%</text>
                  </svg>
                )
              })()}
              <span>체크인 진행률</span>
            </div>
            <div className="flex items-center gap-2">
              {notCheckedIn.length > 0 && (
                <button
                  onClick={() => { if (confirm(`미체크인 ${notCheckedIn.length}명을 전원 체크인 처리합니까?`)) checkInAll() }}
                  className="text-[11px] bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700 font-medium"
                >
                  전원 체크인
                </button>
              )}
              <span className="font-medium text-gray-700">
                {checkedIn.length}/{players.length}명
                {notCheckedIn.length > 0 && <span className="text-orange-500 ml-1">· 미체크인 {notCheckedIn.length}명</span>}
              </span>
            </div>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${checkedIn.length === players.length ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.round(checkedIn.length / players.length * 100)}%` }}
            />
          </div>
        </div>
      )}

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
            <div className="flex justify-end mb-1">
              <button onClick={() => setSoundEnabled(v => !v)}
                className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${soundEnabled ? 'bg-blue-100 text-blue-600 border-blue-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}
                title="스캔 음향 on/off">
                {soundEnabled ? '🔊 음향' : '🔇 음소거'}
              </button>
            </div>
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
                <div>
                  <p className="text-green-700 font-bold text-lg">{lastScanned.name} 선수</p>
                  <p className="text-green-600 text-sm">{lastScanned.school} · {lastScanned.division}</p>
                  <p className="text-green-500 text-xs mt-1">✓ 체크인 완료!</p>
                  <button
                    onClick={() => { uncheckIn(lastScanned.id); setScanStatus('idle') }}
                    className="mt-2 text-xs text-gray-400 hover:text-red-500 flex items-center gap-0.5 mx-auto"
                  >
                    <X size={11} /> 취소
                  </button>
                </div>
              )}
              {scanStatus === 'error' && (
                <div className="space-y-2">
                  <p className="text-red-700 font-bold">등록되지 않은 선수</p>
                  <p className="text-red-500 text-sm">QR코드 또는 이름을 다시 확인해주세요</p>
                  <button
                    onClick={() => openWalkin(scanInput)}
                    className="flex items-center gap-1.5 mx-auto text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600"
                  >
                    <UserPlus size={12} /> 현장등록으로 처리
                  </button>
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
                    <span className="font-medium text-sm">{hl(p.name, query)}</span>
                    <span className="text-xs text-gray-400">{hl(p.school, query)} · {p.division}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${getRatingLabel(p.rating).bg} ${getRatingLabel(p.rating).color}`}>
                      {p.rating}
                    </span>
                  </div>
                  {p.checkedIn ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-green-600 font-medium flex items-center gap-0.5">
                        <CheckCircle size={12} /> 완료
                      </span>
                      <button
                        onClick={() => uncheckIn(p.id)}
                        title="체크인 취소"
                        className="text-gray-300 hover:text-red-400 transition-colors"
                      >
                        <X size={13} />
                      </button>
                    </div>
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
              {filtered.length === 0 && query.length > 0 && (
                <div className="py-4 text-center space-y-2">
                  <p className="text-xs text-gray-400">"{query}"에 해당하는 선수가 없습니다</p>
                  <button
                    onClick={() => openWalkin(query)}
                    className="flex items-center gap-1.5 mx-auto text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600"
                  >
                    <UserPlus size={12} /> 현장등록
                  </button>
                </div>
              )}
              {filtered.length > 20 && (
                <p className="text-center text-xs text-gray-400 py-2">이름을 더 입력하면 결과가 좁혀집니다...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 현장등록 모달 ── */}
      {showWalkin && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <UserPlus size={16} className="text-orange-500" /> 현장 신규등록
              </h3>
              <button onClick={() => setShowWalkin(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">이름 *</label>
                <input className="input w-full" placeholder="선수 이름" value={walkinName} onChange={e => setWalkinName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">소속</label>
                <input className="input w-full" placeholder="학교·소속 (미입력 시 현장등록)" value={walkinSchool} onChange={e => setWalkinSchool(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">부문</label>
                  <select className="input w-full" value={walkinDiv} onChange={e => setWalkinDiv(e.target.value as Division)}>
                    {(['초등','중등','고등','대학','일반','생활체육'] as Division[]).map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">성별</label>
                  <select className="input w-full" value={walkinGender} onChange={e => setWalkinGender(e.target.value as '남' | '여')}>
                    <option value="남">남</option>
                    <option value="여">여</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowWalkin(false)} className="btn-secondary flex-1 text-sm">취소</button>
              <button
                onClick={handleWalkin}
                disabled={!walkinName.trim()}
                className="btn-primary flex-1 text-sm disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                <CheckCircle size={14} /> 등록 + 체크인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 체크인 현황 ── */}
      {tab === 'list' && (
        <div className="space-y-3">
          <div className="flex justify-end gap-2 flex-wrap">
            <select
              className="select text-sm py-1.5 flex-shrink-0"
              value={divFilter}
              onChange={e => setDivFilter(e.target.value)}
            >
              <option value="">전체 부문</option>
              {(['초등','중등','고등','대학','일반','생활체육'] as const).map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            {notCheckedIn.length > 0 && (
              <button onClick={exportNotCheckedInCSV} className="btn-secondary text-sm flex items-center gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50">
                <Download size={14} /> 미체크인 CSV
              </button>
            )}
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
          {players.length > 0 && (() => {
            const divChips = (['초등','중등','고등','대학','일반','생활체육'] as const)
              .map(div => ({ div, total: players.filter(p => p.division === div).length, done: players.filter(p => p.division === div && p.checkedIn).length }))
              .filter(x => x.total > 0)
            if (divChips.length < 2) return null
            return (
              <div className="flex gap-1.5 flex-wrap justify-center">
                {divChips.map(({ div, total, done }) => (
                  <span key={div} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${done === total ? 'bg-green-100 text-green-700' : done === 0 ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-600'}`}>
                    {div} {done}/{total}
                  </span>
                ))}
              </div>
            )
          })()}

          {/* ── 현장등록 선수 ── */}
          {(() => {
            const walkins = players.filter(p => p.school === '현장등록')
            if (walkins.length === 0) return null
            return (
              <div className="card py-3 border-orange-200 bg-orange-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm text-orange-700 flex items-center gap-1">
                    <UserPlus size={13} className="flex-shrink-0" /> 현장등록 선수
                  </span>
                  <span className="text-xs text-orange-500">{walkins.filter(p => p.checkedIn).length}/{walkins.length}명 체크인</span>
                </div>
                <div className="space-y-1">
                  {walkins.map(p => (
                    <div key={p.id} className="flex items-center gap-2 text-xs">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.checkedIn ? 'bg-green-500' : 'bg-orange-400'}`} />
                      <span className="flex-1 font-medium">{p.name}</span>
                      <span className="text-gray-400">{p.division} · {p.gender}</span>
                      {p.checkedIn ? (
                        <span className="text-green-600 font-medium">체크인</span>
                      ) : (
                        <button
                          onClick={() => manualCheckIn(p.id)}
                          className="text-[11px] bg-blue-600 text-white px-1.5 py-0.5 rounded hover:bg-blue-700"
                        >
                          체크인
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* By Division */}
          {(['초등','중등','고등','대학','일반','생활체육'] as const).filter(d => !divFilter || d === divFilter).map(div => {
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

      {/* ── 참가비 납부 관리 ── */}
      {tab === 'fee' && (
        <div className="space-y-3">
          {/* 요약 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card text-center py-3">
              <div className="text-2xl font-bold text-green-600">{feePaid.length}</div>
              <div className="text-xs text-gray-400 mt-0.5">납부 완료</div>
            </div>
            <div className="card text-center py-3">
              <div className="text-2xl font-bold text-red-500">{players.length - feePaid.length}</div>
              <div className="text-xs text-gray-400 mt-0.5">미납</div>
            </div>
            <div className="card text-center py-3">
              <div className="text-2xl font-bold text-blue-600">
                {(feePaid.length * feeAmount).toLocaleString()}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">수납액 (원)</div>
            </div>
          </div>

          {/* 설정 바 */}
          <div className="card flex items-center gap-3 flex-wrap">
            <label className="text-xs font-medium text-gray-600">참가비</label>
            <input
              type="number" step="1000" min="0"
              className="input w-28 text-right text-sm"
              value={feeAmount}
              onChange={e => setFeeAmount(Number(e.target.value))}
            />
            <span className="text-xs text-gray-500">원</span>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => { if (confirm('전원 납부 완료로 일괄 처리합니까?')) players.forEach(p => updatePlayer(p.id, { feePaid: true })) }}
                className="text-xs px-2.5 py-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200"
              >
                전원 납부
              </button>
              <button
                onClick={() => { if (confirm('납부 현황을 초기화합니까?')) resetFeePaid() }}
                className="text-xs px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 flex items-center gap-1"
              >
                <RefreshCw size={11} /> 초기화
              </button>
              <button onClick={exportAttendanceCSV} className="text-xs px-2.5 py-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 flex items-center gap-1">
                <Download size={11} /> CSV
              </button>
            </div>
          </div>

          {/* 검색 */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-8"
              placeholder="이름, 소속 검색..."
              value={feeQuery}
              onChange={e => setFeeQuery(e.target.value)}
            />
          </div>

          {/* 진행 바 */}
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${players.length > 0 ? feePaid.length / players.length * 100 : 0}%` }}
            />
          </div>

          {/* 선수 목록 */}
          <div className="card divide-y divide-gray-100 overflow-y-auto max-h-96">
            {feeFiltered.sort((a, b) => {
              // 미납 먼저, 같으면 이름순
              if (!a.feePaid && b.feePaid) return -1
              if (a.feePaid && !b.feePaid) return 1
              return a.name.localeCompare(b.name)
            }).map(p => (
              <div key={p.id} className={`flex items-center gap-3 py-2 px-2 transition-colors ${p.feePaid ? 'bg-green-50/30' : ''}`}>
                <button
                  onClick={() => toggleFeePaid(p.id)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    p.feePaid
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600'
                  }`}
                >
                  {p.feePaid ? <CheckCircle size={16} /> : <DollarSign size={14} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{p.name}</span>
                    <span className="text-xs text-gray-400">{p.school}</span>
                  </div>
                  <div className="text-xs text-gray-400">{p.division} · {p.gender}자</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-xs font-semibold ${p.feePaid ? 'text-green-600' : 'text-red-500'}`}>
                    {p.feePaid ? '납부' : '미납'}
                  </div>
                  {feeAmount > 0 && (
                    <div className="text-[10px] text-gray-400">{feeAmount.toLocaleString()}원</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 부문별 요약 */}
          <div className="card space-y-2">
            <h3 className="text-xs font-semibold text-gray-600">부문별 납부 현황</h3>
            {(['초등','중등','고등','대학','일반','생활체육'] as const).map(div => {
              const dp = players.filter(p => p.division === div)
              const paid = dp.filter(p => p.feePaid).length
              if (dp.length === 0) return null
              return (
                <div key={div} className="flex items-center gap-2 text-xs">
                  <span className="w-16 text-gray-600 font-medium">{div}</span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full">
                    <div className="h-full bg-green-400 rounded-full" style={{ width: `${dp.length > 0 ? paid / dp.length * 100 : 0}%` }} />
                  </div>
                  <span className="text-gray-500 w-12 text-right">{paid}/{dp.length}명</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── QR 선수증 출력 ── */}
      {tab === 'card' && (() => {
        const cardPlayers = (query ? filtered : players).slice(0, 80)
        const allSelected = cardPlayers.length > 0 && cardPlayers.every(p => selectedIds.has(p.id))
        const toggleAll = () => {
          if (allSelected) setSelectedIds(new Set())
          else setSelectedIds(new Set(cardPlayers.map(p => p.id)))
        }
        const toggleOne = (id: string) => {
          setSelectedIds(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
          })
        }
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 no-print">
              <input
                className="input flex-1"
                placeholder="선수 이름 또는 소속 검색..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              <button onClick={toggleAll} className={`btn-secondary text-sm flex-shrink-0 ${allSelected ? 'ring-1 ring-blue-400' : ''}`}>
                {allSelected ? '선택 해제' : '전체 선택'}
              </button>
              <button
                onClick={() => window.print()}
                className="btn-primary flex items-center gap-1.5 flex-shrink-0"
              >
                <Printer size={15} /> {selectedIds.size > 0 ? `${selectedIds.size}명 인쇄` : '인쇄'}
              </button>
            </div>
            <p className="text-xs text-gray-400 no-print">선수 QR코드를 출력하여 배포하세요. 선택하면 해당 선수만 인쇄됩니다.</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 print:grid-cols-4">
              {cardPlayers.map(p => {
                const label = getRatingLabel(p.rating)
                const isSelected = selectedIds.has(p.id)
                const hiddenOnPrint = selectedIds.size > 0 && !isSelected
                return (
                  <div
                    key={p.id}
                    onClick={() => toggleOne(p.id)}
                    className={`relative border-2 rounded-xl p-3 bg-white shadow-sm flex flex-col items-center gap-2 print:break-inside-avoid cursor-pointer transition-colors
                      ${isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}
                      ${hiddenOnPrint ? 'no-print' : ''}`}
                  >
                    {selectedIds.size > 0 && (
                      <span className={`absolute top-2 right-2 w-4 h-4 rounded-full border-2 flex items-center justify-center no-print
                        ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                        {isSelected && <span className="text-white text-[8px] font-bold">✓</span>}
                      </span>
                    )}
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
        )
      })()}
    </div>
  )
}

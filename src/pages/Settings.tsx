import { useState, useRef } from 'react'
import { useStore } from '../store/useStore'
import { Save, Download, Upload, Trash2, AlertTriangle, CheckCircle, Info, Database, Settings as SettingsIcon } from 'lucide-react'

export default function Settings() {
  const {
    players, pairs, teams, tournaments, schedules, scoreRecords,
    appSettings, updateAppSettings, resetAllData, restoreBackup,
  } = useStore()

  const [form, setForm] = useState({ ...appSettings })
  const [saved, setSaved] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleSave() {
    updateAppSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleBackup() {
    const data = {
      version: '3.0',
      exportedAt: new Date().toISOString(),
      appSettings,
      players, pairs, teams, tournaments, schedules, scoreRecords,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `탁구대회_백업_${new Date().toISOString().split('T')[0]}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (!data.players && !data.tournaments) throw new Error('올바른 백업 파일이 아닙니다')
        restoreBackup(data)
        setRestoreMsg(`복원 완료: 선수 ${data.players?.length ?? 0}명, 대회 ${data.tournaments?.length ?? 0}개`)
      } catch (err) {
        setRestoreMsg(`오류: ${(err as Error).message}`)
      }
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }

  function handleReset() {
    resetAllData()
    setResetConfirm(false)
    setRestoreMsg('모든 데이터가 초기화되었습니다.')
  }

  const stats = [
    { label: '선수', value: players.length, color: 'text-blue-600' },
    { label: '복식 페어', value: pairs.length, color: 'text-purple-600' },
    { label: '단체팀', value: teams.length, color: 'text-indigo-600' },
    { label: '대회', value: tournaments.length, color: 'text-green-600' },
    { label: '일정', value: schedules.length, color: 'text-orange-600' },
    { label: '점수 기록', value: scoreRecords.length, color: 'text-gray-600' },
    { label: '진행중 대회', value: tournaments.filter(t => t.status === 'ongoing').length, color: 'text-red-600' },
    { label: '완료 대회', value: tournaments.filter(t => t.status === 'completed').length, color: 'text-teal-600' },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <SettingsIcon size={20} className="text-gray-500" /> 시스템 설정
      </h1>

      {/* 현황 통계 */}
      <section className="card">
        <div className="flex items-center gap-2 mb-4">
          <Database size={16} className="text-gray-500" />
          <h2 className="font-semibold text-gray-700">데이터 현황</h2>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {stats.map(s => (
            <div key={s.label} className="text-center p-3 bg-gray-50 rounded-lg">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 앱 설정 */}
      <section className="card space-y-4">
        <h2 className="font-semibold text-gray-700">대회 기본 정보</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">주관 단체</label>
            <input className="input" placeholder="예: 서울특별시탁구협회" value={form.organizerName}
              onChange={e => setForm(f => ({ ...f, organizerName: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">기본 경기장</label>
            <input className="input" placeholder="예: 서울 탁구경기장" value={form.venueName}
              onChange={e => setForm(f => ({ ...f, venueName: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">시즌 연도</label>
            <input className="input" placeholder="예: 2026" value={form.season}
              onChange={e => setForm(f => ({ ...f, season: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">연락처 전화</label>
            <input className="input" placeholder="예: 02-0000-0000" value={form.contactPhone}
              onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-gray-700 block mb-1">연락처 이메일</label>
            <input className="input" placeholder="예: contact@example.com" value={form.contactEmail}
              onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} />
          </div>
        </div>
        <button onClick={handleSave} className="btn-primary flex items-center gap-2">
          {saved ? <><CheckCircle size={15} /> 저장됨!</> : <><Save size={15} /> 설정 저장</>}
        </button>
      </section>

      {/* 백업 & 복원 */}
      <section className="card space-y-4">
        <h2 className="font-semibold text-gray-700">데이터 백업 / 복원</h2>

        {restoreMsg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${restoreMsg.startsWith('오류') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {restoreMsg.startsWith('오류') ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
            {restoreMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={handleBackup}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium transition-colors">
            <Download size={16} /> 백업 파일 다운로드
          </button>
          <label className="flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 border-green-200 bg-green-50 text-green-700 hover:bg-green-100 font-medium transition-colors cursor-pointer">
            <Upload size={16} /> 백업 파일로 복원
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleRestore} />
          </label>
        </div>
        <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-50 p-3 rounded-lg">
          <Info size={12} className="mt-0.5 flex-shrink-0" />
          백업 파일에는 선수 정보, 대회 결과, 랭킹 데이터가 모두 포함됩니다. 중요한 대회 전에 백업하세요.
        </div>
      </section>

      {/* 데이터 초기화 */}
      <section className="card border-red-100 space-y-3">
        <h2 className="font-semibold text-red-600 flex items-center gap-2"><AlertTriangle size={16} />데이터 초기화</h2>
        <p className="text-sm text-gray-600">모든 선수, 대회, 일정, 점수 기록을 삭제합니다. 이 작업은 되돌릴 수 없습니다.</p>
        {!resetConfirm ? (
          <button onClick={() => setResetConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium transition-colors">
            <Trash2 size={14} /> 전체 데이터 초기화
          </button>
        ) : (
          <div className="bg-red-50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-red-700">정말로 모든 데이터를 삭제하시겠습니까?</p>
            <div className="flex gap-2">
              <button onClick={handleReset}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                네, 삭제합니다
              </button>
              <button onClick={() => setResetConfirm(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300">
                취소
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 시스템 정보 */}
      <section className="card text-sm text-gray-500 space-y-1">
        <h2 className="font-semibold text-gray-600 mb-2">시스템 정보</h2>
        <div className="grid grid-cols-2 gap-1">
          <span>버전</span><span className="text-gray-700">v3.0</span>
          <span>레이팅 시스템</span><span className="text-gray-700">USATT Elo</span>
          <span>대진 형식</span><span className="text-gray-700">토너먼트 / 리그 / 조별+토너먼트</span>
          <span>지원 부문</span><span className="text-gray-700">초등·중등·고등·대학·일반·생활체육</span>
          <span>데이터 저장</span><span className="text-gray-700">브라우저 로컬스토리지</span>
        </div>
      </section>
    </div>
  )
}

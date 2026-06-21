import { useState, useRef } from 'react'
import { useStore } from '../store/useStore'
import { Save, Download, Upload, Trash2, AlertTriangle, CheckCircle, Info, Database, Settings as SettingsIcon, RefreshCw, Wifi, WifiOff, Copy } from 'lucide-react'
import { SYNC_ENABLED } from '../lib/sync'

export default function Settings() {
  const {
    players, pairs, teams, tournaments, schedules, scoreRecords,
    liveMatches, matchCalls,
    appSettings, updateAppSettings, resetAllData, restoreBackup, resetSeasonStats,
  } = useStore()

  const [form, setForm] = useState({ ...appSettings })
  const [saved, setSaved] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [seasonConfirm, setSeasonConfirm] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleSave() {
    updateAppSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleBackup() {
    const data = {
      version: '3.7',
      exportedAt: new Date().toISOString(),
      appSettings, players, pairs, teams, tournaments, schedules, scoreRecords,
      liveMatches, matchCalls,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `탁구대회_백업_${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
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

  const stats = [
    { label: '선수', value: players.length, color: 'text-blue-600' },
    { label: '복식 페어', value: pairs.length, color: 'text-purple-600' },
    { label: '단체팀', value: teams.length, color: 'text-indigo-600' },
    { label: '대회', value: tournaments.length, color: 'text-green-600' },
    { label: '일정', value: schedules.length, color: 'text-orange-600' },
    { label: '점수 기록', value: scoreRecords.length, color: 'text-gray-600' },
    { label: '진행중', value: tournaments.filter(t => t.status === 'ongoing').length, color: 'text-red-600' },
    { label: '완료', value: tournaments.filter(t => t.status === 'completed').length, color: 'text-teal-600' },
  ]

  return (
    <div className="page-shell">
      <div className="page-header">
        <SettingsIcon size={17} className="text-gray-500" />
        <h1 className="text-base font-bold text-gray-800">시스템 설정</h1>
      </div>

      <div className="page-body overflow-y-auto">
        <div className="max-w-3xl space-y-4">

          {/* Data stats */}
          <section className="card">
            <div className="flex items-center gap-2 mb-3">
              <Database size={14} className="text-gray-500" />
              <h2 className="font-semibold text-gray-700 text-sm">데이터 현황</h2>
            </div>
            <div className="grid grid-cols-8 gap-2">
              {stats.map(s => (
                <div key={s.label} className="text-center p-2.5 bg-gray-50 rounded-lg">
                  <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* App settings */}
          <section className="card space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm">대회 기본 정보</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">주관 단체</label>
                <input className="input" placeholder="예: 서울특별시탁구협회" value={form.organizerName}
                  onChange={e => setForm(f => ({ ...f, organizerName: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">기본 경기장</label>
                <input className="input" placeholder="예: 서울 탁구경기장" value={form.venueName}
                  onChange={e => setForm(f => ({ ...f, venueName: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">시즌 연도</label>
                <input className="input" placeholder="예: 2026" value={form.season}
                  onChange={e => setForm(f => ({ ...f, season: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">연락처 전화</label>
                <input className="input" placeholder="예: 02-0000-0000" value={form.contactPhone}
                  onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 block mb-1">연락처 이메일</label>
                <input className="input" placeholder="예: contact@example.com" value={form.contactEmail}
                  onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} />
              </div>
            </div>
            <button onClick={handleSave} className="btn-primary flex items-center gap-1.5">
              {saved ? <><CheckCircle size={14} /> 저장됨!</> : <><Save size={14} /> 설정 저장</>}
            </button>
          </section>

          {/* Backup & restore */}
          <section className="card space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm">데이터 백업 / 복원</h2>
            {restoreMsg && (
              <div className={`flex items-center gap-2 p-2.5 rounded-lg text-sm ${restoreMsg.startsWith('오류') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {restoreMsg.startsWith('오류') ? <AlertTriangle size={13} /> : <CheckCircle size={13} />}
                {restoreMsg}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={handleBackup}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-sm transition-colors">
                <Download size={15} /> 백업 파일 다운로드
              </button>
              <label className="flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-green-200 bg-green-50 text-green-700 hover:bg-green-100 font-medium text-sm transition-colors cursor-pointer">
                <Upload size={15} /> 백업 파일로 복원
                <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleRestore} />
              </label>
            </div>
            <div className="flex items-start gap-1.5 text-xs text-gray-400 bg-gray-50 p-2.5 rounded-lg">
              <Info size={11} className="mt-0.5 flex-shrink-0" />
              백업 파일에는 선수 정보, 대회 결과, 랭킹 데이터가 포함됩니다. 중요 대회 전에 백업하세요.
            </div>
          </section>

          {/* Season reset */}
          <section className="card border-orange-100 space-y-2">
            <h2 className="font-semibold text-orange-600 text-sm flex items-center gap-2">
              <RefreshCw size={14} /> 시즌 초기화
            </h2>
            <p className="text-xs text-gray-600">선수 프로필·이름·소속은 유지하고 포인트·승패·Elo 레이팅만 초기화합니다. 새 시즌 시작 시 사용하세요.</p>
            {!seasonConfirm ? (
              <button onClick={() => setSeasonConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-orange-300 text-orange-600 hover:bg-orange-50 text-sm font-medium transition-colors">
                <RefreshCw size={13} /> 시즌 통계 초기화
              </button>
            ) : (
              <div className="bg-orange-50 rounded-lg p-3 space-y-2">
                <p className="text-sm font-semibold text-orange-700">포인트·승패·Elo를 모두 0/1000으로 초기화하시겠습니까?</p>
                <div className="flex gap-2">
                  <button onClick={() => { resetSeasonStats(); setSeasonConfirm(false); setRestoreMsg('시즌 통계가 초기화되었습니다.') }}
                    className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700">
                    네, 초기화합니다
                  </button>
                  <button onClick={() => setSeasonConfirm(false)}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300">
                    취소
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Reset */}
          <section className="card border-red-100 space-y-2">
            <h2 className="font-semibold text-red-600 text-sm flex items-center gap-2">
              <AlertTriangle size={14} /> 데이터 초기화
            </h2>
            <p className="text-xs text-gray-600">모든 선수, 대회, 일정, 점수 기록을 삭제합니다. 되돌릴 수 없습니다.</p>
            {!resetConfirm ? (
              <button onClick={() => setResetConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium transition-colors">
                <Trash2 size={13} /> 전체 데이터 초기화
              </button>
            ) : (
              <div className="bg-red-50 rounded-lg p-3 space-y-2">
                <p className="text-sm font-semibold text-red-700">정말로 모든 데이터를 삭제하시겠습니까?</p>
                <div className="flex gap-2">
                  <button onClick={() => { resetAllData(); setResetConfirm(false); setRestoreMsg('모든 데이터가 초기화되었습니다.') }}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                    네, 삭제합니다
                  </button>
                  <button onClick={() => setResetConfirm(false)}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300">
                    취소
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Supabase 실시간 동기화 */}
          <section className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                {SYNC_ENABLED
                  ? <><Wifi size={14} className="text-green-500" /> 실시간 동기화 <span className="text-xs text-green-600 font-normal">● 연결됨</span></>
                  : <><WifiOff size={14} className="text-gray-400" /> 실시간 동기화 <span className="text-xs text-gray-400 font-normal">미연결</span></>
                }
              </h2>
            </div>
            {SYNC_ENABLED ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                <CheckCircle size={14} />
                Supabase가 연결되어 대회 데이터가 여러 기기 간 실시간 동기화됩니다.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
                  <Info size={13} className="mt-0.5 flex-shrink-0" />
                  <span>Supabase를 연결하면 여러 기기에서 대회를 동시에 운영하고 관람객이 실시간 대진표를 볼 수 있습니다.</span>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2.5 text-xs">
                  <div className="font-semibold text-gray-700">① Supabase 프로젝트 생성</div>
                  <div className="text-gray-500 space-y-1">
                    <p>supabase.com → New Project → URL과 anon key 복사</p>
                  </div>
                  <div className="font-semibold text-gray-700">② SQL 에디터에서 테이블 생성</div>
                  <div className="relative">
                    <pre className="bg-gray-800 text-green-300 rounded p-2.5 overflow-x-auto text-[11px] leading-relaxed">{`CREATE TABLE pingpong_tournaments (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  session_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE pingpong_tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON pingpong_tournaments FOR SELECT USING (true);
CREATE POLICY "public write" ON pingpong_tournaments FOR ALL USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE pingpong_tournaments;`}</pre>
                    <button
                      onClick={() => navigator.clipboard?.writeText(`CREATE TABLE pingpong_tournaments (\n  id TEXT PRIMARY KEY,\n  data JSONB NOT NULL,\n  session_name TEXT,\n  updated_at TIMESTAMPTZ DEFAULT NOW()\n);\nALTER TABLE pingpong_tournaments ENABLE ROW LEVEL SECURITY;\nCREATE POLICY "public read" ON pingpong_tournaments FOR SELECT USING (true);\nCREATE POLICY "public write" ON pingpong_tournaments FOR ALL USING (true);\nALTER PUBLICATION supabase_realtime ADD TABLE pingpong_tournaments;`)}
                      className="absolute top-1.5 right-1.5 p-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
                      title="복사"
                    ><Copy size={11} /></button>
                  </div>
                  <div className="font-semibold text-gray-700">③ Cloudflare Pages 환경변수 설정</div>
                  <div className="text-gray-500 space-y-1">
                    <p>Cloudflare → Pages → Settings → Environment Variables</p>
                    <div className="bg-white border rounded p-2 font-mono space-y-0.5">
                      <div>VITE_SUPABASE_URL = <span className="text-blue-600">https://xxx.supabase.co</span></div>
                      <div>VITE_SUPABASE_ANON_KEY = <span className="text-blue-600">eyJh...</span></div>
                    </div>
                  </div>
                  <div className="font-semibold text-gray-700">④ 재배포 후 이 페이지에서 "● 연결됨" 확인</div>
                </div>
              </div>
            )}
          </section>

          {/* System info */}
          <section className="card text-xs text-gray-500 space-y-1">
            <h2 className="font-semibold text-gray-600 text-sm mb-2">시스템 정보</h2>
            <div className="grid grid-cols-2 gap-1">
              <span>버전</span><span className="text-gray-700">v3.9</span>
              <span>레이팅 시스템</span><span className="text-gray-700">USATT Elo</span>
              <span>대진 형식</span><span className="text-gray-700">토너먼트 / 리그 / 조별 / 시드예선 / 더블엘리미네이션</span>
              <span>지원 부문</span><span className="text-gray-700">초등·중등·고등·대학·일반·생활체육</span>
              <span>데이터 저장</span><span className="text-gray-700">브라우저 로컬스토리지</span>
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}

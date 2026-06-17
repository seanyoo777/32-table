// 리그전은 Tournament 페이지로 통합 (bracketFormat='리그' 선택)
// 이 파일은 독립 리그 생성 숏컷 페이지로 유지
import { useNavigate } from 'react-router-dom'
import { ClipboardList, ArrowRight } from 'lucide-react'
import { useStore } from '../store/useStore'

export default function LeaguePage() {
  const navigate = useNavigate()
  const { tournaments } = useStore()
  const leagueTournaments = tournaments.filter(t =>
    t.events.some(e => e.bracketFormat === '리그')
  )

  return (
    <div className="h-full overflow-y-auto px-6 py-5 space-y-4 bg-gray-50">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <ClipboardList size={20} className="text-green-500" /> 리그전
      </h1>

      <div className="card bg-blue-50 border-blue-200">
        <div className="flex items-start gap-4">
          <ClipboardList size={32} className="text-blue-500 flex-shrink-0 mt-1" />
          <div>
            <h2 className="font-semibold text-blue-800 mb-1">리그전은 대회 관리에서 생성합니다</h2>
            <p className="text-sm text-blue-600 mb-3">
              대회 생성 시 종목 설정에서 <strong>대진 방식 → 리그</strong>를 선택하면 라운드 로빈 방식으로 자동 생성됩니다.<br />
              같은 대회에 토너먼트 + 리그전을 동시에 운영할 수 있습니다.
            </p>
            <button onClick={() => navigate('/tournament')} className="btn-primary flex items-center gap-2">
              대회 관리로 이동 <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {leagueTournaments.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-700 mb-3">리그전이 포함된 대회</h2>
          <div className="space-y-3">
            {leagueTournaments.map(t => (
              <div key={t.id} className="card hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/tournament')}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{t.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{t.date}</p>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {t.events.filter(e => e.bracketFormat === '리그').map(e => (
                        <span key={e.id} className="badge bg-green-100 text-green-700 text-xs">{e.label}</span>
                      ))}
                    </div>
                  </div>
                  <ArrowRight size={16} className="text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

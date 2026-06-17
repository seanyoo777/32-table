import type { Tournament, TournamentEvent } from '../types'

interface PrintGroupSheetProps {
  tournament: Tournament
  event: TournamentEvent
  pMap: Record<string, { name: string; school: string; points: number; gender: string }>
}

export function PrintGroupSheet({ tournament, event, pMap }: PrintGroupSheetProps) {
  return (
    <div className="print-only p-8 bg-white">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <p className="text-gray-600">{tournament.date} · {tournament.venue}</p>
        <h2 className="text-xl font-semibold mt-2">{event.label} — 조 편성표</h2>
      </div>
      {event.groups.map((group) => (
        <div key={group.id} className="mb-6 border rounded p-4">
          <h3 className="font-bold text-lg mb-3">{group.name}</h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">번호</th>
                <th className="border p-2 text-left">이름</th>
                <th className="border p-2 text-left">소속</th>
                <th className="border p-2 text-center">승</th>
                <th className="border p-2 text-center">패</th>
                <th className="border p-2 text-center">포인트</th>
              </tr>
            </thead>
            <tbody>
              {group.participantIds.map((pid, i) => {
                const p = pMap[pid]
                return (
                  <tr key={pid} className="border-b">
                    <td className="border p-2">{i + 1}</td>
                    <td className="border p-2 font-medium">{p?.name ?? '?'}</td>
                    <td className="border p-2">{p?.school ?? ''}</td>
                    <td className="border p-2 text-center"></td>
                    <td className="border p-2 text-center"></td>
                    <td className="border p-2 text-center"></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

interface PrintBracketSheetProps {
  tournament: Tournament
  event: TournamentEvent
  pMap: Record<string, { name: string; school: string; points: number; gender: string }>
}

export function PrintBracketSheet({ tournament, event, pMap }: PrintBracketSheetProps) {
  const rounds = [...new Set(event.matches.map(m => m.round))].sort((a, b) => a - b)
  const maxRound = Math.max(...rounds)

  const getRoundLabel = (round: number) => {
    const fromEnd = maxRound - round
    if (fromEnd === 0) return '결승'
    if (fromEnd === 1) return '준결승'
    if (fromEnd === 2) return '8강'
    if (fromEnd === 3) return '16강'
    return `R${round}`
  }

  return (
    <div className="print-only p-6 bg-white">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <p className="text-gray-600">{tournament.date} · {tournament.venue}</p>
        <h2 className="text-xl font-semibold mt-2">{event.label} — 토너먼트 대진표</h2>
      </div>
      <div className="flex gap-4 overflow-x-auto">
        {rounds.map(round => (
          <div key={round} className="flex-shrink-0 min-w-36">
            <div className="text-center font-bold mb-3 bg-gray-100 py-1 rounded">{getRoundLabel(round)}</div>
            <div className="space-y-3">
              {event.matches.filter(m => m.round === round).map(match => {
                const p1 = match.participant1Id ? pMap[match.participant1Id] : null
                const p2 = match.participant2Id ? pMap[match.participant2Id] : null
                return (
                  <div key={match.id} className="border rounded p-2 text-sm">
                    <div className={`py-1 px-2 border-b ${match.result?.winnerId === match.participant1Id ? 'font-bold text-blue-700' : ''}`}>
                      {p1?.name ?? 'TBD'}
                    </div>
                    <div className={`py-1 px-2 ${match.result?.winnerId === match.participant2Id ? 'font-bold text-blue-700' : ''}`}>
                      {p2?.name ?? 'TBD'}
                    </div>
                    {match.result && (
                      <div className="text-xs text-gray-400 text-center mt-1">
                        {match.result.winnerScore}-{match.result.loserScore}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 border-t pt-4 flex gap-8 text-sm text-gray-600">
        <span>심판: _______________</span>
        <span>확인: _______________</span>
        <span>날짜: _______________</span>
      </div>
    </div>
  )
}

interface PrintMatchRecordProps {
  matchNo: string
  eventLabel: string
  tableNo: number
  p1Name: string
  p2Name: string
  sets: number
  pointsPerGame: number
}

export function PrintMatchRecord({ matchNo, eventLabel, tableNo, p1Name, p2Name, sets, pointsPerGame }: PrintMatchRecordProps) {
  const setArray = Array.from({ length: sets }, (_, i) => i + 1)
  return (
    <div className="print-only p-6 bg-white">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold">경기 기록지</h2>
        <div className="flex justify-center gap-6 mt-2 text-sm text-gray-600">
          <span>경기 번호: {matchNo}</span>
          <span>종목: {eventLabel}</span>
          <span>탁구대: {tableNo}번</span>
        </div>
      </div>
      <div className="flex gap-4 mb-6">
        <div className="flex-1 border-2 rounded p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">선수 A</div>
          <div className="font-bold text-lg">{p1Name}</div>
        </div>
        <div className="flex items-center font-bold text-xl text-gray-400">VS</div>
        <div className="flex-1 border-2 rounded p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">선수 B</div>
          <div className="font-bold text-lg">{p2Name}</div>
        </div>
      </div>
      <table className="w-full border-collapse text-sm mb-6">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">세트</th>
            <th className="border p-2">{p1Name} 점수</th>
            <th className="border p-2">{p2Name} 점수</th>
            <th className="border p-2">비고</th>
          </tr>
        </thead>
        <tbody>
          {setArray.map(s => (
            <tr key={s} className="border-b">
              <td className="border p-3 text-center font-medium">{s}세트</td>
              <td className="border p-3 text-center min-w-20"></td>
              <td className="border p-3 text-center min-w-20"></td>
              <td className="border p-3 min-w-24"></td>
            </tr>
          ))}
          <tr className="bg-gray-50 font-bold">
            <td className="border p-2 text-center">세트합계</td>
            <td className="border p-2 text-center"></td>
            <td className="border p-2 text-center"></td>
            <td className="border p-2"></td>
          </tr>
        </tbody>
      </table>
      <div className="text-xs text-gray-500 mb-4">{pointsPerGame}점제 · {sets}세트제</div>
      <div className="border-t pt-4 flex gap-8 text-sm text-gray-600">
        <span>심판: _______________</span>
        <span>서명: _______________</span>
        <span>날짜: _______________</span>
      </div>
    </div>
  )
}

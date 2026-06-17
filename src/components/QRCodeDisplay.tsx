import { QRCodeSVG } from 'qrcode.react'

interface Props {
  value: string
  size?: number
  label?: string
  sublabel?: string
  className?: string
}

export default function QRCodeDisplay({ value, size = 120, label, sublabel, className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div className="p-2 bg-white rounded-lg border border-gray-200 shadow-sm">
        <QRCodeSVG
          value={value}
          size={size}
          level="M"
          includeMargin={false}
          fgColor="#1e3a5f"
        />
      </div>
      {label && <p className="text-xs font-semibold text-gray-700 text-center">{label}</p>}
      {sublabel && <p className="text-[10px] text-gray-400 text-center">{sublabel}</p>}
    </div>
  )
}

// Player QR value encoder
export function playerQRValue(playerId: string): string {
  return `PINGPONG:PLAYER:${playerId}`
}

// Match QR value encoder
export function matchQRValue(tournamentId: string, eventId: string, matchId: string): string {
  return `PINGPONG:MATCH:${tournamentId}:${eventId}:${matchId}`
}

// Parse QR value
export function parseQR(value: string): { type: 'player' | 'match' | 'unknown'; payload: string[] } {
  const parts = value.split(':')
  if (parts[0] !== 'PINGPONG') return { type: 'unknown', payload: [] }
  if (parts[1] === 'PLAYER') return { type: 'player', payload: [parts[2]] }
  if (parts[1] === 'MATCH') return { type: 'match', payload: parts.slice(2) }
  return { type: 'unknown', payload: [] }
}

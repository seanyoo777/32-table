import { supabase, SYNC_ENABLED } from './supabase'
import type { Tournament } from '../types'

// ─── 단일 대회 업로드 ────────────────────────────────────
export async function uploadTournament(tournament: Tournament, sessionName?: string) {
  if (!SYNC_ENABLED || !supabase) return
  await supabase.from('pingpong_tournaments').upsert({
    id: tournament.id,
    data: tournament,
    session_name: sessionName ?? null,
  })
}

// ─── 단일 대회 다운로드 ──────────────────────────────────
export async function fetchTournament(id: string): Promise<Tournament | null> {
  if (!SYNC_ENABLED || !supabase) return null
  const { data } = await supabase
    .from('pingpong_tournaments')
    .select('data')
    .eq('id', id)
    .single()
  return data?.data ?? null
}

// ─── 모든 동기화된 대회 목록 ─────────────────────────────
export async function listSyncedTournaments(): Promise<{ id: string; session_name: string | null; updated_at: string }[]> {
  if (!SYNC_ENABLED || !supabase) return []
  const { data } = await supabase
    .from('pingpong_tournaments')
    .select('id, session_name, updated_at')
    .order('updated_at', { ascending: false })
    .limit(20)
  return data ?? []
}

// ─── Realtime 구독 ────────────────────────────────────────
export function subscribeTournament(
  tournamentId: string,
  onUpdate: (tournament: Tournament) => void
) {
  if (!SYNC_ENABLED || !supabase) return () => {}

  const channel = supabase
    .channel(`tournament:${tournamentId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'pingpong_tournaments',
        filter: `id=eq.${tournamentId}`,
      },
      (payload) => {
        const updated = payload.new as { data: Tournament }
        if (updated?.data) onUpdate(updated.data)
      }
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}

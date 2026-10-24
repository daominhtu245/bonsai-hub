import { api } from './api';
import type { DesignInput, StudioData } from './studio';

/** Cộng đồng, giữ chân, sổ cây (apps/api/bonsai_api/routers/community.py, passport.py). */

export interface Milestone { month: number; due: string; open_from: string; open_to: string; rewarded: boolean; photo_taken: boolean; credits: number }
export interface Reality { job_id: string; months: number; stage_code: string; predicted_url: string | null; real_url: string; real_taken_at: string; score: number | null }
export interface VoteSide { id: string; style_vi: string; image_url: string }
export interface VotePair { job_id: string; a: VoteSide; b: VoteSide }
export interface Skill { level: 'hoc_tro' | 'tho' | 'nghe_nhan'; level_vi: string; next_vi: string | null; progress: { key: string; label_vi: string; have: number; need: number }[] }
export type ChallengeState = 'upcoming' | 'open' | 'closed';
export interface ChallengeSummary { id: string; title: string; description: string | null; prize: string | null; starts_at: string; ends_at: string; state: ChallengeState; photo_url: string | null; entries: number }
export interface ChallengeEntry { id: number; image_url: string; author: string; votes: number | null; mine: boolean }
export interface ChallengeDetail extends Omit<ChallengeSummary, 'entries'> { my_vote: number | null; entries: ChallengeEntry[] }
export interface Passport { code: string; url: string; public: boolean; stolen: boolean; pending_transfer: string | null; transfer_expires_at: string | null }
export interface PublicPassport {
  code: string; nickname: string | null; species_vi: string | null; since: string; photo_url: string | null; owner: string | null;
  stolen: boolean; stolen_at: string | null; transfers: number;
  timeline: { kind: 'photo' | 'design'; at: string; url: string | null; style_vi?: string | null }[];
}

const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

export const communityApi = {
  milestones: (treeId: string) => api<Milestone[]>(`/trees/${treeId}/milestones`),
  reality: (treeId: string) => api<Reality | null>(`/trees/${treeId}/reality`),
  rateReality: (treeId: string, score: number) => api<void>(`/trees/${treeId}/reality`, { method: 'POST', json: { score } }),
  nextPair: () => api<VotePair | null>('/votes/next'),
  vote: (p: VotePair, winner: VoteSide, loser: VoteSide) =>
    api<void>('/votes', { method: 'POST', json: { job_id: p.job_id, winner_id: winner.id, loser_id: loser.id } }),
  skill: () => api<Skill>('/me/skill'),
  challenges: () => api<ChallengeSummary[]>('/challenges'),
  challenge: (id: string) => api<ChallengeDetail>(`/challenges/${id}`),
  challengeStudio: (id: string) => api<StudioData>(`/challenges/${id}/studio`),
  submitEntry: (id: string, body: DesignInput) => api<{ id: number; image_url: string }>(`/challenges/${id}/entry`, { method: 'POST', json: body }),
  voteEntry: (id: string, entryId: number) => api<void>(`/challenges/${id}/vote`, { method: 'POST', json: { entry_id: entryId } }),
  adminChallenges: () => api<(ChallengeSummary & { job_id: string })[]>('/admin/challenges'),
  createChallenge: (body: { title: string; description?: string; job_id: string; prize?: string; starts_at: string; ends_at: string }) =>
    api<{ id: string }>('/admin/challenges', { method: 'POST', json: body }),
  deleteChallenge: (id: string) => api<void>(`/admin/challenges/${id}`, { method: 'DELETE' }),
  openPassport: (treeId: string) => api<Passport>(`/trees/${treeId}/passport`, { method: 'POST' }),
  patchPassport: (treeId: string, patch: { public?: boolean; stolen?: boolean }) => api<Passport>(`/trees/${treeId}/passport`, { method: 'PATCH', json: patch }),
  startTransfer: (treeId: string) => api<Passport>(`/trees/${treeId}/transfer`, { method: 'POST' }),
  cancelTransfer: (treeId: string) => api<Passport>(`/trees/${treeId}/transfer`, { method: 'DELETE' }),
  acceptTransfer: (code: string) => api<{ tree_id: string }>('/transfers/accept', { method: 'POST', json: { code } }),
  publicPassport: (code: string) => api<PublicPassport>(`/public/passport/${code}`),
  qrUrl: (code: string) => `${BASE}/public/passport/${code}/qr.svg`,
};

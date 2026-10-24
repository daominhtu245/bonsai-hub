import { api } from './api';

/** Công cụ chăm cây (apps/api/bonsai_api/routers/tools.py) + giới thiệu bạn. */

export interface WireLine { branch: string; label_vi: string; diameter_mm: number; gauge_mm: number; length_cm: number }
export interface WirePlan { scale_known: boolean; lines: WireLine[]; shopping: [number, number][]; copper_note: string }
export interface GraftSpot { at_px: [number, number]; side: 'left' | 'right'; reason_vi: string }
export interface Price { low: number; high: number; basis: 'listings' | 'rules'; trunk_cm: number | null; comparables: number; note_vi: string }
export interface RescuePlan { cause_vi: string; now: string[]; day3: string[]; day7: string[]; see_expert: boolean; causes: string[] }
export interface Menh { year: number; can_chi: string; element: string; nap_am: string; good_elements: string[]; pot_colors: string[]; species: string[] }
export interface MaiStep { when: string; title_vi: string; detail_vi: string }
export interface MaiPlan { tet: string; region: string; defoliate_from: string; defoliate_to: string; steps: MaiStep[]; note_vi: string; province: string | null }
export interface Province { code: string; name: string; region: string }
export interface Referral { code: string; link: string; claimed: boolean; invited: number; rewarded: number; credits_each: number }

export const toolsApi = {
  wire: (jobId: string) => api<WirePlan>(`/tools/wire/${jobId}`),
  graft: (jobId: string) => api<{ spots: GraftSpot[]; season_vi: string | null }>(`/tools/graft/${jobId}`),
  price: (jobId: string) => api<Price | null>(`/tools/price/${jobId}`),
  rescueQuestions: () => api<{ key: string; text_vi: string }[]>('/tools/rescue/questions'),
  rescue: (answers: Record<string, boolean>) => api<RescuePlan>('/tools/rescue', { method: 'POST', json: { answers } }),
  menh: (year: number) => api<Menh>(`/tools/menh?year=${year}`),
  provinces: () => api<Province[]>('/tools/provinces'),
  maiTet: (province?: string | null) => api<MaiPlan>(`/tools/mai-tet${province ? `?province=${province}` : ''}`),
  referral: () => api<Referral>('/me/referral'),
  claimReferral: (code: string) => api<void>('/me/referral/claim', { method: 'POST', json: { code } }),
};

/** Lịch .ics cho các mốc (Mai kịp Tết…) — tạo ngay trên máy, mở bằng ứng dụng Lịch. */
export function icsFor(title: string, events: { date: string; title: string; detail: string }[]): string {
  const d = (iso: string) => iso.replace(/-/g, '');
  const esc = (s: string) => s.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const body = events.map((e, i) => [
    'BEGIN:VEVENT', `UID:${d(e.date)}-${i}@bonsai`, `DTSTAMP:${d(new Date().toISOString().slice(0, 10))}T000000Z`,
    `DTSTART;VALUE=DATE:${d(e.date)}`, `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.detail)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT12H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, 'END:VALARM', 'END:VEVENT',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bonsai AI//VI', `X-WR-CALNAME:${esc(title)}`, ...body, 'END:VCALENDAR'].join('\r\n');
}

import { api } from './api';

export type PotShape = 'rectangle' | 'oval' | 'round' | 'cascade_deep';
export type PotColor = 'unglazed_brown' | 'glazed_blue' | 'glazed_cream';
export type PotPosition = 'off_center_left' | 'center' | 'off_center_right';

export interface StudioBranch {
  id: string;
  start_px: [number, number];
  end_px: [number, number] | null;
  direction: 'left' | 'right' | 'back' | 'front' | 'up';
  thickness: 'thick' | 'medium' | 'thin';
  height_ratio: number;
}

export interface StudioTemplate {
  rank: number;
  style_key: string;
  removed: string[];
  apex: [number, number] | null;
  pads: number;
  silhouette: { width_px: number; height_px: number; pads: number } | null;
  pot: { shape: PotShape; color: string; position: PotPosition } | null;
}

export interface StudioData {
  species_key: string | null;
  photo_url: string;
  width: number;
  height: number;
  trunk: { base_point_px: [number, number]; apex_point_px: [number, number]; height_px: number; base_diameter_px: number };
  branches: StudioBranch[];
  candidate_apex_px: [number, number];
  first_branch_y_range_px: [number, number];
  styles: { key: string; name_vi: string; suggested: boolean }[];
  templates: StudioTemplate[];
  draft: DesignInput | null;
}

export interface DesignInput {
  style_key: string;
  removed: string[];
  new_branches: { at_px: [number, number]; direction: 'left' | 'right' | 'up' }[];
  pads: { center_px: [number, number]; rx: number; ry: number; rotation: number; kind?: string | null; flip?: boolean }[];
  apex: [number, number] | null;
  pot: { shape: PotShape; color: PotColor; position: PotPosition };
  pot_kind?: string | null;
  pot_width?: number | null;
  pot_x?: number | null;
  accents?: { kind: 'moss' | 'rock'; center_px: [number, number]; width: number; flip?: boolean }[];
}

/** Một chi tiết trong thư viện (apps/web/public/studio/manifest.json, tạo bởi tools/studio/generate_sprites.py). */
export interface Sprite {
  key: string;
  label_vi: string;
  category: 'pad' | 'apex' | 'pot' | 'accent';
  leaf?: 'ficus' | 'fine' | 'needle' | 'strap';
  species?: string[];
  file: string;
  aspect: number;
  pot_shape?: PotShape;
  pot_color?: PotColor;
  soil_y?: number;
}

export interface Preview {
  state: 'none' | 'running' | 'done' | 'failed';
  url: string | null;
  remaining: number;
}

export const studioApi = {
  get: (jobId: string) => api<StudioData>(`/jobs/${jobId}/studio`),
  library: async (): Promise<Sprite[]> => (await fetch('/studio/manifest.json')).json(),
  preview: (jobId: string) => api<Preview>(`/jobs/${jobId}/my-design/preview`),
  startPreview: (jobId: string) => api<Preview>(`/jobs/${jobId}/my-design/preview`, { method: 'POST' }),
  share: (jobId: string) => api<{ url: string; image_url: string }>(`/jobs/${jobId}/my-design/share`, { method: 'POST' }),
  save: (jobId: string, body: DesignInput) =>
    api<{ option_id: string; hints: string[]; sketch_svg_url: string }>(`/jobs/${jobId}/my-design`, { method: 'POST', json: body }),
};

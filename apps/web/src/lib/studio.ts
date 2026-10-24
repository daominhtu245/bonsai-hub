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
  pads: { center_px: [number, number]; rx: number; ry: number; rotation: number }[];
  apex: [number, number] | null;
  pot: { shape: PotShape; color: PotColor; position: PotPosition };
}

export const studioApi = {
  get: (jobId: string) => api<StudioData>(`/jobs/${jobId}/studio`),
  save: (jobId: string, body: DesignInput) =>
    api<{ option_id: string; hints: string[]; sketch_svg_url: string }>(`/jobs/${jobId}/my-design`, { method: 'POST', json: body }),
};

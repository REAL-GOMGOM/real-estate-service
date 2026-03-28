/** 학군 지도 관련 타입 */

export type SchoolType = 'elementary' | 'middle' | 'high';

export interface SchoolInfo {
  id: string;
  name: string;
  type: SchoolType;
  address: string;
  lat: number;
  lng: number;
  studentCount?: number;
  district?: string;
}

export const SCHOOL_TYPE_MAP: Record<SchoolType, { label: string; color: string; icon: string }> = {
  elementary: { label: '초등학교', color: '#22C55E', icon: '🟢' },
  middle:     { label: '중학교',   color: '#3B82F6', icon: '🔵' },
  high:       { label: '고등학교', color: '#F97316', icon: '🟠' },
};

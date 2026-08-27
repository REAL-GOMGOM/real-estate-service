export const FAVORITE_APARTMENTS_STORAGE_KEY = 'naezip.favorite-apartments.v1';
export const RECENT_APARTMENTS_STORAGE_KEY = 'naezip.recent-apartments.v1';
export const APARTMENT_RETENTION_CHANGED_EVENT = 'naezip:apartment-retention-changed';

const MAX_FAVORITES = 20;
const MAX_RECENT = 8;
const SNAPSHOT_SEPARATOR = '\u001f';

export interface RetainedApartment {
  id: string;
  name: string;
  district: string;
  dong: string | null;
  updatedAt: string;
}

export type RetainedApartmentInput = Omit<RetainedApartment, 'updatedAt'>;

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : null;
}

function normaliseApartment(value: unknown): RetainedApartment | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<RetainedApartment>;
  const id = cleanText(candidate.id, 120);
  const name = cleanText(candidate.name, 160);
  const district = cleanText(candidate.district, 80);
  const updatedAt = cleanText(candidate.updatedAt, 40);
  if (!id || !name || !district || !updatedAt || Number.isNaN(Date.parse(updatedAt))) return null;

  return {
    id,
    name,
    district,
    dong: cleanText(candidate.dong, 80),
    updatedAt,
  };
}

export function parseRetainedApartments(raw: string | null, limit = MAX_FAVORITES): RetainedApartment[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const unique = new Map<string, RetainedApartment>();
    for (const value of parsed) {
      const apartment = normaliseApartment(value);
      if (apartment && !unique.has(apartment.id)) unique.set(apartment.id, apartment);
      if (unique.size >= limit) break;
    }
    return [...unique.values()];
  } catch {
    return [];
  }
}

export function upsertRetainedApartment(
  apartments: RetainedApartment[],
  apartment: RetainedApartmentInput,
  updatedAt = new Date().toISOString(),
  limit = MAX_RECENT,
): RetainedApartment[] {
  const next = normaliseApartment({ ...apartment, updatedAt });
  if (!next) return apartments.slice(0, limit);
  return [next, ...apartments.filter((item) => item.id !== next.id)].slice(0, limit);
}

export function toggleRetainedFavorite(
  favorites: RetainedApartment[],
  apartment: RetainedApartmentInput,
  updatedAt = new Date().toISOString(),
): { favorites: RetainedApartment[]; isFavorite: boolean } {
  const exists = favorites.some((item) => item.id === apartment.id);
  if (exists) {
    return {
      favorites: favorites.filter((item) => item.id !== apartment.id),
      isFavorite: false,
    };
  }
  return {
    favorites: upsertRetainedApartment(favorites, apartment, updatedAt, MAX_FAVORITES),
    isFavorite: true,
  };
}

function getStorageItem(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeApartments(key: string, apartments: RetainedApartment[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(apartments));
    window.dispatchEvent(new CustomEvent(APARTMENT_RETENTION_CHANGED_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function getApartmentRetentionSnapshot(): string {
  return `${getStorageItem(FAVORITE_APARTMENTS_STORAGE_KEY)}${SNAPSHOT_SEPARATOR}${getStorageItem(RECENT_APARTMENTS_STORAGE_KEY)}`;
}

export function decodeApartmentRetentionSnapshot(snapshot: string): {
  favorites: RetainedApartment[];
  recent: RetainedApartment[];
} {
  const [favorites = '', recent = ''] = snapshot.split(SNAPSHOT_SEPARATOR, 2);
  return {
    favorites: parseRetainedApartments(favorites, MAX_FAVORITES),
    recent: parseRetainedApartments(recent, MAX_RECENT),
  };
}

export function subscribeApartmentRetention(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(APARTMENT_RETENTION_CHANGED_EVENT, onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(APARTMENT_RETENTION_CHANGED_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

export function rememberApartment(apartment: RetainedApartmentInput, updatedAt?: string): boolean {
  const recent = parseRetainedApartments(getStorageItem(RECENT_APARTMENTS_STORAGE_KEY), MAX_RECENT);
  return writeApartments(
    RECENT_APARTMENTS_STORAGE_KEY,
    upsertRetainedApartment(recent, apartment, updatedAt, MAX_RECENT),
  );
}

export function toggleFavoriteApartment(
  apartment: RetainedApartmentInput,
  updatedAt?: string,
): { persisted: boolean; isFavorite: boolean } {
  const favorites = parseRetainedApartments(getStorageItem(FAVORITE_APARTMENTS_STORAGE_KEY), MAX_FAVORITES);
  const next = toggleRetainedFavorite(favorites, apartment, updatedAt);
  return {
    persisted: writeApartments(FAVORITE_APARTMENTS_STORAGE_KEY, next.favorites),
    isFavorite: next.isFavorite,
  };
}

'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { findDistrictByLawdCd } from '@/lib/district-codes';
import {
  AptAutocomplete,
  type ApartmentSearchResult,
} from './AptAutocomplete';

export default function HomeApartmentSearch() {
  const router = useRouter();

  const apartmentHref = useCallback((apartment: ApartmentSearchResult) => {
    const district =
      findDistrictByLawdCd(apartment.lawdCd) ?? apartment.sigungu;
    const params = new URLSearchParams({
      district,
      q: apartment.name,
      aptId: apartment.id,
    });
    if (apartment.dong) params.set('aptDong', apartment.dong);
    return `/transactions?${params.toString()}`;
  }, []);

  const selectApartment = useCallback((apartment: ApartmentSearchResult) => {
    router.push(apartmentHref(apartment));
  }, [apartmentHref, router]);

  const prefetchApartment = useCallback((apartment: ApartmentSearchResult) => {
    router.prefetch(apartmentHref(apartment));
  }, [apartmentHref, router]);

  return (
    <div
      className="nz-searchform"
      role="search"
      style={{ padding: 0, border: 0, background: 'transparent' }}
    >
      <AptAutocomplete
        ariaLabel="단지명 검색"
        placeholder="단지명 검색 (예: 잠실엘스)"
        onInputIntent={() => router.prefetch('/transactions')}
        onResultIntent={prefetchApartment}
        onSelect={selectApartment}
      />
    </div>
  );
}

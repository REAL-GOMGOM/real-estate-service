'use client';

import { useRouter } from 'next/navigation';
import { findDistrictByLawdCd } from '@/lib/district-codes';
import {
  AptAutocomplete,
  type ApartmentSearchResult,
} from './AptAutocomplete';

export default function HomeApartmentSearch() {
  const router = useRouter();

  function selectApartment(apartment: ApartmentSearchResult) {
    const district =
      findDistrictByLawdCd(apartment.lawdCd) ?? apartment.sigungu;
    const params = new URLSearchParams({
      district,
      q: apartment.name,
      aptId: apartment.id,
    });
    if (apartment.dong) params.set('aptDong', apartment.dong);
    router.push(`/transactions?${params.toString()}`);
  }

  return (
    <div
      className="nz-searchform"
      role="search"
      style={{ padding: 0, border: 0, background: 'transparent' }}
    >
      <AptAutocomplete
        ariaLabel="단지명 검색"
        placeholder="단지명 검색 (예: 잠실엘스)"
        onSelect={selectApartment}
      />
    </div>
  );
}

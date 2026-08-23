import { createHash } from 'node:crypto';

import type {
  PublicRentTransaction,
  PublicPresaleTransaction,
  PublicSaleTransaction,
  PublicTransactionRecord,
  PublicTransactionSnapshot,
} from './contract';
import {
  PUBLIC_TRANSACTION_SNAPSHOT_SCHEMA,
  assertPublicTransactionSnapshot,
} from './contract';

/** Only fields intentionally selected from the local sale ledger. */
export interface PublicSaleSourceRow {
  dedupeKey: string;
  masterId: string | null;
  aptName: string;
  sigungu: string;
  umdNm: string;
  areaM2: number;
  floor: number | null;
  dealAmount: number;
  dealDate: string;
  buildYear: number | null;
  isCanceled: boolean;
}

/** Only fields intentionally selected from the local rent ledger. */
export interface PublicRentSourceRow {
  dedupeKey: string;
  masterId?: string | null;
  aptName: string;
  sigungu: string;
  umdNm: string;
  areaM2: number;
  floor: number | null;
  dealDate: string;
  deposit: number;
  monthlyRent: number;
  buildYear: number | null;
  contractType: string | null;
  prevDeposit: number | null;
  prevMonthlyRent: number | null;
}

/** Only fields intentionally selected from the local presale-rights ledger. */
export interface PublicPresaleSourceRow {
  dedupeKey: string;
  masterId?: string | null;
  aptName: string;
  sigungu: string;
  umdNm: string;
  areaM2: number;
  floor: number | null;
  dealAmount: number;
  dealDate: string;
  buildYear: number | null;
  isCanceled: boolean;
}

function opaquePublicId(kind: 'sale' | 'rent' | 'presale', dedupeKey: string): string {
  return createHash('sha256').update(`${kind}:${dedupeKey}`, 'utf8').digest('hex').slice(0, 24);
}

/** MOLIT rows with an unknown contract day use 00; publish that truth as YYYY-MM. */
export function normalizePublicDealDate(value: string): string {
  return /^\d{4}-\d{2}-00$/.test(value) ? value.slice(0, 7) : value;
}

export function toPublicSaleTransaction(row: PublicSaleSourceRow): PublicSaleTransaction {
  return {
    id: opaquePublicId('sale', row.dedupeKey),
    kind: 'sale',
    apartmentId: row.masterId,
    aptName: row.aptName,
    district: row.sigungu,
    dong: row.umdNm,
    areaM2: row.areaM2,
    floor: row.floor,
    amountManwon: row.dealAmount,
    dealDate: normalizePublicDealDate(row.dealDate),
    buildYear: row.buildYear,
    canceled: row.isCanceled,
  };
}

function normalizeContractType(value: string | null): PublicRentTransaction['contractType'] {
  if (value === '신규' || value?.toLowerCase() === 'new') return 'new';
  if (value === '갱신' || value?.toLowerCase() === 'renewal') return 'renewal';
  return null;
}

export function toPublicRentTransaction(row: PublicRentSourceRow): PublicRentTransaction {
  return {
    id: opaquePublicId('rent', row.dedupeKey),
    kind: 'rent',
    apartmentId: row.masterId ?? null,
    aptName: row.aptName,
    district: row.sigungu,
    dong: row.umdNm,
    areaM2: row.areaM2,
    floor: row.floor,
    depositManwon: row.deposit,
    monthlyRentManwon: row.monthlyRent,
    dealDate: normalizePublicDealDate(row.dealDate),
    buildYear: row.buildYear,
    contractType: normalizeContractType(row.contractType),
    previousDepositManwon: row.prevDeposit,
    previousMonthlyRentManwon: row.prevMonthlyRent,
  };
}

export function toPublicPresaleTransaction(row: PublicPresaleSourceRow): PublicPresaleTransaction {
  return {
    id: opaquePublicId('presale', row.dedupeKey),
    kind: 'presale',
    apartmentId: row.masterId ?? null,
    aptName: row.aptName,
    district: row.sigungu,
    dong: row.umdNm,
    areaM2: row.areaM2,
    floor: row.floor,
    amountManwon: row.dealAmount,
    dealDate: normalizePublicDealDate(row.dealDate),
    buildYear: row.buildYear,
    canceled: row.isCanceled,
  };
}

function compareRecords(a: PublicTransactionRecord, b: PublicTransactionRecord): number {
  const comparableDate = (value: string) => value.length === 7 ? `${value}-31` : value;
  return comparableDate(a.dealDate).localeCompare(comparableDate(b.dealDate))
    || a.kind.localeCompare(b.kind)
    || a.dong.localeCompare(b.dong, 'ko')
    || a.aptName.localeCompare(b.aptName, 'ko')
    || a.areaM2 - b.areaM2
    || (a.floor ?? -999) - (b.floor ?? -999)
    || a.id.localeCompare(b.id);
}

export function createPublicTransactionSnapshot(input: {
  lawdCd: string;
  district: string;
  period: { from: string; through: string };
  generatedAt: string;
  records: readonly PublicTransactionRecord[];
}): PublicTransactionSnapshot {
  const snapshot: PublicTransactionSnapshot = {
    schema: PUBLIC_TRANSACTION_SNAPSHOT_SCHEMA,
    generatedAt: input.generatedAt,
    partition: { lawdCd: input.lawdCd, district: input.district },
    period: { ...input.period },
    recordCount: input.records.length,
    records: [...input.records].sort(compareRecords),
  };
  assertPublicTransactionSnapshot(snapshot);
  return snapshot;
}

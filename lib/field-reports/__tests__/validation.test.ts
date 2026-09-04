import { describe, expect, it } from 'vitest';
import { isFlagReason, kstDate, parseFieldReportForm } from '../validation';

const now = new Date('2026-08-31T13:00:00Z');
function form(overrides: Record<string, string> = {}, mode: 'new' | 'legacy' = 'new') {
  const data = new FormData();
  const units = mode === 'new' ? { areaPyeong: '25.7', priceEok: '8.3' } : { area: '84.95', price: '83000' };
  Object.entries({ apartmentId: 'test-apt', ...units, tradeType: 'sale', contractDate: '2026-08-30', source: 'anonymous', consent: 'on', confirmContracted: 'on', website: '', ...overrides }).forEach(([key, value]) => data.set(key, value));
  return data;
}
describe('field report validation', () => {
  it('converts the new 평·억원 form into the existing ㎡·만원 storage contract', () => {
    expect(parseFieldReportForm(form(), now)).toEqual({ apartmentId: 'test-apt', area: 84.96, tradeType: 'sale', price: 83000, monthlyRent: null, contractDate: '2026-08-30', source: 'anonymous' });
  });
  it('keeps accepting a complete legacy ㎡·만원 form during deployment transition', () => {
    expect(parseFieldReportForm(form({ source: 'participant' }, 'legacy'), now)).toEqual({ apartmentId: 'test-apt', area: 84.95, tradeType: 'sale', price: 83000, monthlyRent: null, contractDate: '2026-08-30', source: 'participant' });
  });
  const invalidInputs: Array<Record<string, string>> = [
    { areaPyeong: '25abc' }, { areaPyeong: 'NaN' }, { areaPyeong: '25.75' }, { areaPyeong: '3' }, { areaPyeong: '151.3' },
    { priceEok: '8e1' }, { priceEok: '-1' }, { priceEok: '0' }, { priceEok: '500.01' }, { priceEok: '8.301' },
    { tradeType: 'asking' }, { source: 'verified-agent' }, { apartmentId: '' },
    { contractDate: '2026-09-01' }, { contractDate: '2026-02-30' }, { contractDate: '2025-08-30' },
    { consent: '' }, { confirmContracted: '' }, { website: 'bot.example' },
    { name: 'private name' }, { phone: '010-1234-5678' }, { monthlyRent: '100' },
  ];
  it.each(invalidInputs)('rejects invalid/extra fields %j', (input) => {
    expect(parseFieldReportForm(form(input), now)).toHaveProperty('error');
  });
  it('requires rent and accepts a zero monthly deposit', () => {
    expect(parseFieldReportForm(form({ tradeType: 'monthly', priceEok: '0', monthlyRent: '100' }), now)).toMatchObject({ price: 0, monthlyRent: 100 });
    expect(parseFieldReportForm(form({ tradeType: 'monthly' }), now)).toHaveProperty('error');
  });
  it.each(['participant', 'agent', 'neighbor', 'anonymous', 'field_news'])('accepts the supported source %s', (source) => {
    expect(parseFieldReportForm(form({ source }), now)).not.toHaveProperty('error');
  });
  it('rejects mixed, partial, and duplicated unit schemas', () => {
    const mixed = form(); mixed.set('area', '84.95'); mixed.set('price', '83000');
    expect(parseFieldReportForm(mixed, now)).toHaveProperty('error');
    const partial = form(); partial.delete('priceEok');
    expect(parseFieldReportForm(partial, now)).toHaveProperty('error');
    const mixedPair = form(); mixedPair.delete('priceEok'); mixedPair.set('price', '83000');
    expect(parseFieldReportForm(mixedPair, now)).toHaveProperty('error');
  });
  it('rejects repeated application fields and documents', () => {
    const duplicate = form(); duplicate.append('priceEok', '1.23');
    expect(parseFieldReportForm(duplicate, now)).toHaveProperty('error');
    const upload = form(); upload.set('areaPyeong', new Blob(['private document']));
    expect(parseFieldReportForm(upload, now)).toHaveProperty('error');
  });
  it('uses the Korean day at UTC day boundaries', () => {
    expect(kstDate(new Date('2026-08-31T15:01:00Z'))).toBe('2026-09-01');
    expect(parseFieldReportForm(form({ contractDate: '2026-09-01' }), new Date('2026-08-31T15:01:00Z'))).not.toHaveProperty('error');
  });
  it('only supports enumerated flag reasons', () => {
    expect(isFlagReason('duplicate')).toBe(true);
    expect(isFlagReason('my phone number')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { isFlagReason, kstDate, parseFieldReportForm } from '../validation';

const now = new Date('2026-08-31T13:00:00Z');
function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({ apartmentId: 'test-apt', area: '84.95', tradeType: 'sale', price: '83000', contractDate: '2026-08-30', source: 'participant', consent: 'on', confirmContracted: 'on', website: '', ...overrides }).forEach(([key, value]) => data.set(key, value));
  return data;
}
describe('field report validation', () => {
  it('accepts only a small typed contract report in 만원', () => {
    expect(parseFieldReportForm(form(), now)).toEqual({ apartmentId: 'test-apt', area: 84.95, tradeType: 'sale', price: 83000, monthlyRent: null, contractDate: '2026-08-30', source: 'participant' });
  });
  const invalidInputs: Array<Record<string, string>> = [
    { area: '84abc' }, { area: 'NaN' }, { area: '84.999' }, { area: '9' }, { area: '501' },
    { price: '8e4' }, { price: '-1' }, { price: '0' }, { price: '5000001' }, { price: '83000.1' },
    { tradeType: 'asking' }, { source: 'verified-agent' }, { apartmentId: '' },
    { contractDate: '2026-09-01' }, { contractDate: '2026-02-30' }, { contractDate: '2025-08-30' },
    { consent: '' }, { confirmContracted: '' }, { website: 'bot.example' },
    { name: 'private name' }, { phone: '010-1234-5678' }, { monthlyRent: '100' },
  ];
  it.each(invalidInputs)('rejects invalid/extra fields %j', (input) => {
    expect(parseFieldReportForm(form(input), now)).toHaveProperty('error');
  });
  it('requires rent and accepts a zero monthly deposit', () => {
    expect(parseFieldReportForm(form({ tradeType: 'monthly', price: '0', monthlyRent: '100' }), now)).toHaveProperty('monthlyRent', 100);
    expect(parseFieldReportForm(form({ tradeType: 'monthly' }), now)).toHaveProperty('error');
  });
  it('rejects repeated application fields and documents', () => {
    const duplicate = form(); duplicate.append('price', '123');
    expect(parseFieldReportForm(duplicate, now)).toHaveProperty('error');
    const upload = form(); upload.set('area', new Blob(['private document']));
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

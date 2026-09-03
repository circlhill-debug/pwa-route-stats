import { describe, expect, it } from 'vitest';
import { getEffectiveEvaluationHourly, getEvaluationPayAllocation } from '../src/modules/evaluationPay.js';

describe('evaluation pay allocation', () => {
  it('allocates half of annual pay to a six-month Fall evaluation', () => {
    const profile = {
      annualSalary: 63000,
      effectiveFrom: '2025-10-01',
      effectiveTo: '2026-03-31'
    };
    const allocation = getEvaluationPayAllocation(profile);
    expect(allocation.calendarMonths).toBe(6);
    expect(allocation.evaluationPay).toBe(31500);
    expect(getEffectiveEvaluationHourly(profile, 860.9)).toBeCloseTo(36.5896, 3);
  });

  it('treats a first-of-month end as the next evaluation boundary', () => {
    const profile = {
      annualSalary: 63000,
      effectiveFrom: '2026-04-01',
      effectiveTo: '2026-10-01'
    };
    expect(getEvaluationPayAllocation(profile)).toMatchObject({
      calendarMonths: 6,
      evaluationPay: 31500
    });
  });
});

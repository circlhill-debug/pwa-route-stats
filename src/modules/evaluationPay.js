function parseIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function getEvaluationPayAllocation(profile) {
  const annualPay = Number(profile?.annualSalary);
  if (!Number.isFinite(annualPay) || annualPay <= 0) return null;

  const from = parseIsoDate(profile?.effectiveFrom);
  const to = parseIsoDate(profile?.effectiveTo);
  // Evaluation profiles are six-month terms. Keep older undated profiles usable.
  if (!from || !to) return { annualPay, calendarMonths: 6, payShare: 0.5, evaluationPay: annualPay / 2 };

  // A first-of-month end is the next evaluation boundary, so assign it to the prior month.
  let endYear = to.year;
  let endMonth = to.month;
  if (to.day === 1) {
    endMonth -= 1;
    if (endMonth === 0) {
      endMonth = 12;
      endYear -= 1;
    }
  }
  const calendarMonths = (endYear - from.year) * 12 + (endMonth - from.month) + 1;
  if (!Number.isFinite(calendarMonths) || calendarMonths <= 0) return null;
  const payShare = calendarMonths / 12;
  return { annualPay, calendarMonths, payShare, evaluationPay: annualPay * payShare };
}

export function getEffectiveEvaluationHourly(profile, loggedHours) {
  const allocation = getEvaluationPayAllocation(profile);
  const hours = Number(loggedHours);
  if (!allocation || !Number.isFinite(hours) || hours <= 0) return null;
  return allocation.evaluationPay / hours;
}

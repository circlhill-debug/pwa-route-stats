export function getEvaluationPayAllocation(profile) {
  const annualPay = Number(profile?.annualSalary);
  if (!Number.isFinite(annualPay) || annualPay <= 0) return null;
  // USPS evaluation terms are fixed six-month pay periods; date boundaries only scope data.
  return { annualPay, calendarMonths: 6, payShare: 0.5, evaluationPay: annualPay / 2 };
}

export function getEffectiveEvaluationHourly(profile, loggedHours) {
  const allocation = getEvaluationPayAllocation(profile);
  const hours = Number(loggedHours);
  if (!allocation || !Number.isFinite(hours) || hours <= 0) return null;
  return allocation.evaluationPay / hours;
}

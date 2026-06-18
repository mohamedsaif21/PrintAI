/** Safe numeric + timestamp helpers used across scheduling, SLA, and progress UI. */

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return fallback;
  }
  return numerator / denominator;
}

/** Parse ISO/string/Date to ms; returns null for invalid input. */
export function toTimestamp(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** SLA diff in minutes: positive = finish before deadline (buffer), negative = late. */
export function computeSlaDiffMinutes(
  deadline: string | Date | null | undefined,
  overallFinish: string | Date | null | undefined,
): number {
  const deadlineMs = toTimestamp(deadline);
  const finishMs = toTimestamp(overallFinish);
  if (deadlineMs === null || finishMs === null) return 0;
  return Math.round((deadlineMs - finishMs) / 60_000);
}

export function computeSlaStatus(
  deadline: string | Date | null | undefined,
  overallFinish: string | Date | null | undefined,
): { slaStatus: "SAFE" | "RISK"; slaDiff: number } {
  const slaDiff = computeSlaDiffMinutes(deadline, overallFinish);
  return { slaStatus: slaDiff >= 0 ? "SAFE" : "RISK", slaDiff };
}

export function maxTimestamp(...values: (string | Date | null | undefined)[]): number | null {
  const timestamps = values.map(toTimestamp).filter((t): t is number => t !== null);
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
}

/**
 * Split totalQty across weights; last slot absorbs rounding remainder
 * so shares always sum exactly to totalQty.
 */
export function distributeQuantity(totalQty: number, weights: number[]): number[] {
  const safeTotal = Math.max(0, Math.floor(totalQty));
  if (weights.length === 0) return [];
  if (safeTotal === 0) return weights.map(() => 0);

  const totalWeight = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (totalWeight <= 0) {
    const base = Math.floor(safeTotal / weights.length);
    const shares = weights.map(() => base);
    shares[shares.length - 1] += safeTotal - shares.reduce((sum, value) => sum + value, 0);
    return shares;
  }

  let remaining = safeTotal;
  return weights.map((weight, index) => {
    const isLast = index === weights.length - 1;
    if (isLast) return remaining;
    const share = Math.round((Math.max(0, weight) / totalWeight) * safeTotal);
    remaining -= share;
    return share;
  });
}

export function clampProgress(
  completed: number,
  total: number,
): { completed: number; total: number; percent: number } {
  const safeTotal = Math.max(0, total);
  const safeCompleted = clamp(completed, 0, safeTotal > 0 ? safeTotal : Math.max(0, completed));
  const percent =
    safeTotal === 0
      ? safeCompleted > 0
        ? 100
        : 0
      : clamp(Math.round(safeDivide(safeCompleted, safeTotal, 0) * 100), 0, 100);
  return { completed: safeCompleted, total: safeTotal, percent };
}

export function safeFactoryHours(qty: number, speed: number): number {
  const safeQty = Math.max(0, qty);
  const safeSpeed = Math.max(1, speed);
  return safeQty / safeSpeed;
}

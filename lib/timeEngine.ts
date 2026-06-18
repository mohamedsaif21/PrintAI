// ─────────────────────────────────────────────────────────────────────────
// Time compression engine
// Maps "factory time" (the hours a job would really take, e.g. 4 hrs)
// onto compressed "real time" so the demo finishes live.
//
// Rule requested: 4 factory hours  ==  2 real minutes
// => 1 factory hour  ==  30 real seconds
// => COMPRESSION_RATIO = 3600 sec (factory) / 30 sec (real) = 120
// ─────────────────────────────────────────────────────────────────────────

export const FACTORY_HOURS_PER_DEMO_UNIT = 4;
export const REAL_MINUTES_PER_DEMO_UNIT = 2;

// 1 factory hour = REAL_MINUTES_PER_DEMO_UNIT*60 / FACTORY_HOURS_PER_DEMO_UNIT real seconds
export const REAL_SECONDS_PER_FACTORY_HOUR =
  (REAL_MINUTES_PER_DEMO_UNIT * 60) / FACTORY_HOURS_PER_DEMO_UNIT; // = 30

/** Convert a factory-time duration (in hours) into real milliseconds for the demo clock. */
export function factoryHoursToRealMs(factoryHours: number): number {
  const safeHours = Math.max(0, factoryHours);
  if (!Number.isFinite(safeHours)) return 0;
  return safeHours * REAL_SECONDS_PER_FACTORY_HOUR * 1000;
}

/** Convert real elapsed milliseconds back into factory hours (for progress displays). */
export function realMsToFactoryHours(realMs: number): number {
  return realMs / (REAL_SECONDS_PER_FACTORY_HOUR * 1000);
}

/** Given a job start time and its factory-hour duration, compute the real wall-clock finish time. */
export function computeRealFinish(startedAt: Date, factoryHours: number): Date {
  return new Date(startedAt.getTime() + factoryHoursToRealMs(factoryHours));
}

/** Progress percentage (0-100) of a running job, based on real elapsed time vs total real duration. */
export function jobProgressPercent(startedAt: string, realFinishAt: string): number {
  const start = new Date(startedAt).getTime();
  const finish = new Date(realFinishAt).getTime();
  const now = Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(finish)) return 0;
  if (finish <= start) return now >= finish ? 100 : 0;
  if (now >= finish) return 100;
  if (now <= start) return 0;
  return Math.round(((now - start) / (finish - start)) * 100);
}

export function isJobFinished(realFinishAt: string): boolean {
  return Date.now() >= new Date(realFinishAt).getTime();
}

/**
 * Given a running job's start time and its real finish time, compute how many
 * factory-hours of work REMAIN right now. Used when pausing a job so the
 * remaining duration is captured precisely and the job can resume later
 * without losing or gaining progress.
 */
export function remainingFactoryHours(startedAt: string, realFinishAt: string): number {
  const remainingRealMs = Math.max(0, new Date(realFinishAt).getTime() - Date.now());
  return realMsToFactoryHours(remainingRealMs);
}
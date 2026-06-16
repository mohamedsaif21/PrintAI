export const FACTORY_HOURS_PER_DEMO_UNIT = 4;
export const REAL_MINUTES_PER_DEMO_UNIT = 2;
export const REAL_SECONDS_PER_FACTORY_HOUR =
  (REAL_MINUTES_PER_DEMO_UNIT * 60) / FACTORY_HOURS_PER_DEMO_UNIT;

export function factoryHoursToRealMs(factoryHours: number): number {
  return factoryHours * REAL_SECONDS_PER_FACTORY_HOUR * 1000;
}

export function realMsToFactoryHours(realMs: number): number {
  return realMs / (REAL_SECONDS_PER_FACTORY_HOUR * 1000);
}

export function computeRealFinish(startedAt: Date, factoryHours: number): Date {
  return new Date(startedAt.getTime() + factoryHoursToRealMs(factoryHours));
}

export function jobProgressPercent(startedAt: string, realFinishAt: string): number {
  const start = new Date(startedAt).getTime();
  const finish = new Date(realFinishAt).getTime();
  const now = Date.now();
  if (now >= finish) return 100;
  if (now <= start) return 0;
  return Math.round(((now - start) / (finish - start)) * 100);
}

export function isJobFinished(realFinishAt: string): boolean {
  return Date.now() >= new Date(realFinishAt).getTime();
}

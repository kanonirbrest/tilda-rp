/**
 * В development подменяет DATABASE_URL на PRODUCTION_DATABASE_URL,
 * если задан (данные Render / прода на localhost для админки и API).
 */
export function applyDevelopmentProductionDatabaseUrl(): void {
  if (process.env.NODE_ENV !== "development") return;
  const prod = process.env.PRODUCTION_DATABASE_URL?.trim();
  if (!prod) return;
  process.env.DATABASE_URL = prod;
}

export function usesProductionDatabaseInDevelopment(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    Boolean(process.env.PRODUCTION_DATABASE_URL?.trim())
  );
}

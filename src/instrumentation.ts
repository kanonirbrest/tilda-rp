/**
 * Instrumentation hook Next.js (см. https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation).
 * Оставлен минимальный `register`, чтобы dev/production не падали, если файл ожидается кэшем или конфигом.
 */
export async function register(): Promise<void> {
  // Например: OpenTelemetry, Sentry server init — по мере необходимости.
}

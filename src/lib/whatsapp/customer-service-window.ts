export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Only a customer message opens or renews the free-form messaging window. */
export function customerServiceWindow(
  lastInboundAt: string | null | undefined,
  now = Date.now(),
) {
  const timestamp = lastInboundAt ? Date.parse(lastInboundAt) : NaN;
  const remainingMs = Number.isFinite(timestamp) && timestamp <= now
    ? Math.max(0, timestamp + CUSTOMER_SERVICE_WINDOW_MS - now)
    : 0;
  return { expired: remainingMs === 0, remainingMs };
}

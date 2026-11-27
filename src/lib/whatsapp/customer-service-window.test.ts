import { describe, expect, it } from 'vitest';
import { customerServiceWindow, CUSTOMER_SERVICE_WINDOW_MS } from './customer-service-window';

const NOW = Date.parse('2026-11-27T17:00:00Z');

describe('customer service window', () => {
  it.each([null, undefined, '', 'invalid', new Date(NOW + 1000).toISOString()])(
    'keeps free-form messaging closed without a valid past inbound timestamp (%s)',
    (timestamp) => {
      expect(customerServiceWindow(timestamp, NOW)).toEqual({ expired: true, remainingMs: 0 });
    },
  );

  it('closes exactly 24 hours after the last customer message', () => {
    const timestamp = new Date(NOW - CUSTOMER_SERVICE_WINDOW_MS).toISOString();
    expect(customerServiceWindow(timestamp, NOW - 1)).toEqual({ expired: false, remainingMs: 1 });
    expect(customerServiceWindow(timestamp, NOW)).toEqual({ expired: true, remainingMs: 0 });
    expect(customerServiceWindow(timestamp, NOW + 1)).toEqual({ expired: true, remainingMs: 0 });
  });

  it('opens a fresh window when the customer replies', () => {
    expect(customerServiceWindow(new Date(NOW).toISOString(), NOW)).toEqual({
      expired: false, remainingMs: CUSTOMER_SERVICE_WINDOW_MS,
    });
  });
});

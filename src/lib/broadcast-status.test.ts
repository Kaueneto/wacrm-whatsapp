import { describe, expect, it } from "vitest";
import {
  RECIPIENT_STATUSES,
  allowedPredecessors,
  broadcastStatusConfig,
  getBroadcastStatus,
  getRecipientStatus,
  isValidRecipientTransition,
  recipientStatusConfig,
} from "./broadcast-status";

describe("getBroadcastStatus", () => {
  it("returns the matching config for known statuses", () => {
    expect(getBroadcastStatus("sending")).toBe(broadcastStatusConfig.sending);
    expect(getBroadcastStatus("sent")).toBe(broadcastStatusConfig.sent);
    expect(getBroadcastStatus("failed")).toBe(broadcastStatusConfig.failed);
  });

  it("flags `sending` as a live/pulsing state", () => {
    expect(getBroadcastStatus("sending").pulse).toBe(true);
    expect(getBroadcastStatus("sent").pulse).toBeFalsy();
  });

  it("falls back to draft on an unknown status string", () => {
    expect(getBroadcastStatus("not-a-real-status")).toBe(
      broadcastStatusConfig.draft,
    );
    expect(getBroadcastStatus("")).toBe(broadcastStatusConfig.draft);
  });

  it("each status has a label and a complete chip appearance", () => {
    for (const v of Object.values(broadcastStatusConfig)) {
      expect(v.label).not.toBe("");
      expect(v.classes).toMatch(/(?:^| )bg-/);
      expect(v.classes).toMatch(/(?:^| )text-/);
      expect(v.classes).toMatch(/(?:^| )border-/);
    }
  });
});

describe("getRecipientStatus", () => {
  it("returns the matching config for known statuses", () => {
    expect(getRecipientStatus("delivered")).toBe(
      recipientStatusConfig.delivered,
    );
    expect(getRecipientStatus("read")).toBe(recipientStatusConfig.read);
  });

  it("falls back to pending on an unknown status string", () => {
    expect(getRecipientStatus("???")).toBe(recipientStatusConfig.pending);
  });
});

describe("recipient status transitions", () => {
  it("moves forward along the success ladder only", () => {
    expect(isValidRecipientTransition("sent", "delivered")).toBe(true);
    expect(isValidRecipientTransition("sent", "read")).toBe(true);
    expect(isValidRecipientTransition("read", "delivered")).toBe(false);
    expect(isValidRecipientTransition("read", "read")).toBe(false);
  });

  it("allows failed only before delivery and treats it as terminal", () => {
    expect(isValidRecipientTransition("pending", "failed")).toBe(true);
    expect(isValidRecipientTransition("sent", "failed")).toBe(true);
    expect(isValidRecipientTransition("delivered", "failed")).toBe(false);
    expect(isValidRecipientTransition("failed", "delivered")).toBe(false);
  });

  it("derives each status's allowed predecessors from the same rules", () => {
    expect(allowedPredecessors("sent")).toEqual(["pending"]);
    expect(allowedPredecessors("delivered")).toEqual(["pending", "sent"]);
    expect(allowedPredecessors("read")).toEqual(["pending", "sent", "delivered"]);
    expect(allowedPredecessors("replied")).toEqual([
      "pending",
      "sent",
      "delivered",
      "read",
    ]);
    expect(allowedPredecessors("failed")).toEqual(["pending", "sent"]);
    expect(allowedPredecessors("pending")).toEqual([]);
    for (const next of RECIPIENT_STATUSES) {
      for (const current of allowedPredecessors(next)) {
        expect(isValidRecipientTransition(current, next)).toBe(true);
      }
    }
  });
});

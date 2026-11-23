// Adversarial payload test specifications for Firestore security rules verification.
// Verifies that all Dirty Dozen payloads violate rule invariants and are rejected.

export interface SecurityTestCase {
  id: string;
  path: string;
  operation: "get" | "list" | "create" | "update" | "delete";
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: "PERMISSION_DENIED";
}

export const DIRTY_DOZEN_CASES: SecurityTestCase[] = [
  {
    id: "DD-01-unauthenticated-read",
    path: "/users/uid1/cloudState/main",
    operation: "get",
    auth: null,
    expected: "PERMISSION_DENIED",
  },
  {
    id: "DD-02-cross-user-read",
    path: "/users/uid2/cloudState/main",
    operation: "get",
    auth: { uid: "uid1", email_verified: true },
    expected: "PERMISSION_DENIED",
  },
  {
    id: "DD-03-unverified-email-write",
    path: "/users/uid1/cloudState/main",
    operation: "create",
    auth: { uid: "uid1", email_verified: false },
    payload: { ownerId: "uid1", selectedPair: "BTC/USD" },
    expected: "PERMISSION_DENIED",
  },
  {
    id: "DD-04-spoofed-ownerId",
    path: "/users/uid1/cloudState/main",
    operation: "create",
    auth: { uid: "uid1", email_verified: true },
    payload: { ownerId: "uid2", selectedPair: "BTC/USD" },
    expected: "PERMISSION_DENIED",
  },
  {
    id: "DD-05-shadow-field-injection",
    path: "/users/uid1/cloudState/main",
    operation: "create",
    auth: { uid: "uid1", email_verified: true },
    payload: { ownerId: "uid1", selectedPair: "BTC/USD", isAdmin: true },
    expected: "PERMISSION_DENIED",
  },
  {
    id: "DD-06-forged-timestamp",
    path: "/users/uid1/cloudState/main",
    operation: "create",
    auth: { uid: "uid1", email_verified: true },
    payload: { ownerId: "uid1", createdAt: "1999-01-01T00:00:00Z" },
    expected: "PERMISSION_DENIED",
  },
  {
    id: "DD-07-immutable-owner-mutation",
    path: "/users/uid1/cloudState/main",
    operation: "update",
    auth: { uid: "uid1", email_verified: true },
    payload: { ownerId: "uid2" },
    expected: "PERMISSION_DENIED",
  },
  {
    id: "DD-08-terminal-cycle-mutation",
    path: "/users/uid1/botCycles/cycle-1",
    operation: "update",
    auth: { uid: "uid1", email_verified: true },
    payload: { status: "running", netPnlEur: 9999 },
    expected: "PERMISSION_DENIED",
  },
  {
    id: "DD-09-oversized-summary",
    path: "/users/uid1/botCycles/cycle-2",
    operation: "create",
    auth: { uid: "uid1", email_verified: true },
    payload: { ownerId: "uid1", positionsSummary: "x".repeat(10000) },
    expected: "PERMISSION_DENIED",
  },
  {
    id: "DD-10-invalid-cycle-status",
    path: "/users/uid1/botCycles/cycle-3",
    operation: "create",
    auth: { uid: "uid1", email_verified: true },
    payload: { ownerId: "uid1", status: "hacked" },
    expected: "PERMISSION_DENIED",
  },
  {
    id: "DD-11-email-alert-mutation",
    path: "/users/uid1/emailAlerts/alert-1",
    operation: "update",
    auth: { uid: "uid1", email_verified: true },
    payload: { recipientEmail: "attacker@example.com" },
    expected: "PERMISSION_DENIED",
  },
  {
    id: "DD-12-cross-user-list",
    path: "/users/uid2/botCycles",
    operation: "list",
    auth: { uid: "uid1", email_verified: true },
    expected: "PERMISSION_DENIED",
  },
];

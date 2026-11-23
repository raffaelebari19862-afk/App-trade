# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Strict User Isolation**: Every document under `/users/{userId}/...` belongs exclusively to the verified Firebase user whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
2. **Identity Integrity**: Incoming `ownerId` must always equal `request.auth.uid` on create and remain immutable on update.
3. **Path Variable Hardening**: Every document ID (`userId`, `stateId`, `cycleId`, `alertId`) must match `^[a-zA-Z0-9_\-]+$` and length `<= 128`.
4. **Terminal State Locking**: Once a `BotCycleRecord` reaches `status == "completed"`, no further updates are permitted. `EmailAlertLog` records are append-only (`status == "sent"`), with updates blocked.
5. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time` (server timestamp), and `createdAt` is immutable on updates.
6. **Strict Schema Keys & Sizes**: All writes enforce `keys().hasAll(...) && keys().hasOnly(...)`, type checks, and explicit string length limits to block shadow fields and resource poisoning.

## 2. The "Dirty Dozen" Payloads (Expected `PERMISSION_DENIED`)
1. Unauthenticated read/write to `/users/uid1/cloudState/main`.
2. Verified user `uid1` trying to read `/users/uid2/cloudState/main` (cross-tenant access).
3. Unverified email user (`email_verified: false`) attempting write to `/users/uid1/cloudState/main`.
4. Spoofed `ownerId: "uid2"` inside `/users/uid1/cloudState/main`.
5. Shadow field injection (`{ ..., isAdmin: true }`) on `/users/uid1/cloudState/main`.
6. Client-forged `createdAt` timestamp (`new Date(0)`) instead of `request.time`.
7. Mutating `createdAt` or `ownerId` during an `update` on `/users/uid1/cloudState/main`.
8. Updating a `BotCycleRecord` after `status` is already `"completed"`.
9. Injecting a 10KB string into `positionsSummary` (exceeds `maxLength: 4000`).
10. Injecting an invalid status `"hacked"` into `BotCycleRecord.status`.
11. Attempting to update an immutable `EmailAlertLog` document.
12. Unconstrained list query across `/users/{otherUid}/botCycles`.

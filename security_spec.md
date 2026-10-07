# Security Specification: Business Analyzer SaaS

## 1. Data Invariants
- A `Project` can only be created and accessed by its authenticated `ownerId`.
- A `Version` can only be created or read within a `Project` if the authenticated user is the `ownerId` of that parent `Project`.
- The document IDs must be alphanumeric strings with reasonable lengths (`isValidId`).
- `createdAt` and `updatedAt` timestamps must be synchronized with the server's request time.
- Users cannot perform update or delete operations on someone else's projects.
- `ownerId` and `createdAt` are immutable after creation.

## 2. The Dirty Dozen Payloads (Designed to Fail)

### Project Collection Attacks
1. **Identity Spoofing**: Attempt to create a project with another user's `ownerId` in the body.
2. **Unauthenticated Project Creation**: Attempt to create a project without an active auth session.
3. **Ghost Fields Update**: Attempt to update a project with arbitrary properties (e.g., `isVerified: true`).
4. **Time Spoofing (createdAt)**: Creating a project with a client-side falsified `createdAt` date.
5. **ID Poisoning**: Attempt to write a project document with a massive 2KB malicious ID containing script injection tags.
6. **Cross-User Hijacking**: Attacker (user B) attempting to read, update or delete user A's project document.

### Versions Collection Attacks
7. **Orphaned Version Writing**: Creating a version inside a project path that doesn't exist or is owned by another user.
8. **Immutability Breach**: Attempt to overwrite or update an existing completed `Version` document (which is locked/read-only).
9. **Faked Score Modification**: Injecting a custom faked `overall_score_100` into `analysisResult` directly via client-side update.
10. **Unverified Email Actions**: Creating a project or version with an unverified email when verification is required.
11. **Malicious Content Injection**: Sending user input string exceeding the strict 10,000 characters limit to exploit storage/memory.
12. **Blanket Query Scraping**: Issuing a list query on `/projects` or `/versions` without filtering by the authorized `ownerId` or parent resource.

## 3. Test Cases for Denying Malicious Payloads
All payloads listed above must trigger `PERMISSION_DENIED` inside Firestore security rules.
Below are the conceptual assertions we must enforce in our `firestore.rules`.

# PRD — Merchant Master Agreement: Real Signature Capture in Onboarding

| Field | Value |
|---|---|
| Status | **DRAFT — for feasibility review. No implementation approved yet.** |
| Date | 2026-09-19 |
| Scope | `nexara-frontend` onboarding Step 4 + `nexara-backend` onboarding/KYC APIs + Ops KYC review |
| Author | Engineering (RUNE) |

## 1. Problem statement

Today, onboarding Step 4 ("Sign Master Agreement") is **consent-only, not a signature**:

- Frontend (`app/onboarding/page.tsx:153,1460-1470`) renders the agreement text
  (v2026.1) in a scroll box plus a single consent checkbox. The submit button
  is even labelled "E-Sign & Submit KYC" (`:1533`), but no signature is captured.
- The backend only persists a boolean: `agreementAccepted` →
  `kyc.agreementSignedAt = new Date()` (`merchants.service.ts:1462-1464,1565`,
  entity `merchant-kyc.entity.ts:106`). Ops readiness gates on
  `hasAgreement = Boolean(kyc?.agreementSignedAt)` (`:1858`).

Gaps this creates:

1. **No evidence of execution** — we cannot prove *who* signed, *what version*
   they signed, or *how* (drawn / uploaded / clicked).
2. **No signed artifact** — there is no PDF or image of the executed agreement
   stored next to PAN/Aadhaar/selfie in KYC storage (`kyc/{id}/…`).
3. **Version risk** — if agreement text changes (v2026.1 → v2026.2), old
   `agreementSignedAt` timestamps cannot be tied to a version.
4. **Misleading UX** — calling a checkbox "E-Sign" overstates its legal weight.

## 2. Goals

1. Keep the **consent tick** as a mandatory first step (unchanged legal meaning:
   "I accept all merchant terms and authorize Digilocker identity verification").
2. Add a **real signature mechanism** with two paths; the merchant picks one:
   - **Path A — Download → wet-sign → upload scan/photo.**
   - **Path B — In-browser digital e-sign** (drawn signature + typed-name
     confirmation, sealed with an audit bundle).
3. Store a **tamper-evident signed artifact + audit trail** per merchant,
   visible in the Ops KYC review queue.
4. Version-stamp every execution (agreement version + SHA-256 of the exact text).

## 3. Non-goals (v1)

- **Aadhaar eSign via a licensed ASP/KUA** (e.g. UIDAI eSign 2.0/2.1 through an
  Application Service Provider). This is the gold standard under the IT Act but
  needs a vendor contract, KYC of the ASP, per-transaction cost, and redirect
  UX. Explicitly deferred — see §10 Q3.
- Digital Signature Certificates (DSC tokens) for merchants.
- E-stamp / e-franking integration.
- Retroactive re-signing of already-ACTIVE merchants (Ops decision; system only
  needs to *support* re-sign prompts, not trigger them).

## 4. Current state (grounding refs)

| Layer | Current behaviour | Ref |
|---|---|---|
| UI Step 4 | Agreement scroll box + consent checkbox; submit blocked until ticked | `app/onboarding/page.tsx:1426-1474,1523` |
| Submit payload | `agreementAccepted: agreed` (boolean) in `POST /api/onboarding` | `:540`, `OnboardingController.normalize` |
| Persistence | `kyc.agreementSignedAt` timestamp only; no artifact, no version | `merchants.service.ts:1565`, `merchant-kyc.entity.ts:106` |
| Ops gate | KYC readiness requires `agreementSignedAt` non-null | `merchants.service.ts:963,1858` |
| Doc uploads | Multipart `POST /api/kyc/documents`; 5 MB max; JPEG/PNG/WebP only; S3 via `storage.putObject` at `kyc/{id}/…` | `lib/kyc-upload.ts`, `merchants.service.ts:1486-1535` |

## 5. Proposed UX — reworked Step 4

Step 4 becomes three sequential blocks (all inside the existing stepper;
edit-mode "Confirm KYC Updates" flow is untouched):

### 5.1 Block 1 — Agreement preview + consent tick (unchanged, mandatory)

- Keep the scroll box, but source the text from a **versioned agreement record**
  (see §7) and display the version tag, e.g. "NEXARA MERCHANT SERVICES
  AGREEMENT **v2026.1** · effective 2026-01-01".
- Keep the consent checkbox with identical wording. Submit stays disabled until
  ticked. No behaviour change here.

### 5.2 Block 2 — Choose signing method (radio, required)

After ticking consent, the merchant must pick exactly one:

- (A) **"Download, sign on paper, upload a scan/photo"**
- (B) **"Sign digitally right now"**

The choice is recorded as `signatureMethod: PAPER_UPLOAD | DIGITAL_ESIGN`
and is immutable once the dossier is submitted (same immutability rule as
PAN/Aadhaar).

### 5.3 Path A — Download → wet-sign → upload

1. **Download PDF** button → fetches a **personalized agreement PDF** generated
   server-side (§7): pre-filled with legal name, trade name, mobile (masked),
   merchant ID, date, agreement version, and a unique **document reference ID**.
   File name: `Nexara-Agreement-{merchantId}-{version}.pdf`.
2. Instructions: "Print all pages → sign + date each page (or at least the last
   page with full signature and initials elsewhere) → scan or photograph all
   pages."
3. **Upload control** reusing the existing KYC upload pipeline:
   accept `PDF, JPEG, PNG, WebP`; 5 MB per file (PDF up to 10 MB); multi-page
   PDFs allowed; min legibility hint (align edges, no blur). Client-side
   validation mirrors `validateKycFile`, extended for PDFs.
4. Show upload preview/thumbnail + file name + "Replace" affordance before
   final submit. Upload happens with the other KYC docs post-`POST /onboarding`
   using the returned `accessToken` (same pattern as PAN/Aadhaar today).
5. Submit stays disabled until a signed copy is attached when Path A is chosen.

### 5.4 Path B — In-browser digital e-sign

1. **Typed full name** field (must match `contactName` from Step 1; fuzzy match,
   block on mismatch with guidance to fix Step 1).
2. **Signature pad** (canvas draw with mouse/touch/stylus; Clear + Redo;
   minimum stroke count / bounding-box check to reject dots and straight lines).
3. Explicit declaration line above the Sign button, e.g.:
   "I, *{typed name}*, electronically sign the Nexara Merchant Services
   Agreement *{version}* for *{legalName}* on *{date-time IST}*."
4. On "Sign digitally": frontend snapshots the pad to PNG, computes nothing
   security-critical client-side, and submits `{ signaturePngBase64,
   typedName, agreementVersion }` with the onboarding payload. The **backend
   seals the audit bundle** (§7): signer identity (mobile-OTP-verified mobile +
   user id), timestamp (server time, IST), agreement version + SHA-256 of exact
   text, signature PNG hash, request IP + user-agent, session/OTP lineage.
5. The sealed bundle (JSON) + signature PNG are stored in KYC storage
   (`kyc/{id}/agreement/…`) and surfaced in Ops review.

### 5.5 Honest labelling

- Rename the final button per path: "Submit KYC with signed agreement" (A) /
  "E-Sign & Submit KYC" (B, only for the digital path).
- Add a footnote on Path B: "This is an in-app electronic signature backed by
  your OTP-verified identity and an audit trail. It is not an Aadhaar eSign /
  DSC signature." (Prevents the exact overstatement problem we have today.)

## 6. Functional requirements

### Frontend (`nexara-frontend`)

1. FR-F1: Step 4 renders agreement text + version tag from the versioned record;
   falls back to the baked-in v2026.1 text if the fetch fails (offline-safe).
2. FR-F2: Consent checkbox remains mandatory and precedes the method choice.
3. FR-F3: Method radio (A/B) is required; switching methods discards the other
   path's in-progress artifact with a confirm dialog.
4. FR-F4: Path A — download button (with loading + error states), upload input
   (PDF/JPG/PNG/WebP, size limits), preview + replace, per-file validation
   errors.
5. FR-F5: Path B — typed-name field with contact-name match check, canvas pad
   with clear/redo + trivial-scribble rejection, declaration line, PNG export.
6. FR-F6: Final submit includes `signatureMethod` + path payload; submit blocked
   until the chosen path's artifact is complete.
7. FR-F7: Status view ("KYC Under Review") shows signature method + a
   view/download link for the merchant's own executed copy.
8. FR-F8: All new strings externalised for copy review; no hardcoded legal
   text beyond the v2026.1 fallback.

### Backend (`nexara-backend`)

1. FR-B1: **Versioned agreement store** — seedable record
   `{ version, effectiveFrom, text, sha256 }`; `GET /onboarding/agreement`
   (public) returns current `{ version, text }`.
2. FR-B2: **Personalized PDF generation** — `GET /onboarding/agreement.pdf`
   (public, rate-limited) renders the current version pre-filled with merchant
   details + document reference ID. Deterministic output (same inputs → same
   bytes) so hashes are reproducible.
3. FR-B3: **Onboarding payload extension** — accept
   `{ agreementVersion, signatureMethod, signaturePngBase64?, typedName? }`;
   validate `agreementVersion` is current (reject stale with 422 + current
   version so the client can refresh and re-sign).
4. FR-B4: **Upload extension** — `storeKycFiles` accepts a `signedAgreement`
   file (PDF/images); stores at `kyc/{id}/agreement/signed-copy{ext}`;
   same 5 MB (10 MB PDF) discipline as other KYC docs.
5. FR-B5: **Audit-bundle sealing (Path B)** — server-side record
   `{ merchantId, userId, mobile, typedName, agreementVersion, agreementSha256,
   signaturePngSha256, signedAt (server time), ip, userAgent, otpLineage }`
   stored as JSON alongside the PNG; both hashes logged.
6. FR-B6: **Readiness gate update** — KYC completeness requires
   consent tick + (Path A: signed-copy present | Path B: sealed bundle present).
   `hasAgreement` semantics move from "timestamp exists" to "artifact exists".
7. FR-B7: **Ops review API** — expose `signatureMethod`, preview/download URLs,
   version + hash-match flag (`stored hash == current version hash ?`).
8. FR-B8: Re-sign support — rejected/suspended merchants resubmitting KYC must
   re-execute (new bundle; old artifacts retained with superseded flag).

### Ops review UI

1. FR-O1: KYC detail shows signature method badge, signer name, signed-at
   (IST), agreement version, hash-match indicator.
2. FR-O2: One-click preview (PDF viewer / image) and download of the executed
   copy + audit bundle JSON.
3. FR-O3: Reject reason template for illegible/mismatched signatures.

## 7. Data model & API sketch (proposal, not final)

New nullable columns on the KYC record (migration; existing rows unaffected):

- `agreementVersion: string` (e.g. `"2026.1"`)
- `agreementSha256: string`
- `signatureMethod: 'PAPER_UPLOAD' | 'DIGITAL_ESIGN' | null`
- `signedCopyPath: string | null` (Path A artifact)
- `signatureImagePath: string | null` (Path B PNG)
- `signatureAuditPath: string | null` (Path B sealed JSON)
- `signedAt: Date | null` (replaces reliance on `agreementSignedAt`; keep the
  old column for history)

New/changed endpoints:

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /onboarding/agreement` | public | Current `{ version, effectiveFrom, text }` |
| `GET /onboarding/agreement.pdf?mobile=…` | public, rate-limited | Personalized PDF (prefill + ref ID) |
| `POST /onboarding` | public (existing) | Extended payload per FR-B3 |
| `POST /ops/merchants/:id/kyc-files` (existing) | authed | Accept `signedAgreement` per FR-B4 |

## 8. Edge cases

1. Merchant picks A, uploads, switches to B → A file discarded (confirm dialog);
   vice versa.
2. Agreement version bumps mid-onboarding → submit rejected 422; UI refreshes
   text, merchant re-ticks + re-signs (rare, acceptable).
3. Edit mode (`updatePendingOnboarding`) does **not** touch signatures; only a
   rejected → resubmit cycle triggers re-sign.
4. Paper upload illegible → Ops rejects with template reason; merchant re-uploads
   (no new OTP needed if session valid; new OTP if expired).
5. Drawn signature trivial (dot/line) → client rejects with guidance; server
   re-validates PNG dimensions/entropy as backstop.
6. PDF generation fails → Path A shows error + retry; Path B unaffected; submit
   blocked only for Path A until resolved.

## 9. Compliance & risk notes (informational, not legal advice)

- India's **IT Act, 2000** (Second Schedule) recognises electronic signatures;
  enforceability scales with how well identity + intent + integrity are evidenced
  — which is exactly what the audit bundle (§5.4/FR-B5) is for.
- **Aadhaar eSign** (ASP/KUA model) gives the strongest non-repudiation but is
  out of scope for v1 (§3); Path B must therefore be labelled honestly (§5.5).
- Signer authentication rests on the **already-consumed ONBOARDING OTP**
  (`assertRecentOnboardingOtp`) — same identity proof as the rest of the
  dossier. No new identity primitive is introduced in v1.
- Retain executed copies per the same retention policy as other KYC artifacts;
  access-log downloads in Ops review.

## 10. Open questions — feasibility review (owner to verify)

1. **PDF generation approach**: `pdf-lib` (pure-JS, deterministic, no browser)
   vs headless-Chromium render? Preference: `pdf-lib` + a checked-in template.
   Confirm no infra objection (no new services).
2. **Upload limits**: is 10 MB PDF acceptable for object storage + Ops preview?
   Confirm storage cost/retention policy for +1 artifact per merchant.
3. **Legal sign-off**: does Product/Legal accept Path B (OTP-backed audit trail)
   as sufficient for disbursement, or is Path A (wet signature) mandatory for
   payouts above a threshold? (Possible compromise: B allowed, A required above
   ₹X daily limit.)
4. **Aadhaar eSign vendor**: any existing/planned ASP relationship that would
   make licensed eSign cheap to add later? If yes, FRs should reserve a
   `signatureMethod: AADHAAR_ESIGN` enum value now.
5. **Ops capacity**: illegible-upload reject loop adds review touches — accept,
   or require Path B only for low-risk tiers?
6. **Re-sign on version bump for ACTIVE merchants**: force at next login, or
   grandfather? Needs Product + Legal call.
7. **Locales**: agreement text English-only in v1? (Hindi/other translations
   multiply versioning cost.)

## 11. Phased rollout (proposal)

- **Phase 1 (smallest shippable)**: consent tick (kept) + Path A
  (download pre-filled PDF + upload scan). No canvas, no audit bundle.
  Ops sees the uploaded copy. Est. smallest backend surface: PDF gen + 1 upload
  field + version column.
- **Phase 2**: Path B digital e-sign + audit-bundle sealing + hash-match flag.
- **Phase 3 (optional)**: licensed Aadhaar eSign via ASP; adds third radio
  option; reuse the same version/hash/audit plumbing.

## 12. Acceptance criteria (for the build phase, when approved)

1. A fresh onboarding cannot reach KYC_PENDING without consent tick + exactly
   one complete signature path artifact.
2. Every executed agreement in storage is openable from Ops review and shows
   method, signer, server timestamp (IST), version, and hash-match = true.
3. Submitting against a stale agreement version fails closed (422) with the
   client recovering by re-sign.
4. Existing merchants/rows migrate with zero downtime (all new columns nullable;
   old `agreementSignedAt` untouched).
5. `npx tsc --noEmit` (frontend), backend build, and unit suites green.

---
*End of PRD. Decision required: approve Phase 1 scope, answer §10, then schedule implementation.*

import { createHash } from 'crypto';

/**
 * Canonical Merchant Services Agreement record (Phase 1: paper-upload path).
 *
 * This is the single source of truth for the agreement text shown in
 * onboarding Step 4 and embedded in the downloadable PDF. The SHA-256 binds
 * an execution to the EXACT text the merchant saw: hash input is
 * `${version}\n${effectiveFrom}\n${text}`.
 *
 * Bumping the version = append a new record + flip CURRENT_VERSION. Old
 * executions stay verifiable because their stored hash pins the old text.
 */
export interface AgreementRecord {
  version: string;
  effectiveFrom: string;
  title: string;
  text: string;
  sha256: string;
}

export const AGREEMENT_TEXT_V2026_1 = [
  'NEXARA MERCHANT SERVICES AGREEMENT',
  '',
  '1. PARTIES AND SCOPE. This agreement is between Nexara ("Platform") and the merchant entity identified in the execution block below ("Merchant"). It sets forth the terms governing Virtual Account Payouts, Ledger Settlement, and RBI compliance rules executed via the YES Bank Node.',
  '',
  '2. IDENTITY AND VERIFICATION. By executing this agreement, the Merchant confirms that all identity records retrieved via Digilocker and facial selfie verification are authentic, belong to the authorised signatory, and are submitted under the Information Technology Act, 2000.',
  '',
  '3. PAYOUTS AND SETTLEMENT. The Platform credits Merchant payouts to verified bank accounts only, maintains a per-transaction ledger, applies the agreed fee schedule, and settles per the configured payout rails. Limits, fees, and taxes are as configured on the Merchant account.',
  '',
  '4. COMPLIANCE. The Merchant shall operate within applicable RBI guidelines for payment aggregation and settlement, maintain accurate business records, and promptly report discrepancies through the platform query tracker.',
  '',
  '5. EXECUTION. This agreement may be executed (a) on paper: print all pages, sign and date the execution block (initials on every other page), then upload a legible scan or photograph; or (b) digitally in-app where offered. Each execution carries the document reference below, binding it to this version.',
  '',
  '6. VERSION. This execution is bound to the agreement version and content hash printed in the execution block. Amendments take effect only in a newer published version.',
].join('\n');

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function buildRecord(
  version: string,
  effectiveFrom: string,
  title: string,
  text: string,
): AgreementRecord {
  return {
    version,
    effectiveFrom,
    title,
    text,
    sha256: sha256Hex(`${version}\n${effectiveFrom}\n${text}`),
  };
}

const RECORDS: AgreementRecord[] = [
  buildRecord(
    '2026.1',
    '2026-01-01',
    'NEXARA MERCHANT SERVICES AGREEMENT v2026.1',
    AGREEMENT_TEXT_V2026_1,
  ),
];

export const CURRENT_AGREEMENT_VERSION = '2026.1';

export function getCurrentAgreement(): AgreementRecord {
  const record = RECORDS.find((r) => r.version === CURRENT_AGREEMENT_VERSION);
  if (!record) {
    throw new Error(
      `Current agreement version ${CURRENT_AGREEMENT_VERSION} is not defined`,
    );
  }
  return record;
}

export function getAgreementByVersion(version: string): AgreementRecord | null {
  return RECORDS.find((r) => r.version === version) ?? null;
}

export function getCurrentAgreementSha256(): string {
  return getCurrentAgreement().sha256;
}

/** Short fingerprint for footers / ref IDs (first 12 hex chars). */
export function shortHash(sha256: string): string {
  return sha256.slice(0, 12).toUpperCase();
}

/**
 * Deterministic document reference binding a merchant to an agreement
 * version. No timestamps inside — re-downloads produce identical bytes.
 */
export function buildDocumentRef(merchantId: string, version: string): string {
  const compact = merchantId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `NXA-${compact}-${version.replace(/\./g, '')}`;
}

export function maskMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '').slice(-10);
  if (digits.length < 5) return '+91 ••••• •••••';
  return `+91 ••••• ${digits.slice(-5)}`;
}

/**
 * Normalizes a signer name for comparison: lowercase, trim, collapse inner
 * whitespace. "Ravi  Kumar" and "ravi kumar" compare equal.
 */
export function normalizeSignerName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function signerNamesMatch(a: string, b: string): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  return normalizeSignerName(a) === normalizeSignerName(b);
}

export const SIGNATURE_PNG_MIN_WIDTH = 200;
export const SIGNATURE_PNG_MIN_HEIGHT = 60;
export const SIGNATURE_PNG_MIN_BYTES = 2048;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Backstop validation for drawn-signature PNGs (server side; the client
 * already enforces stroke-count / bounding-box rules). Reads only the PNG
 * header — no image decoder dependency.
 */
export function assertSignaturePng(
  buffer: Buffer,
): { width: number; height: number } {
  if (!buffer?.length || buffer.length < SIGNATURE_PNG_MIN_BYTES) {
    throw new Error('Signature image is too small to be a real signature');
  }
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error('Signature must be a PNG image');
  }
  const type = buffer.subarray(12, 16).toString('ascii');
  if (type !== 'IHDR') {
    throw new Error('Signature PNG header is invalid');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < SIGNATURE_PNG_MIN_WIDTH || height < SIGNATURE_PNG_MIN_HEIGHT) {
    throw new Error(
      `Signature canvas must be at least ${SIGNATURE_PNG_MIN_WIDTH}x${SIGNATURE_PNG_MIN_HEIGHT}px`,
    );
  }
  return { width, height };
}

export function sha256HexBytes(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

import { deflateSync } from 'zlib';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { AgreementService, wrapTextToWidth } from './agreement.service';
import { getCurrentAgreement } from './agreement-text';

/** A4 content width used by the renderer (595.28 - 2*56). */
const CONTENT_W = 595.28 - 2 * 56;

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.from(type, 'ascii');
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(Buffer.concat([td, data])), 0);
  return Buffer.concat([len, td, data, sum]);
}

/** Builds a REAL, decodable PNG (gradient) — pdf-lib must embed it. */
function makePng(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rowLen = width * 3 + 1;
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * rowLen + 1 + x * 3;
      raw[i] = Math.floor((x * 255) / width);
      raw[i + 1] = Math.floor((y * 255) / height);
      raw[i + 2] = 128;
    }
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('AgreementService', () => {
  const service = new AgreementService();
  const prefill = {
    merchantId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    businessName: 'Acme Kirana',
    contactPerson: 'Ravi Kumar',
    mobile: '9876543210',
  };

  it('renders a deterministic unsigned PDF', async () => {
    const a = await service.renderPdf(prefill);
    const b = await service.renderPdf(prefill);
    expect(a.subarray(0, 5).toString()).toBe('%PDF-');
    expect(a.equals(b)).toBe(true);
    const doc = await PDFDocument.load(a);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('wraps every line inside the A4 content box, even hostile inputs', async () => {
    const doc = await PDFDocument.create();
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const hostile = [
      'NEXARA MERCHANT SERVICES AGREEMENT v2026.1 — EXECUTED COPY',
      'A'.repeat(200),
      'bc46857d-daf0-4cc0-a83a-cbc39c3daed9'.repeat(4),
      `Version 2026.1 · Effective 2026-01-01 · Document Ref ${'NXA-'.repeat(40)}`,
    ];
    for (const text of hostile) {
      for (const [font, size] of [
        [bold, 16],
        [bold, 12],
        [regular, 10],
      ] as const) {
        const lines = wrapTextToWidth(text, font, size, CONTENT_W);
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
          expect(font.widthOfTextAtSize(line, size)).toBeLessThanOrEqual(
            CONTENT_W + 0.01,
          );
        }
      }
    }
    expect(wrapTextToWidth('Short title', bold, 16, CONTENT_W)).toEqual([
      'Short title',
    ]);
  });

  it('renders hostile merchant details without throwing', async () => {
    const evil = {
      merchantId: 'x'.repeat(64),
      businessName: 'Y'.repeat(180),
      tradeName: 'Z'.repeat(180),
      contactPerson: 'W'.repeat(120),
      mobile: '9876543210',
    };
    const pdf = await service.renderPdf(evil);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThanOrEqual(1);
    const signed = await service.renderSignedPdf({
      ...evil,
      version: getCurrentAgreement().version,
      signaturePng: makePng(300, 100),
      typedName: 'V'.repeat(120),
      signedAt: new Date('2026-09-21T10:00:00.000Z'),
    });
    expect(signed.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(signed)).getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('renders an executed copy embedding the signature image', async () => {
    const record = getCurrentAgreement();
    const signed = await service.renderSignedPdf({
      ...prefill,
      version: record.version,
      signaturePng: makePng(600, 200),
      typedName: 'Ravi Kumar',
      signedAt: new Date('2026-09-21T10:00:00.000Z'),
    });
    expect(signed.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(signed);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toContain('executed copy');
    const unsigned = await service.renderPdf(prefill);
    expect(signed.equals(unsigned)).toBe(false);
    // Embedded image makes the executed copy strictly larger.
    expect(signed.length).toBeGreaterThan(unsigned.length);
  });
});

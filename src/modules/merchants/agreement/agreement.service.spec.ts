import { deflateSync } from 'zlib';
import { PDFDocument } from 'pdf-lib';
import { AgreementService } from './agreement.service';
import { getCurrentAgreement } from './agreement-text';

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

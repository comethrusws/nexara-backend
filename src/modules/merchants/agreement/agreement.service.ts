import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import {
  AgreementRecord,
  buildDocumentRef,
  getAgreementByVersion,
  getCurrentAgreement,
  maskMobile,
  shortHash,
} from './agreement-text';

export interface AgreementPdfPrefill {
  merchantId: string;
  businessName: string;
  tradeName?: string;
  contactPerson: string;
  mobile: string;
}

/** Strict A4 page. Every draw below is clamped to [MARGIN, PAGE_W - MARGIN]. */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;
const MAX_W = PAGE_W - MARGIN * 2;
const BODY_SIZE = 10;
const LINE_GAP = 4;

/**
 * Word-wraps text to lines that each fit maxWidth. Overlong unbreakable
 * tokens (long names without spaces, hashes, URLs) are hard-broken by
 * character so NOTHING can ever overflow the content box.
 */
export function wrapTextToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words: string[] = [];
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    if (font.widthOfTextAtSize(raw, size) <= maxWidth) {
      words.push(raw);
      continue;
    }
    let chunk = '';
    for (const ch of raw) {
      if (chunk && font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
        words.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    if (chunk) words.push(chunk);
  }
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(trial, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Cursor over A4 pages: auto-paginates, draws footer per page, and exposes
 * only overflow-safe primitives (wrapped heading / paragraph / field).
 */
class PageWriter {
  page: PDFPage;
  pageNo = 1;
  y = PAGE_H - MARGIN;

  constructor(
    private readonly doc: PDFDocument,
    private readonly footerText: (pageNo: number) => string,
    private readonly footerFont: PDFFont,
  ) {
    this.page = doc.addPage([PAGE_W, PAGE_H]);
  }

  footer(): void {
    this.page.drawText(this.footerText(this.pageNo), {
      x: MARGIN,
      y: 28,
      size: 7,
      font: this.footerFont,
      color: rgb(0.45, 0.42, 0.38),
    });
  }

  need(height: number): void {
    if (this.y - height < MARGIN + 20) {
      this.footer();
      this.page = this.doc.addPage([PAGE_W, PAGE_H]);
      this.pageNo += 1;
      this.y = PAGE_H - MARGIN;
    }
  }

  heading(text: string, font: PDFFont, size = 16): void {
    const lines = wrapTextToWidth(text, font, size, MAX_W);
    this.need(lines.length * (size + LINE_GAP) + 10);
    for (const line of lines) {
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y,
        size,
        font,
        color: rgb(0.11, 0.09, 0.07),
      });
      this.y -= size + LINE_GAP;
    }
    this.y -= 10;
  }

  para(text: string, font: PDFFont, size: number, gapAfter = 6): void {
    for (const line of wrapTextToWidth(text, font, size, MAX_W)) {
      this.need(size + LINE_GAP);
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y,
        size,
        font,
        color: rgb(0.11, 0.09, 0.07),
      });
      this.y -= size + LINE_GAP;
    }
    this.y -= gapAfter;
  }

  /**
   * Label + value on one line when they fit; otherwise the label stays on
   * its own line and the value wraps below with a hanging indent.
   */
  field(
    label: string,
    value: string,
    labelFont: PDFFont,
    valueFont: PDFFont,
    size: number = BODY_SIZE,
  ): void {
    const display = value || '—';
    const labelW = labelFont.widthOfTextAtSize(label, size);
    const valueW = valueFont.widthOfTextAtSize(display, size);
    if (labelW + 6 + valueW <= MAX_W) {
      this.need(size + LINE_GAP);
      this.page.drawText(label, {
        x: MARGIN,
        y: this.y,
        size,
        font: labelFont,
        color: rgb(0.11, 0.09, 0.07),
      });
      this.page.drawText(display, {
        x: MARGIN + labelW + 6,
        y: this.y,
        size,
        font: valueFont,
        color: rgb(0.11, 0.09, 0.07),
      });
      this.y -= size + LINE_GAP + 2;
      return;
    }
    this.need(size + LINE_GAP);
    this.page.drawText(label, {
      x: MARGIN,
      y: this.y,
      size,
      font: labelFont,
      color: rgb(0.11, 0.09, 0.07),
    });
    this.y -= size + LINE_GAP;
    const indent = MARGIN + 12;
    for (const line of wrapTextToWidth(display, valueFont, size, MAX_W - 12)) {
      this.need(size + LINE_GAP);
      this.page.drawText(line, {
        x: indent,
        y: this.y,
        size,
        font: valueFont,
        color: rgb(0.11, 0.09, 0.07),
      });
      this.y -= size + LINE_GAP;
    }
    this.y -= 2;
  }

  finish(): void {
    this.footer();
  }
}

@Injectable()
export class AgreementService {
  getCurrent(): AgreementRecord {
    return getCurrentAgreement();
  }

  /**
   * Renders the personalized agreement PDF deterministically: same inputs
   * always produce identical bytes (fixed PDF metadata dates, no timestamps
   * in content — the merchant hand-writes the execution date when signing).
   */
  async renderPdf(prefill: AgreementPdfPrefill): Promise<Buffer> {
    const record = getCurrentAgreement();
    const docRef = buildDocumentRef(prefill.merchantId, record.version);

    const doc = await PDFDocument.create();
    doc.setTitle(record.title);
    doc.setSubject(`Document Ref ${docRef}`);
    doc.setProducer('Nexara Platform');
    doc.setCreator('Nexara Platform');
    const fixedDate = new Date(`${record.effectiveFrom}T00:00:00.000Z`);
    doc.setCreationDate(fixedDate);
    doc.setModificationDate(fixedDate);

    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const w = new PageWriter(
      doc,
      (n) =>
        `${record.title} · Ref ${docRef} · Hash ${shortHash(record.sha256)} · Page ${n}`,
      regular,
    );

    w.heading(record.title, bold);
    w.para(
      `Version ${record.version} · Effective ${record.effectiveFrom} · Document Ref ${docRef}`,
      regular,
      9,
      10,
    );

    w.heading('Merchant details', bold, 12);
    w.field('Legal / business name:', prefill.businessName, bold, regular);
    if (prefill.tradeName && prefill.tradeName !== prefill.businessName) {
      w.field('Trade name:', prefill.tradeName, bold, regular);
    }
    w.field('Authorised contact:', prefill.contactPerson, bold, regular);
    w.field('Registered mobile:', maskMobile(prefill.mobile), bold, regular);
    w.field('Merchant ID:', prefill.merchantId, bold, regular);
    w.y -= 6;

    w.heading('Agreement', bold, 12);
    for (const paragraph of record.text.split('\n')) {
      if (!paragraph.trim()) {
        w.y -= 4;
        continue;
      }
      const isSection = /^[0-9]\.\s/.test(paragraph.trim());
      w.para(paragraph.trim(), isSection ? bold : regular, BODY_SIZE);
    }

    w.y -= 6;
    w.need(4 * (BODY_SIZE + 12));
    w.heading('Execution block (sign by hand)', bold, 12);
    w.para(
      'Sign and date below. Initial every other page. Upload a legible scan or photograph of ALL pages via onboarding Step 4.',
      regular,
      BODY_SIZE,
    );
    for (const label of ['Signature:', 'Full name:', 'Date:']) {
      w.need(BODY_SIZE + 16);
      w.page.drawText(label, {
        x: MARGIN,
        y: w.y,
        size: BODY_SIZE,
        font: regular,
        color: rgb(0.11, 0.09, 0.07),
      });
      w.page.drawLine({
        start: { x: MARGIN + 130, y: w.y - 2 },
        end: { x: PAGE_W - MARGIN, y: w.y - 2 },
        thickness: 0.75,
        color: rgb(0.35, 0.32, 0.28),
      });
      w.y -= BODY_SIZE + 16;
    }
    w.need(BODY_SIZE + LINE_GAP);
    w.page.drawText(`Document Ref: ${docRef}`, {
      x: MARGIN,
      y: w.y,
      size: BODY_SIZE,
      font: bold,
      color: rgb(0.11, 0.09, 0.07),
    });
    w.y -= BODY_SIZE + LINE_GAP;

    w.finish();
    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  /**
   * Renders the EXECUTED copy for a digital e-sign: the same agreement text
   * with a filled execution block (typed name, embedded signature image,
   * execution timestamp, document ref, content hash). Unlike renderPdf this
   * is intentionally unique per signing and is stored as the artifact.
   */
  async renderSignedPdf(input: {
    merchantId: string;
    businessName: string;
    tradeName?: string;
    contactPerson: string;
    mobile: string;
    version: string;
    signaturePng: Buffer;
    typedName: string;
    signedAt: Date;
  }): Promise<Buffer> {
    const record =
      getAgreementByVersion(input.version) ?? getCurrentAgreement();
    const docRef = buildDocumentRef(input.merchantId, record.version);

    const doc = await PDFDocument.create();
    doc.setTitle(`${record.title} — executed copy`);
    doc.setSubject(`Document Ref ${docRef}`);
    doc.setProducer('Nexara Platform');
    doc.setCreator('Nexara Platform');
    doc.setCreationDate(input.signedAt);
    doc.setModificationDate(input.signedAt);

    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const signature = await doc.embedPng(input.signaturePng);
    const w = new PageWriter(
      doc,
      (n) =>
        `EXECUTED ${record.title} · Ref ${docRef} · Hash ${shortHash(record.sha256)} · Page ${n}`,
      regular,
    );

    w.heading(`${record.title} — EXECUTED COPY`, bold);
    w.para(
      `Digitally e-signed · Version ${record.version} · Effective ${record.effectiveFrom} · Document Ref ${docRef}`,
      regular,
      9,
      10,
    );

    w.heading('Merchant details', bold, 12);
    w.field('Legal / business name:', input.businessName, bold, regular);
    if (input.tradeName && input.tradeName !== input.businessName) {
      w.field('Trade name:', input.tradeName, bold, regular);
    }
    w.field('Authorised contact:', input.contactPerson, bold, regular);
    w.field('Registered mobile:', maskMobile(input.mobile), bold, regular);
    w.field('Merchant ID:', input.merchantId, bold, regular);
    w.y -= 6;

    w.heading('Agreement', bold, 12);
    for (const paragraph of record.text.split('\n')) {
      if (!paragraph.trim()) {
        w.y -= 4;
        continue;
      }
      const isSection = /^[0-9]\.\s/.test(paragraph.trim());
      w.para(paragraph.trim(), isSection ? bold : regular, BODY_SIZE);
    }

    w.y -= 6;
    w.heading('Execution record', bold, 12);
    w.field('Signed by (typed):', input.typedName, bold, regular);
    w.field('Signed at (IST):', formatIst(input.signedAt), bold, regular);
    w.field('Document Ref:', docRef, bold, regular);
    w.field('Agreement SHA-256:', shortHash(record.sha256), bold, regular);

    // Embedded drawn signature, aspect-preserved at 180pt wide.
    const sigW = 180;
    const sigH = (signature.height / signature.width) * sigW;
    w.need(sigH + BODY_SIZE + 8);
    w.page.drawText('Signature:', {
      x: MARGIN,
      y: w.y,
      size: BODY_SIZE,
      font: regular,
      color: rgb(0.11, 0.09, 0.07),
    });
    w.page.drawImage(signature, {
      x: MARGIN + 130,
      y: w.y - sigH + BODY_SIZE,
      width: sigW,
      height: sigH,
    });
    w.y -= sigH + 8;

    w.finish();
    const bytes = await doc.save();
    return Buffer.from(bytes);
  }
}

function formatIst(date: Date): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

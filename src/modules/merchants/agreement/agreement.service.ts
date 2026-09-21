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

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;
const MAX_W = PAGE_W - MARGIN * 2;
const BODY_SIZE = 10;
const LINE_GAP = 4;

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

    let page = doc.addPage([PAGE_W, PAGE_H]);
    let pageNo = 1;
    let y = PAGE_H - MARGIN;

    const footer = (p: PDFPage, n: number) => {
      p.drawText(
        `${record.title} · Ref ${docRef} · Hash ${shortHash(record.sha256)} · Page ${n}`,
        {
          x: MARGIN,
          y: 28,
          size: 7,
          font: regular,
          color: rgb(0.45, 0.42, 0.38),
        },
      );
    };

    const need = (height: number): PDFPage => {
      if (y - height < MARGIN + 20) {
        footer(page, pageNo);
        page = doc.addPage([PAGE_W, PAGE_H]);
        pageNo += 1;
        y = PAGE_H - MARGIN;
      }
      return page;
    };

    const drawWrapped = (
      text: string,
      font: PDFFont,
      size: number,
      opts: { gapAfter?: number; boldFirstLine?: boolean } = {},
    ) => {
      const words = text.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        const trial = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(trial, size) > MAX_W && line) {
          lines.push(line);
          line = word;
        } else {
          line = trial;
        }
      }
      if (line) lines.push(line);
      for (const l of lines) {
        need(size + LINE_GAP);
        page.drawText(l, { x: MARGIN, y, size, font, color: rgb(0.11, 0.09, 0.07) });
        y -= size + LINE_GAP;
      }
      y -= opts.gapAfter ?? 6;
    };

    const drawHeading = (text: string, size = 16) => {
      need(size + 10);
      page.drawText(text, { x: MARGIN, y, size, font: bold, color: rgb(0.11, 0.09, 0.07) });
      y -= size + 10;
    };

    const drawField = (label: string, value: string) => {
      need(BODY_SIZE + LINE_GAP);
      page.drawText(label, { x: MARGIN, y, size: BODY_SIZE, font: bold, color: rgb(0.11, 0.09, 0.07) });
      const lx = MARGIN + bold.widthOfTextAtSize(label, BODY_SIZE) + 6;
      page.drawText(value || '—', { x: lx, y, size: BODY_SIZE, font: regular, color: rgb(0.11, 0.09, 0.07) });
      y -= BODY_SIZE + LINE_GAP + 2;
    };

    drawHeading(record.title);
    drawWrapped(
      `Version ${record.version} · Effective ${record.effectiveFrom} · Document Ref ${docRef}`,
      regular,
      9,
      { gapAfter: 10 },
    );

    drawHeading('Merchant details', 12);
    drawField('Legal / business name:', prefill.businessName);
    if (prefill.tradeName && prefill.tradeName !== prefill.businessName) {
      drawField('Trade name:', prefill.tradeName);
    }
    drawField('Authorised contact:', prefill.contactPerson);
    drawField('Registered mobile:', maskMobile(prefill.mobile));
    drawField('Merchant ID:', prefill.merchantId);
    y -= 6;

    drawHeading('Agreement', 12);
    for (const paragraph of record.text.split('\n')) {
      if (!paragraph.trim()) {
        y -= 4;
        continue;
      }
      const isSection = /^[0-9]\.\s/.test(paragraph.trim());
      drawWrapped(paragraph.trim(), isSection ? bold : regular, BODY_SIZE);
    }

    y -= 6;
    need(4 * (BODY_SIZE + 12));
    drawHeading('Execution block (sign by hand)', 12);
    drawWrapped(
      'Sign and date below. Initial every other page. Upload a legible scan or photograph of ALL pages via onboarding Step 4.',
      regular,
      BODY_SIZE,
    );
    const sigLine = (label: string) => {
      need(BODY_SIZE + 16);
      page.drawText(label, { x: MARGIN, y, size: BODY_SIZE, font: regular, color: rgb(0.11, 0.09, 0.07) });
      const lx = MARGIN + 130;
      page.drawLine({
        start: { x: lx, y: y - 2 },
        end: { x: PAGE_W - MARGIN, y: y - 2 },
        thickness: 0.75,
        color: rgb(0.35, 0.32, 0.28),
      });
      y -= BODY_SIZE + 16;
    };
    sigLine('Signature:');
    sigLine('Full name:');
    sigLine('Date:');
    need(BODY_SIZE + LINE_GAP);
    page.drawText(`Document Ref: ${docRef}`, {
      x: MARGIN,
      y,
      size: BODY_SIZE,
      font: bold,
      color: rgb(0.11, 0.09, 0.07),
    });
    y -= BODY_SIZE + LINE_GAP;

    footer(page, pageNo);
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
    const record = getAgreementByVersion(input.version) ?? getCurrentAgreement();
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

    let page = doc.addPage([PAGE_W, PAGE_H]);
    let pageNo = 1;
    let y = PAGE_H - MARGIN;

    const footer = (p: PDFPage, n: number) => {
      p.drawText(
        `EXECUTED ${record.title} · Ref ${docRef} · Hash ${shortHash(record.sha256)} · Page ${n}`,
        {
          x: MARGIN,
          y: 28,
          size: 7,
          font: regular,
          color: rgb(0.45, 0.42, 0.38),
        },
      );
    };

    const need = (height: number): void => {
      if (y - height < MARGIN + 20) {
        footer(page, pageNo);
        page = doc.addPage([PAGE_W, PAGE_H]);
        pageNo += 1;
        y = PAGE_H - MARGIN;
      }
    };

    const drawWrapped = (text: string, font: PDFFont, size: number, gapAfter = 6) => {
      const words = text.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        const trial = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(trial, size) > MAX_W && line) {
          lines.push(line);
          line = word;
        } else {
          line = trial;
        }
      }
      if (line) lines.push(line);
      for (const l of lines) {
        need(size + LINE_GAP);
        page.drawText(l, { x: MARGIN, y, size, font, color: rgb(0.11, 0.09, 0.07) });
        y -= size + LINE_GAP;
      }
      y -= gapAfter;
    };

    const drawHeading = (text: string, size = 16) => {
      need(size + 10);
      page.drawText(text, { x: MARGIN, y, size, font: bold, color: rgb(0.11, 0.09, 0.07) });
      y -= size + 10;
    };

    const drawField = (label: string, value: string) => {
      need(BODY_SIZE + LINE_GAP);
      page.drawText(label, { x: MARGIN, y, size: BODY_SIZE, font: bold, color: rgb(0.11, 0.09, 0.07) });
      const lx = MARGIN + bold.widthOfTextAtSize(label, BODY_SIZE) + 6;
      page.drawText(value || '—', { x: lx, y, size: BODY_SIZE, font: regular, color: rgb(0.11, 0.09, 0.07) });
      y -= BODY_SIZE + LINE_GAP + 2;
    };

    drawHeading(`${record.title} — EXECUTED COPY`);
    drawWrapped(
      `Digitally e-signed · Version ${record.version} · Effective ${record.effectiveFrom} · Document Ref ${docRef}`,
      regular,
      9,
      10,
    );

    drawHeading('Merchant details', 12);
    drawField('Legal / business name:', input.businessName);
    if (input.tradeName && input.tradeName !== input.businessName) {
      drawField('Trade name:', input.tradeName);
    }
    drawField('Authorised contact:', input.contactPerson);
    drawField('Registered mobile:', maskMobile(input.mobile));
    drawField('Merchant ID:', input.merchantId);
    y -= 6;

    drawHeading('Agreement', 12);
    for (const paragraph of record.text.split('\n')) {
      if (!paragraph.trim()) {
        y -= 4;
        continue;
      }
      const isSection = /^[0-9]\.\s/.test(paragraph.trim());
      drawWrapped(paragraph.trim(), isSection ? bold : regular, BODY_SIZE);
    }

    y -= 6;
    drawHeading('Execution record', 12);
    drawField('Signed by (typed):', input.typedName);
    drawField('Signed at (IST):', formatIst(input.signedAt));
    drawField('Document Ref:', docRef);
    drawField('Agreement SHA-256:', shortHash(record.sha256));

    // Embedded drawn signature, aspect-preserved at 180pt wide.
    const sigW = 180;
    const sigH = (signature.height / signature.width) * sigW;
    need(sigH + BODY_SIZE + 8);
    page.drawText('Signature:', {
      x: MARGIN,
      y,
      size: BODY_SIZE,
      font: regular,
      color: rgb(0.11, 0.09, 0.07),
    });
    page.drawImage(signature, {
      x: MARGIN + 130,
      y: y - sigH + BODY_SIZE,
      width: sigW,
      height: sigH,
    });
    y -= sigH + 8;

    footer(page, pageNo);
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

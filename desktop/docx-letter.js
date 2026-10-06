"use strict";

// Builds a Word (.docx) version of the letter that mirrors the on-screen /
// PDF layout: logo in the page header, address bar in the page footer, and the
// body in Times New Roman.

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Header,
  Footer,
  Tab,
  AlignmentType,
} = require("docx");
const { imageSize } = require("image-size");

const FONT = "Times New Roman";
const SIZE_BODY = 24; // half-points = 12pt
const SIZE_FOOTER = 20; // 10pt
const AFTER = 240; // 12pt paragraph spacing, in twips

/** Split the body into paragraphs on blank lines, preserving indentation. */
function toParagraphs(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/^\n+|\n+$/g, ""))
    .filter((p) => p.trim().length > 0);
}

/** Decode a data: URL into { buffer, type } or null. */
function decodeDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const type =
    mime.includes("png") ? "png" :
    mime.includes("jpeg") || mime.includes("jpg") ? "jpg" :
    mime.includes("gif") ? "gif" :
    mime.includes("bmp") ? "bmp" : null;
  if (!type) return null; // svg/webp not embeddable as ImageRun here
  return { buffer: Buffer.from(m[2], "base64"), type };
}

/**
 * Turn text containing tabs and newlines into docx runs: tabs become real tab
 * stops (0.5" by default in Word), newlines become line breaks.
 */
function textRuns(text, opts = {}) {
  const base = { font: FONT, size: opts.size || SIZE_BODY, bold: !!opts.bold, color: opts.color };
  const runs = [];
  String(text)
    .split("\n")
    .forEach((line, li) => {
      const segs = line.split("\t");
      segs.forEach((seg, si) => {
        if (si > 0) runs.push(new TextRun({ ...base, children: [new Tab()] }));
        const needBreak = li > 0 && si === 0;
        if (seg.length > 0 || needBreak) {
          runs.push(new TextRun({ ...base, text: seg, break: needBreak ? 1 : undefined }));
        }
      });
    });
  if (runs.length === 0) runs.push(new TextRun({ ...base, text: "" }));
  return runs;
}

function para(text, { align, bold, after = AFTER, before, size } = {}) {
  return new Paragraph({
    alignment: align,
    spacing: { after, before, line: 276 }, // ~1.15 line spacing
    children: textRuns(text, { bold, size }),
  });
}

function buildHeader(logoDataUrl, firmName) {
  const decoded = decodeDataUrl(logoDataUrl);
  if (decoded) {
    let w = 384, h = 103;
    try {
      const d = imageSize(decoded.buffer);
      if (d && d.width && d.height) {
        w = 384;
        h = Math.round((384 * d.height) / d.width);
      }
    } catch {
      /* use defaults */
    }
    return new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [
            new ImageRun({ type: decoded.type, data: decoded.buffer, transformation: { width: w, height: h } }),
          ],
        }),
      ],
    });
  }
  // Text fallback when there is no embeddable logo.
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ font: FONT, size: 32, bold: true, text: firmName || "" })],
      }),
    ],
  });
}

function buildFooter(settings) {
  const accent = (/^#?[0-9a-fA-F]{6}$/.test(settings.accentColor || "")
    ? settings.accentColor
    : "#2F5496").replace("#", "");
  const children = [];
  if (settings.footerAddress) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ font: FONT, size: SIZE_FOOTER, text: settings.footerAddress })],
      }),
    );
  }
  const contact = [];
  if (settings.phone) {
    contact.push(new TextRun({ font: FONT, size: SIZE_FOOTER, color: accent, text: "PHONE " }));
    contact.push(new TextRun({ font: FONT, size: SIZE_FOOTER, text: settings.phone + "    " }));
  }
  if (settings.fax) {
    contact.push(new TextRun({ font: FONT, size: SIZE_FOOTER, color: accent, text: "FAX " }));
    contact.push(new TextRun({ font: FONT, size: SIZE_FOOTER, text: settings.fax + "    " }));
  }
  if (settings.email) {
    contact.push(new TextRun({ font: FONT, size: SIZE_FOOTER, text: settings.email }));
  }
  if (contact.length) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: contact }));
  }
  return new Footer({ children });
}

/** Build the .docx and return a Promise<Buffer>. */
async function buildLetterDocx({ values, settings }) {
  const s = settings || {};
  const body = [];

  body.push(para(values.date, { align: AlignmentType.CENTER, bold: true }));
  if (values.delivery) body.push(para(values.delivery, { bold: true }));
  if (values.recipient && values.recipient.trim()) {
    body.push(para(values.recipient, {}));
  }
  if (values.re) {
    body.push(
      new Paragraph({
        spacing: { after: AFTER, line: 276 },
        children: [
          new TextRun({ font: FONT, size: SIZE_BODY, bold: true, text: "Re:" }),
          new TextRun({ font: FONT, size: SIZE_BODY, text: "  " + values.re }),
        ],
      }),
    );
  }
  body.push(para(values.salutation, {}));

  const paragraphs = toParagraphs(values.body);
  paragraphs.forEach((p) => body.push(para(p, {})));

  // Signature block (centered), leaving space for a signature.
  body.push(para(values.closing || "", { align: AlignmentType.CENTER, after: 0 }));
  if (values.signName) {
    body.push(para(values.signName, { align: AlignmentType.CENTER, before: 960 }));
  }

  // Notations.
  const notations = [];
  if (values.copyTo) notations.push("xc:  " + values.copyTo);
  if (values.enclosure) notations.push("Enclosure");
  if (notations.length) {
    body.push(para(notations.join("\n"), { before: 240, after: 0 }));
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SIZE_BODY } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 }, // US Letter, twips
            margin: { top: 720, right: 1440, bottom: 720, left: 1440, header: 432, footer: 288 },
          },
        },
        headers: { default: buildHeader(values.logoDataUrl || s.logoDataUrl, s.firmName) },
        footers: { default: buildFooter(s) },
        children: body,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildLetterDocx };

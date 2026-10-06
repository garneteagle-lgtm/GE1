"use strict";

// ---------- helpers ----------

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape + convert newlines to <br>. */
function escLines(s) {
  return esc(s)
    .split("\n")
    .map((l) => l.trimEnd())
    .join("<br>");
}

/** Split body text into paragraphs on blank lines, preserving indentation. */
function toParagraphs(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/^\n+|\n+$/g, ""))
    .filter((p) => p.trim().length > 0);
}

function sanitizeFilename(s) {
  return String(s || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

// ---------- state ----------

let settings = null;
let defaultLogoDataUrl = "";

const $ = (id) => document.getElementById(id);

function effectiveLogo() {
  return (settings && settings.logoDataUrl) || defaultLogoDataUrl || "";
}

function currentLetterValues() {
  const recipient = $("f-recipient").value;
  const firstLine = recipient.split("\n")[0].trim();
  const typed = $("f-salutation").value.trim();
  const salutation = typed || (firstLine ? `Dear ${firstLine},` : "To whom it may concern,");
  return {
    date: $("f-date").value,
    delivery: $("f-delivery").value.trim(),
    recipient,
    re: $("f-re").value.trim(),
    salutation,
    body: $("f-body").value,
    closing: $("f-closing").value,
    signName: $("f-signname").value,
    copyTo: $("f-copyto").value.trim(),
    enclosure: $("f-enclosure").checked,
  };
}

// ---------- letter markup (shared by preview and export) ----------

function buildLetterInner(v) {
  const logo = effectiveLogo();
  const s = settings || {};
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(s.accentColor || "") ? s.accentColor : "#2F5496";

  const logoBlock = logo
    ? `<div class="lh-logo"><img src="${esc(logo)}" alt="logo"></div>`
    : `<div class="lh-firmname">${esc(s.firmName || "")}</div>`;

  const paragraphs = toParagraphs(v.body);
  const bodyHtml = paragraphs.length
    ? paragraphs.map((p) => `<p class="lh-para">${escLines(p)}</p>`).join("")
    : `<p class="lh-para lh-placeholder">Your letter text will appear here as you type.</p>`;

  const recipBlock = v.recipient.trim()
    ? `<div class="lh-recip">${escLines(v.recipient)}</div>`
    : "";
  const reBlock = v.re ? `<div class="lh-re"><b>Re:</b>&nbsp;&nbsp;${esc(v.re)}</div>` : "";
  const deliveryBlock = v.delivery ? `<div class="lh-delivery">${esc(v.delivery)}</div>` : "";

  const notations = [];
  if (v.copyTo) notations.push(`<div>xc:&nbsp;&nbsp;${esc(v.copyTo)}</div>`);
  if (v.enclosure) notations.push(`<div>Enclosure</div>`);
  const notationsBlock = notations.length
    ? `<div class="lh-notations">${notations.join("")}</div>`
    : "";

  // Footer contact line: PHONE xxx   FAX xxx   email
  const bits = [];
  if (s.phone) bits.push(`<span style="color:${esc(accent)}">PHONE&nbsp;</span>${esc(s.phone)}`);
  if (s.fax) bits.push(`<span style="color:${esc(accent)}">FAX&nbsp;</span>${esc(s.fax)}`);
  if (s.email) bits.push(esc(s.email));
  const contactLine = bits.length
    ? `<div>${bits.join("&nbsp;&nbsp;&nbsp;&nbsp;")}</div>`
    : "";
  const footer =
    s.footerAddress || contactLine
      ? `<footer class="lh-footer">${
          s.footerAddress ? `<div>${esc(s.footerAddress)}</div>` : ""
        }${contactLine}</footer>`
      : "";

  return `<article class="letter-sheet">
    ${logoBlock}
    <div class="lh-body">
      <div class="lh-date">${esc(v.date)}</div>
      ${deliveryBlock}
      ${recipBlock}
      ${reBlock}
      <div class="lh-salutation">${esc(v.salutation)}</div>
      ${bodyHtml}
      <div class="lh-sig">
        <div>${esc(v.closing)}</div>
        <div class="lh-sig-space"></div>
        ${v.signName ? `<div>${esc(v.signName)}</div>` : ""}
      </div>
      ${notationsBlock}
    </div>
    ${footer}
  </article>`;
}

// CSS used for the exported PDF. printToPDF supplies the page margins, so the
// sheet itself has no padding; min-height keeps a short letter's footer near
// the bottom of the single page.
const EXPORT_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .letter-sheet {
    color: #000;
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt; line-height: 1.3;
    display: flex; flex-direction: column; min-height: 9.7in;
  }
  .lh-logo { display: flex; justify-content: center; margin-bottom: 32px; }
  .lh-logo img { max-width: 4in; height: auto; }
  .lh-firmname { text-align: center; font-size: 20pt; font-weight: 700; margin-bottom: 24px; }
  .lh-body { flex: 1 1 auto; }
  .lh-date { text-align: center; font-weight: 700; margin-bottom: 24px; }
  .lh-delivery { font-weight: 700; margin-bottom: 16px; }
  .lh-recip { margin-bottom: 16px; }
  .lh-re { margin-bottom: 16px; }
  .lh-salutation { margin-bottom: 16px; }
  .lh-para { margin: 0 0 16px; white-space: pre-wrap; tab-size: 0.5in; -moz-tab-size: 0.5in; }
  .lh-sig { text-align: center; margin-top: 24px; }
  .lh-sig-space { height: 64px; }
  .lh-notations { margin-top: 32px; }
  .lh-footer { margin-top: 40px; text-align: center; font-size: 10pt; text-transform: uppercase; line-height: 1.35; }
`;

function buildExportHtml(v) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${EXPORT_CSS}</style></head><body>${buildLetterInner(
    v,
  )}</body></html>`;
}

// ---------- rendering ----------

function renderPreview() {
  $("preview").innerHTML = buildLetterInner(currentLetterValues());
}

// ---------- settings UI ----------

function fillSettingsForm() {
  $("s-firmname").value = settings.firmName || "";
  $("s-footer").value = settings.footerAddress || "";
  $("s-phone").value = settings.phone || "";
  $("s-fax").value = settings.fax || "";
  $("s-email").value = settings.email || "";
  $("s-accent").value = /^#[0-9a-fA-F]{6}$/.test(settings.accentColor || "")
    ? settings.accentColor
    : "#2F5496";
  $("s-closing").value = settings.closing || "";
  $("s-signname").value = settings.signName || "";
  $("logo-img").src = effectiveLogo();
}

function showSettings(show) {
  $("letter-fields").classList.toggle("hidden", show);
  $("settings-fields").classList.toggle("hidden", !show);
  if (show) fillSettingsForm();
}

async function saveSettingsFromForm() {
  const next = {
    ...settings,
    firmName: $("s-firmname").value.trim(),
    footerAddress: $("s-footer").value.trim(),
    phone: $("s-phone").value.trim(),
    fax: $("s-fax").value.trim(),
    email: $("s-email").value.trim(),
    accentColor: $("s-accent").value,
    closing: $("s-closing").value.trim(),
    signName: $("s-signname").value.trim(),
  };
  settings = await window.letterhead.saveSettings(next);
  // Reflect new signature/closing defaults if the letter fields are untouched defaults.
  renderPreview();
  showSettings(false);
}

// ---------- export ----------

function defaultFileName(v, ext) {
  const who = sanitizeFilename(v.recipient.split("\n")[0] || "");
  const when = sanitizeFilename(v.date);
  return `Letter${who ? " - " + who : ""}${when ? " - " + when : ""}.${ext}`;
}

function reportResult(res, status) {
  if (res && res.saved) status.textContent = "Saved: " + res.path;
  else if (res && res.canceled) status.textContent = "";
  else status.textContent = "Export failed" + (res && res.error ? ": " + res.error : "");
}

async function exportPdf() {
  const v = currentLetterValues();
  const status = $("status");
  status.textContent = "Preparing PDF…";
  try {
    const res = await window.letterhead.exportPdf({
      html: buildExportHtml(v),
      defaultFileName: defaultFileName(v, "pdf"),
    });
    reportResult(res, status);
  } catch (err) {
    status.textContent = "Export failed: " + err;
  }
}

async function exportDocx() {
  const v = currentLetterValues();
  const status = $("status");
  status.textContent = "Preparing Word document…";
  try {
    const res = await window.letterhead.exportDocx({
      values: v,
      settings: { ...settings, logoDataUrl: effectiveLogo() },
      defaultFileName: defaultFileName(v, "docx"),
    });
    reportResult(res, status);
  } catch (err) {
    status.textContent = "Export failed: " + err;
  }
}

// ---------- init ----------

function todayFormatted() {
  const d = new Date();
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

async function init() {
  const loaded = await window.letterhead.loadSettings();
  settings = loaded.settings;
  defaultLogoDataUrl = loaded.defaultLogoDataUrl || "";

  // Letter defaults.
  $("f-date").value = todayFormatted();
  $("f-delivery").value = "VIA ELECTRONIC MAIL";
  $("f-closing").value = settings.closing || "Very truly yours,";
  $("f-signname").value = settings.signName || "";

  // Live preview on any input.
  document
    .querySelectorAll("#letter-fields input, #letter-fields textarea")
    .forEach((el) => el.addEventListener("input", renderPreview));

  // Buttons.
  $("btn-settings").addEventListener("click", () => showSettings(true));
  $("btn-cancel-settings").addEventListener("click", () => showSettings(false));
  $("btn-save-settings").addEventListener("click", saveSettingsFromForm);
  $("btn-export").addEventListener("click", exportPdf);
  $("btn-export-docx").addEventListener("click", exportDocx);

  // Tab inserts an indent in the body instead of moving focus.
  $("f-body").addEventListener("keydown", (e) => {
    if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      // execCommand keeps native undo and fires an 'input' event (updates preview).
      if (!document.execCommand("insertText", false, "\t")) {
        const el = e.target;
        const s = el.selectionStart;
        el.value = el.value.slice(0, s) + "\t" + el.value.slice(el.selectionEnd);
        el.selectionStart = el.selectionEnd = s + 1;
        renderPreview();
      }
    }
  });

  $("btn-logo").addEventListener("click", async () => {
    const res = await window.letterhead.pickLogo();
    if (res && !res.canceled && res.dataUrl) {
      settings.logoDataUrl = res.dataUrl;
      $("logo-img").src = effectiveLogo();
    }
  });
  $("btn-logo-reset").addEventListener("click", () => {
    settings.logoDataUrl = "";
    $("logo-img").src = effectiveLogo();
  });

  renderPreview();
}

window.addEventListener("DOMContentLoaded", init);

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

/**
 * Clean up pasted/typed body text into indented block paragraphs:
 * - paragraphs separated by blank lines are de-wrapped (stray line breaks joined)
 * - with no blank lines, each line is treated as its own paragraph
 * - every paragraph gets a leading tab (first-line indent) and a blank line after
 */
function formatBodyText(raw) {
  let t = String(raw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = t
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n");
  const hasBlank = /\n[ \t]*\n/.test(t);
  let paras;
  if (hasBlank) {
    paras = t
      .split(/\n[ \t]*\n/)
      .map((block) => block.split("\n").map((s) => s.trim()).filter(Boolean).join(" "));
  } else {
    paras = t.split("\n").map((s) => s.trim());
  }
  paras = paras.map((p) => p.replace(/[ \t]{2,}/g, " ").trim()).filter(Boolean);
  return paras.map((p) => "\t" + p).join("\n\n");
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
let contacts = [];
let editingContactId = null;

const $ = (id) => document.getElementById(id);

function effectiveLogo() {
  return (settings && settings.logoDataUrl) || defaultLogoDataUrl || "";
}

function currentLetterValues() {
  const name = $("f-recipient-name").value.trim();
  const address = $("f-recipient-address").value;
  const recipient = [name, address].map((s) => s.trim()).filter(Boolean).join("\n");
  const typed = $("f-salutation").value.trim();
  const salutation = typed || (name ? `Dear ${name},` : "To whom it may concern,");
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

/** Switch between the "letter", "settings", and "contacts" panels. */
function showView(view) {
  $("letter-fields").classList.toggle("hidden", view !== "letter");
  $("settings-fields").classList.toggle("hidden", view !== "settings");
  $("contacts-fields").classList.toggle("hidden", view !== "contacts");
  if (view === "settings") fillSettingsForm();
  if (view === "contacts") renderContactsList();
}

// ---------- contacts ----------

function saveContacts() {
  return window.letterhead.saveContacts(contacts);
}

function findContactByName(name) {
  const key = String(name || "").trim().toLowerCase();
  return contacts.find((c) => (c.name || "").trim().toLowerCase() === key);
}

/** Save the current letter's recipient as a contact if it's new. Returns a status word. */
async function maybeSaveCurrentContact() {
  const name = $("f-recipient-name").value.trim();
  const address = $("f-recipient-address").value.trim();
  if (!name) return "no-name";
  const existing = findContactByName(name);
  if (existing) {
    // Keep an address if one was added to a previously bare contact.
    if (!existing.address && address) {
      existing.address = address;
      await saveContacts();
      return "updated";
    }
    return "exists";
  }
  contacts.push({ id: "c" + Date.now() + Math.random().toString(36).slice(2, 6), name, address });
  await saveContacts();
  return "added";
}

function renderContactsList() {
  const box = $("contacts-list");
  if (!contacts.length) {
    box.innerHTML = `<p class="hint">No contacts yet.</p>`;
    return;
  }
  const sorted = [...contacts].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  box.innerHTML = sorted
    .map(
      (c) => `
      <div class="contact-row" data-id="${esc(c.id)}">
        <div class="contact-info">
          <div class="contact-name">${esc(c.name || "")}</div>
          ${c.address ? `<div class="contact-addr">${escLines(c.address)}</div>` : ""}
        </div>
        <div class="contact-ops">
          <button class="btn btn-ghost small" data-act="edit" data-id="${esc(c.id)}">Edit</button>
          <button class="btn btn-ghost small" data-act="del" data-id="${esc(c.id)}">Delete</button>
        </div>
      </div>`,
    )
    .join("");
}

function resetContactForm() {
  editingContactId = null;
  $("c-name").value = "";
  $("c-address").value = "";
  $("contact-form-label").textContent = "Add a contact";
  $("btn-add-contact").textContent = "Add contact";
}

async function addOrUpdateContact() {
  const name = $("c-name").value.trim();
  const address = $("c-address").value.trim();
  if (!name) {
    $("c-name").focus();
    return;
  }
  if (editingContactId) {
    const c = contacts.find((x) => x.id === editingContactId);
    if (c) {
      c.name = name;
      c.address = address;
    }
  } else if (!findContactByName(name)) {
    contacts.push({ id: "c" + Date.now() + Math.random().toString(36).slice(2, 6), name, address });
  } else {
    findContactByName(name).address = address;
  }
  await saveContacts();
  resetContactForm();
  renderContactsList();
}

function editContact(id) {
  const c = contacts.find((x) => x.id === id);
  if (!c) return;
  editingContactId = id;
  $("c-name").value = c.name || "";
  $("c-address").value = c.address || "";
  $("contact-form-label").textContent = "Edit contact";
  $("btn-add-contact").textContent = "Update contact";
  $("c-name").focus();
}

async function deleteContact(id) {
  contacts = contacts.filter((x) => x.id !== id);
  await saveContacts();
  if (editingContactId === id) resetContactForm();
  renderContactsList();
}

// ---------- recipient autocomplete ----------

let suggestActive = -1;

function hideSuggest() {
  $("recipient-suggest").classList.add("hidden");
  suggestActive = -1;
}

function pickContact(c) {
  $("f-recipient-name").value = c.name || "";
  $("f-recipient-address").value = c.address || "";
  hideSuggest();
  renderPreview();
}

function updateSuggest() {
  const q = $("f-recipient-name").value.trim().toLowerCase();
  const box = $("recipient-suggest");
  if (!q) {
    hideSuggest();
    return;
  }
  const matches = contacts
    .filter((c) => (c.name || "").toLowerCase().includes(q))
    .slice(0, 8);
  // Don't show a single exact match (nothing to pick).
  if (!matches.length || (matches.length === 1 && matches[0].name.toLowerCase() === q)) {
    hideSuggest();
    return;
  }
  suggestActive = -1;
  box.innerHTML = matches
    .map(
      (c, i) => `
      <div class="suggest-item" data-id="${esc(c.id)}" data-i="${i}">
        <span class="suggest-name">${esc(c.name)}</span>
        ${c.address ? `<span class="suggest-addr">${esc(c.address.split("\n")[0])}</span>` : ""}
      </div>`,
    )
    .join("");
  box.classList.remove("hidden");
}

function moveSuggest(delta) {
  const items = $("recipient-suggest").querySelectorAll(".suggest-item");
  if (!items.length) return;
  suggestActive = (suggestActive + delta + items.length) % items.length;
  items.forEach((el, i) => el.classList.toggle("active", i === suggestActive));
}

function chooseActiveSuggest() {
  const items = $("recipient-suggest").querySelectorAll(".suggest-item");
  if (suggestActive < 0 || suggestActive >= items.length) return false;
  const id = items[suggestActive].getAttribute("data-id");
  const c = contacts.find((x) => x.id === id);
  if (c) pickContact(c);
  return true;
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
  showView("letter");
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
    if (res && res.saved) await maybeSaveCurrentContact();
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
    if (res && res.saved) await maybeSaveCurrentContact();
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
  contacts = (await window.letterhead.loadContacts()) || [];

  // Letter defaults.
  $("f-date").value = todayFormatted();
  $("f-delivery").value = "VIA ELECTRONIC MAIL";
  $("f-closing").value = settings.closing || "Very truly yours,";
  $("f-signname").value = settings.signName || "";

  // Live preview on any input.
  document
    .querySelectorAll("#letter-fields input, #letter-fields textarea")
    .forEach((el) => el.addEventListener("input", renderPreview));

  // Navigation + settings buttons.
  $("btn-settings").addEventListener("click", () => showView("settings"));
  $("btn-contacts").addEventListener("click", () => showView("contacts"));
  $("btn-cancel-settings").addEventListener("click", () => showView("letter"));
  $("btn-save-settings").addEventListener("click", saveSettingsFromForm);
  $("btn-export").addEventListener("click", exportPdf);
  $("btn-export-docx").addEventListener("click", exportDocx);

  // Contacts manager.
  $("btn-contacts-back").addEventListener("click", () => showView("letter"));
  $("btn-add-contact").addEventListener("click", addOrUpdateContact);
  $("btn-contact-clear").addEventListener("click", resetContactForm);
  $("contacts-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    if (btn.getAttribute("data-act") === "edit") editContact(id);
    else deleteContact(id);
  });

  // Save the current recipient as a contact from the letter screen.
  $("btn-save-contact").addEventListener("click", async () => {
    const status = $("contact-status");
    const result = await maybeSaveCurrentContact();
    status.textContent =
      result === "added" ? "Contact saved." :
      result === "updated" ? "Contact updated." :
      result === "exists" ? "Already in contacts." :
      "Enter a recipient name first.";
    setTimeout(() => (status.textContent = ""), 2500);
  });

  // Recipient autocomplete.
  const nameEl = $("f-recipient-name");
  nameEl.addEventListener("input", updateSuggest);
  nameEl.addEventListener("focus", updateSuggest);
  nameEl.addEventListener("blur", () => setTimeout(hideSuggest, 150));
  nameEl.addEventListener("keydown", (e) => {
    if ($("recipient-suggest").classList.contains("hidden")) return;
    if (e.key === "ArrowDown") { e.preventDefault(); moveSuggest(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveSuggest(-1); }
    else if (e.key === "Enter") { if (chooseActiveSuggest()) e.preventDefault(); }
    else if (e.key === "Escape") { hideSuggest(); }
  });
  $("recipient-suggest").addEventListener("mousedown", (e) => {
    const item = e.target.closest(".suggest-item");
    if (!item) return;
    e.preventDefault();
    const c = contacts.find((x) => x.id === item.getAttribute("data-id"));
    if (c) pickContact(c);
  });

  // Auto-format pasted body text.
  $("f-body").addEventListener("paste", (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (!text || (!text.includes("\n") && text.length < 120)) return; // leave small inline pastes alone
    e.preventDefault();
    const formatted = formatBodyText(text);
    if (!document.execCommand("insertText", false, formatted)) {
      const el = $("f-body");
      const s = el.selectionStart;
      el.value = el.value.slice(0, s) + formatted + el.value.slice(el.selectionEnd);
      el.selectionStart = el.selectionEnd = s + formatted.length;
    }
    renderPreview();
  });

  // Reformat whatever is currently in the body.
  $("btn-reformat").addEventListener("click", () => {
    $("f-body").value = formatBodyText($("f-body").value);
    renderPreview();
  });

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

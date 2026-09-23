// Runs on a single product page. Works out whether the wanted size (e.g. 38R)
// is in stock, and what fit the suit is. Returns:
//   { size: 'yes' | 'no' | 'unknown', fit: 'slim' | 'regular' | 'extra_slim' | 'other' | null, used: bool }
(opts) => {
  const { chest, lenRe, eu } = opts;           // e.g. 38, "R|Reg|Regular", 48
  // "38R", "38 R", "38 Regular", "38 Reg", "38-Regular", "IT 48", "EU 48"
  const SIZE = new RegExp(`^\\s*(?:${chest}\\s?[-/]?\\s?(?:${lenRe})\\b|(?:IT|EU)\\s?${eu}\\b)`, 'i');
  const SIZE_ANY = new RegExp(`(?:^|[^\\d])${chest}\\s?[-/]?\\s?(?:${lenRe})(?![a-z])|(?:IT|EU)\\s?${eu}\\b`, 'i');
  const OTHER_SIZES = new RegExp(`\\b(?!${chest}\\b)(3[4-9]|4[0-9]|5[0-4])\\s?(R|S|L|Regular|Short|Long)\\b`);
  const OTHER_SIZES_HTML = new RegExp(`\\b(?!${chest}\\b)(3[4-9]|4[0-9]|5[0-4])\\s?(Regular|Short|Long)\\b|"(?!${chest})(3[4-9]|4[0-9]|5[0-4])[RSL]"`);
  const NEG_TEXT = /sold ?out|unavailable|out of stock|not available|notify me|waitlist/i;
  const NEG_CLASS = /(disabled|unavailable|unselectable|not-selectable|sold-?out|soldout|out-of-stock|outofstock|not-available|notavailable|strikethrough|crossed|is-oos\b)/i;

  const flaggedUnavailable = el => {
    for (let n = el, d = 0; n && d < 4; n = n.parentElement, d++) {
      if (n.disabled || n.getAttribute('aria-disabled') === 'true') return true;
      if (/false/i.test(n.getAttribute('data-available') || n.getAttribute('data-instock') || '')) return true;
      const label = `${n.getAttribute('aria-label') || ''} ${n.getAttribute('title') || ''}`;
      if (NEG_TEXT.test(label)) return true;
      if (NEG_CLASS.test(typeof n.className === 'string' ? n.className : '')) return true;
      if (d === 0 && NEG_TEXT.test(n.innerText || n.textContent || '')) return true;
    }
    return false;
  };

  // ---- 1) Size buttons / dropdown options on the page ----
  let domHits = 0, domAvailable = 0;
  document.querySelectorAll('button, option, li, label, a, span, div, input[type=radio]').forEach(el => {
    const txt = (el.tagName === 'INPUT' ? (el.value || el.getAttribute('aria-label') || '') : (el.innerText || el.textContent || '')).trim();
    if (!txt || txt.length > 45 || !SIZE.test(txt)) return;
    // A label listing several sizes ("38R / 40R / 42R") is a container, not the 38R choice.
    if (OTHER_SIZES.test(txt.replace(SIZE, ''))) return;
    if (el.tagName === 'DIV' || el.tagName === 'SPAN') {
      // Only leaf-ish nodes; skip containers that hold the whole size list.
      if (el.children.length > 2) return;
    }
    domHits++;
    if (!flaggedUnavailable(el)) domAvailable++;
  });

  // ---- 2) Size/stock data embedded in the page source (JSON) ----
  const html = document.documentElement.innerHTML.replace(/\\"/g, '"');
  const POS = /"status":"SELLABLE"|sellable(Items|Skus)":\["|InStock|"(is)?[aA]vailable":true|"inStock":true|"stock":[1-9]|"quantity":[1-9]|"orderable":true/;
  const NEG = /SOLD_?OUT|"soldOut":true|OutOfStock|"(is)?[aA]vailable":false|"inStock":false|"stock":0\b|"quantity":0\b|"orderable":false|NOT_SELLABLE/;
  const tokenRe = new RegExp(`"[^"]{0,20}(?:${chest}\\s?(?:${lenRe})|(?:IT|EU)\\s?${eu})"`, 'gi');
  const nextSize = new RegExp(`"[^"]{0,20}\\b(3[4-9]|4[0-9]|5[0-4])\\s?(R|S|L|Regular|Short|Long|IT)\\b[^"]{0,5}"`);
  let jsonPos = 0, jsonNeg = 0, m;
  let guard = 0;
  while ((m = tokenRe.exec(html)) && guard++ < 60) {
    let win = html.slice(m.index + m[0].length, m.index + m[0].length + 700);
    const cut = win.search(nextSize);
    if (cut > 0) win = win.slice(0, cut);
    const p = POS.test(win), n = NEG.test(win);
    if (p && !n) jsonPos++; else if (n && !p) jsonNeg++;
  }

  const bodyText = document.body.innerText || '';
  let size = 'unknown';
  if (domHits) size = domAvailable && !(jsonNeg && !jsonPos) ? 'yes' : 'no';
  else if (jsonPos) size = 'yes';
  else if (jsonNeg) size = 'no';
  else if ((OTHER_SIZES.test(bodyText) || OTHER_SIZES_HTML.test(html)) && !SIZE_ANY.test(bodyText + ' ' + html)) size = 'no';

  // ---- Fit ----
  const h1 = document.querySelector('h1');
  let detail = (h1 ? h1.innerText : document.title) + '\n';
  const meta = document.querySelector('meta[name="description"], meta[property="og:description"]');
  if (meta) detail += meta.content + '\n';
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    const d = (s.textContent.match(/"description"\s*:\s*"([^"]{0,2000})/) || [])[1];
    if (d) detail += d + '\n';
  });
  // Text just after the product title (details section), not recommendation carousels further down.
  if (h1) {
    const i = bodyText.indexOf(h1.innerText.trim());
    if (i >= 0) detail += bodyText.slice(i, i + 4000);
  }
  const fm = detail.match(/(extra|super)[\s-]?slim|skinny|slim[\s-]?fit|regular[\s-]?fit|classic[\s-]?fit|(modern|tailored|relaxed|comfort)[\s-]?fit/i);
  let fit = null;
  if (fm) {
    const f = fm[0].toLowerCase();
    fit = /extra|super|skinny/.test(f) ? 'extra_slim' : /slim/.test(f) ? 'slim' : /regular|classic/.test(f) ? 'regular' : 'other';
  }

  const used = /pre-?owned|\bused\b|gently worn/i.test(h1 ? h1.innerText : document.title)
    || /condition:?\s*(pre-?owned|used|good|fair|very good|excellent)/i.test(bodyText.slice(0, 20000));
  return { size, fit, used, domHits, jsonPos, jsonNeg };
}

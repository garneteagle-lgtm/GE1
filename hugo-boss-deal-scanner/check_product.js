// Runs on a single product page. Works out what fit the suit is and whether the
// listing is new. Returns:
//   { fit: 'slim' | 'regular' | 'extra_slim' | 'other' | null, used: bool }
() => {
  const bodyText = document.body.innerText || '';

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
  return { fit, used };
}

() => {
  const PRICE_RE = /(?:US\s?)?\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/g;
  const toNum = s => parseFloat(s.replace(/[^0-9.]/g, ''));
  const out = [];
  const imgUrl = (img) => {
    if (!img) return '';
    const fromSet = v => (v || '').split(',').map(x => x.trim().split(' ')[0]).filter(Boolean).pop() || '';
    const cands = [img.currentSrc, img.src, img.dataset.src, img.dataset.lazySrc, img.dataset.original,
                   fromSet(img.getAttribute('srcset')), fromSet(img.dataset.srcset),
                   fromSet(img.closest('picture') && img.closest('picture').querySelector('source') && img.closest('picture').querySelector('source').srcset)];
    const u = cands.find(c => c && /^https?:/.test(c) && !/placeholder|blank|spacer|transparent|1x1/i.test(c));
    return u ? new URL(u, location.href).href : '';
  };
  const seen = new Set();

  // 1) JSON-LD structured data
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const t = [].concat(node['@type'] || []);
    if (t.includes('Product')) {
      let offers = [].concat(node.offers || []);
      let prices = [];
      offers.forEach(o => {
        if (o.price) prices.push(parseFloat(o.price));
        if (o.lowPrice) prices.push(parseFloat(o.lowPrice));
        if (o.highPrice) prices.push(parseFloat(o.highPrice));
      });
      prices = prices.filter(p => p > 0);
      if (node.name && prices.length) {
        const img = [].concat(node.image || [])[0];
        out.push({ name: String(node.name), url: node.url || (offers[0] && offers[0].url) || '',
                   price: Math.min(...prices), was: null,
                   image: typeof img === 'string' ? img : (img && img.url) || '', src: 'ld' });
      }
    }
    Object.values(node).forEach(walk);
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try { walk(JSON.parse(s.textContent)); } catch (e) {}
  });

  // 2) Visual product cards: links near prices
  const links = Array.from(document.querySelectorAll('a[href]'));
  for (const a of links) {
    const href = a.href;
    if (!href || href.startsWith('javascript') || seen.has(href)) continue;
    let card = a, depth = 0;
    while (card && depth < 8) {
      const txt = card.innerText || '';
      if (PRICE_RE.test(txt)) { PRICE_RE.lastIndex = 0; break; }
      PRICE_RE.lastIndex = 0;
      card = card.parentElement; depth++;
    }
    if (!card || depth >= 8) continue;
    // a card should hold only one product
    const productLinks = new Set(Array.from(card.querySelectorAll('a[href]')).map(x => x.href.split('?')[0].split('#')[0]));
    if (productLinks.size > 4) continue;
    const text = (card.innerText || '').trim();
    if (text.length > 800) continue;
    const priceText = text.split('\n').filter(l => !/save|\boff\b|earn|reward|shipping|klarna|afterpay|affirm|installment|\/mo|per month|or \d+ payments/i.test(l)).join('\n');
    const prices = [...priceText.matchAll(PRICE_RE)].map(m => toNum(m[1])).filter(p => p > 0);
    if (!prices.length) continue;
    // struck-through price = original
    let was = null;
    card.querySelectorAll('s, del, strike, [class*="strike" i], [class*="original" i], [class*="was" i], [class*="compare" i], [class*="list-price" i], [class*="regular" i], [style*="line-through"]').forEach(el => {
      const m = (el.innerText || '').match(/\$\s?([\d,]+(?:\.\d{2})?)/);
      if (m) was = Math.max(was || 0, toNum(m[1]));
    });
    const price = Math.min(...prices);
    const maxP = Math.max(...prices);
    if (!was && maxP > price) was = maxP;
    const img = card.querySelector('img');
    const JUNK = /quick ?shop|add to (bag|cart)|^sale|% ?off|^-?\d+%|sponsored|rating|reviews?\b|^\(\d+\)$|colors?\b|^new$|free shipping|^\d(\.\d)?$/i;
    const cands = [a.getAttribute('aria-label'), a.getAttribute('title'), img && img.alt, a.innerText, ...text.split('\n')]
      .map(s => (s || '').replace(/,?\s*Image$/i, '').trim())
      .filter(s => s.length > 5 && s.length < 200 && !/\$\s?\d/.test(s) && !JUNK.test(s));
    const name = cands.find(s => /suit/i.test(s)) || cands.sort((x, y) => y.length - x.length)[0] || '';
    PRICE_RE.lastIndex = 0;
    seen.add(href);
    out.push({ name: name.slice(0, 200), url: href, price, was: was && was > price ? was : null,
               image: imgUrl(img), src: 'card', card: text.slice(0, 300) });
  }
  return out;
}

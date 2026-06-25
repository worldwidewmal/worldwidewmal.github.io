# worldwidewmal.com — Security & Quality Baseline
# Established: 2026-06-10 after Pass 1–4 audit

## Active Protections in index.html

### Frame Protection
- Frame-buster script in <head> BEFORE the CSP tag: `if(window.top!==window.self){...}`

### Content Security Policy (meta tag — GitHub Pages cannot set HTTP headers)
```
default-src 'self'
script-src 'self' 'unsafe-inline' https://js.stripe.com
style-src 'self' 'unsafe-inline'
font-src 'self'
img-src 'self' data: https://img.youtube.com https://i.ytimg.com
frame-src https://www.youtube.com https://js.stripe.com https://hooks.stripe.com
connect-src 'self' https://api.web3forms.com https://api.stripe.com https://m.stripe.com https://m.stripe.network https://q.stripe.com
form-action 'self'
base-uri 'self'
object-src 'none'
```

### Referrer Policy
- `<meta name="referrer" content="strict-origin-when-cross-origin"/>` — only sends origin (no path/query) to cross-origin requests

### Self-Hosted Fonts
- Google Fonts dependency removed completely
- Fonts served from /fonts/ in the same repo:
  - cg-normal-latin.woff2 (37K) — Cormorant Garamond normal 200–400
  - cg-italic-latin.woff2 (22K) — Cormorant Garamond italic 200–300
  - dm-sans-latin.woff2 (62K) — DM Sans 300–600
- @font-face declarations inline at top of <style> block
- No outbound requests to googleapis.com or gstatic.com

### Asset Architecture
- All 20 photos extracted from base64 to /assets/img/photo-NN.jpg
- index.html is ~290KB (was 4.7MB with embedded base64)
- Below-fold images use loading="lazy" decoding="async"; hero image stays eager
- logo.png at repo root (1254x1254 PNG) — referenced by og:image and hero
- All email inputs have maxlength="254" (RFC 5321 limit)
- NEVER re-embed images as base64 data URIs — always use /assets/img/ files

### XSS Prevention
- `escHtml(s)` helper defined in BOTH the first script block (line ~1740) AND script block 4 for belt-and-suspenders coverage
- All dynamic innerHTML uses escHtml() on user-controlled or external values
- `ugcPortfolio.map()` wraps every interpolated value in escHtml()
- YouTube video IDs validated with `/^[a-zA-Z0-9_-]{11}$/` before use in src
- `?plan=` URL param validated against allowlist `['starter','core','concierge']`
- `showWaitlistModal(tier)` validates tier against planNames object before use

### Tab-Nabbing Prevention
- All `<a target="_blank">` tags have `rel="noopener noreferrer"`
- All `window.open()` calls use `'noopener,noreferrer'` as third argument

### Array Bounds Checks
- `renderUGCPortfolio` click handler: `if(isNaN(idx)||idx<0||idx>=ugcPortfolio.length) return`
- Fan stack click handler: same bounds check before accessing ugcPortfolio[ci]

### Rate Limiting (localStorage, 60-second cooldown per form)
- ww_sub_intake (intake form)
- ww_sub_ugc (UGC inquiry form)
- ww_sub_wl (waitlist modal)
- ww_sub_contact (contact form)
- ww_sub_lead (free routes lead form)

### Form Submissions — ALL wired to Web3Forms
- All 5 forms POST to https://api.web3forms.com/submit
- access_key: '43898b71-02c7-419d-8c4b-6ee3b1ca6121'
- botcheck: '' field present on all submissions
- All fetch() calls have .catch() error handlers

### Autocomplete Attributes
- All name inputs: autocomplete="name"
- All email inputs: autocomplete="email"
- Brand/company inputs: autocomplete="organization"
- Travel-specific / project-specific fields: autocomplete="off"

### Accessibility
- All 4 modals have role="dialog" aria-modal="true" aria-label on correct element:
  - #modal-overlay: role/aria-modal/aria-label on outer div
  - #ww-cart: role/aria-modal/aria-label on outer div
  - #ww-vid-modal: role/aria-modal/aria-label on outer div
  - #yt-modal: outer div uses aria-hidden toggle; inner .yt-modal-box has role/aria-modal/aria-label
- All icon-only close buttons have aria-label="Close" or aria-label="Close video"
- YouTube video IDs validated before iframe src assignment
- Modal overlay aria-hidden toggled correctly in openYTModal/closeYTModal

### SEO / Meta
- <link rel="canonical" href="https://worldwidewmal.com/"/>
- Full OG (og:type, og:url, og:title, og:description, og:image, og:site_name)
- Full Twitter Card (summary_large_image)
- robots.txt at root: Allow all, points to sitemap
- sitemap.xml at root: worldwidewmal.com/

### Jekyll Config (_config.yml)
- Excludes from public site: pipeline.csv, suppression-list.csv, data/, reports/,
  routines/, docs/, dashboard/, scripts/, CLAUDE.md, README.md, render.yaml,
  package.json, package-lock.json, .claude/

## Rules for Future Changes

1. Any new form MUST: POST to Web3Forms with access_key + botcheck, have 60s rate limiting
   via localStorage, have a .catch() handler, and have proper autocomplete attributes.
2. Any new innerHTML with dynamic data MUST use escHtml() on every interpolated value.
3. Any new window.open() MUST include 'noopener,noreferrer' as third argument.
4. Any new <a target="_blank"> MUST have rel="noopener noreferrer".
5. Any new modal MUST have role="dialog" aria-modal="true" aria-label="[description]".
6. Any new external domain used in JS (fetch, script, frame, img) MUST be added to the CSP.
7. Any new URL param used in JS MUST be validated against an allowlist before use.
8. The frame-buster script and CSP meta tag MUST remain first in <head>, in that order.
9. Run `node --check` on all modified script blocks before committing.
10. Run Python HTMLParser structural check before committing.

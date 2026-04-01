# Sentinel Scout API — Build Guide for AI Agents

## What is Scout?

Sentinel Scout is a decentralized web scraping API powered by the Sentinel dVPN network. It routes scraping requests through residential/proxy nodes in specific countries, returning the HTML content of any public URL.

**Base URL:** `https://api.scout.sentinel.co`

---

## Authentication

Pass your API key in the `Authorization` header. **No "Bearer" prefix** — raw key only.

```
Authorization: scout-c1_YOUR_KEY_HERE
```

---

## Endpoints

### 1. Scrape a URL (sync)

```
POST /api/v1/probe/sync
```

**Request body (JSON):**

```json
{
  "url": "https://example.com",
  "countryCode": "FR",
  "fallBackRouting": true,
  "antiBotScrape": true,
  "outputFileExtension": "EXTENSION_HTML"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `url` | Yes | Full URL to scrape (must include https://) |
| `countryCode` | Yes | ISO 2-letter country code for the exit node |
| `fallBackRouting` | Recommended | Allow fallback to nearby nodes if primary unavailable |
| `antiBotScrape` | Recommended | Enable anti-bot evasion features |
| `outputFileExtension` | **Yes** | Must be `"EXTENSION_HTML"`. Omitting this causes code 3 error |

**Successful response:**

```json
{
  "user_id": "416",
  "state": "complete",
  "url": "https://example.com",
  "task_uuid": "uuid-here",
  "country_code": "FR",
  "data_processed": "45231",
  "doc_processed": "1",
  "file_content": "<html>...scraped HTML content...</html>"
}
```

**Failed response:**

```json
{
  "code": 13,
  "message": "error scraping website"
}
```

**Key response fields:**
- `state` — `"complete"` on success
- `file_content` — the scraped HTML (snake_case, NOT camelCase)
- `code` — error code on failure (see error codes below)

**Success check:**
```javascript
const success = data.state === 'complete' && (data.file_content || '').length > 100;
```

### 2. Check Account / Credits

```
GET /api/v1/user
```

Returns:
```json
{
  "credit_coin": 91.65,
  "completed_jobs": 256,
  "failed_jobs": 990,
  "total_jobs": 1249
}
```

---

## Working Country Codes

**Only 3 country codes have working proxy pools (as of March 2026):**

| Code | Country | Success Rate |
|------|---------|-------------|
| `FR` | France | ~30% |
| `DE` | Germany | ~30% |
| `GB` | United Kingdom | ~30% |

All other codes (US, CA, NL, SE, ES, IT, JP, AU, BR, IN, etc.) return immediate failures. Do not use them.

---

## Error Codes

| Code | Meaning | What to do |
|------|---------|------------|
| 3 | Missing required field | Add `outputFileExtension: "EXTENSION_HTML"` |
| 13 | Error scraping website | Site blocked the scrape OR proxy pool exhausted |
| 14 | Proxy unavailable | No proxy nodes available in that country |

### Interpreting Code 13

Code 13 has two sub-causes:

1. **Instant failure (<500ms response)** — Proxy pool exhausted. No proxy was available to attempt the scrape. Retry later or try a different country.
2. **Slow failure (1-5s response)** — The proxy connected but the target website rejected the request. This is anti-bot blocking.

---

## Rate Limits & Best Practices

### Timing
- **5-30 second gap** between requests recommended
- At 5s gaps: works reliably for sequential scraping
- At 0s gaps (parallel): high failure rate due to proxy pool exhaustion
- **Maximum ~3 parallel requests** before success rate drops significantly
- **10+ parallel requests** causes near-100% failure

### Parallelism Strategy
- **Best:** 3 parallel URLs, 1 request each = 3 simultaneous
- **Good:** 1 URL at a time, 3 country probes (FR+DE+GB) = 3 simultaneous
- **Bad:** 10+ URLs x 3 countries = 30+ simultaneous = pool exhausted

### Caching
- Scout caches results for ~4 hours
- Same URL + same country within 4h returns cached result (no credit cost)
- Use this to your advantage: re-requesting a recently scraped URL is free

### Credit Usage
- Each scrape request costs ~1 credit
- Failed requests also cost credits
- Check balance via `GET /api/v1/user` -> `credit_coin`

---

## What Gets Blocked

Based on testing 75 top websites (March 2026):

### Sites that WORK (~25% of top sites)
Google, Bing, DuckDuckGo, Yandex, Reddit, Snapchat, Instagram, LinkedIn, TikTok, Pinterest, x.com, CNN, Indeed, Rightmove, Cloudflare, AWS, OpenAI, Anthropic, Hugging Face

### Sites that are BLOCKED (~75% of top sites)

**Hard blocked (code 13, zero content):**
Amazon, YouTube, Facebook, eBay, Walmart, GitHub, StackOverflow, Spotify, Twitch, Netflix, BBC, Reuters, Wikipedia, etc.

**Soft blocked (content returned but it's a challenge page):**
Bloomberg (bot detection), NYTimes (bot detection + challenge + rate limit), Netflix (captcha + rate limit)

### Block Detection
When `state === "complete"` but content is a block page, check for:
- `captcha`, `recaptcha`, `hcaptcha` in HTML
- `cloudflare` + `challenge` or `ray id`
- `access denied`, `403 forbidden`
- `robot`, `bot detect`
- `enable javascript`, `javascript required`
- `verify you are human`
- `unusual traffic`

---

## Code Examples

### Node.js — Basic Scrape

```javascript
async function scoutScrape(url, countryCode = 'FR') {
  const res = await fetch('https://api.scout.sentinel.co/api/v1/probe/sync', {
    method: 'POST',
    headers: {
      'Authorization': 'scout-c1_YOUR_KEY',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url,
      countryCode,
      fallBackRouting: true,
      antiBotScrape: true,
      outputFileExtension: 'EXTENSION_HTML'
    })
  });
  const data = await res.json();

  if (data.state === 'complete' && data.file_content?.length > 100) {
    return { success: true, html: data.file_content };
  }
  return { success: false, error: data.code || data.message };
}
```

### Node.js — Multi-Country Batch (Best Success Rate)

```javascript
const COUNTRIES = ['FR', 'DE', 'GB'];

async function scoutBatch(url) {
  // Fire all 3 countries in parallel
  const results = await Promise.allSettled(
    COUNTRIES.map(c => scoutScrape(url, c))
  );

  // Return first success
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.success) {
      return r.value;
    }
  }
  return { success: false, error: 'All countries failed' };
}
```

### Python — Basic Scrape

```python
import requests

def scout_scrape(url, country_code='FR'):
    resp = requests.post(
        'https://api.scout.sentinel.co/api/v1/probe/sync',
        headers={
            'Authorization': 'scout-c1_YOUR_KEY',
            'Content-Type': 'application/json'
        },
        json={
            'url': url,
            'countryCode': country_code,
            'fallBackRouting': True,
            'antiBotScrape': True,
            'outputFileExtension': 'EXTENSION_HTML'
        },
        timeout=45
    )
    data = resp.json()
    content = data.get('file_content', '') or ''
    if data.get('state') == 'complete' and len(content) > 100:
        return {'success': True, 'html': content}
    return {'success': False, 'error': data.get('code') or data.get('message')}
```

### cURL

```bash
curl -X POST "https://api.scout.sentinel.co/api/v1/probe/sync" \
  -H "Authorization: scout-c1_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "countryCode": "FR",
    "fallBackRouting": true,
    "antiBotScrape": true,
    "outputFileExtension": "EXTENSION_HTML"
  }'
```

---

## Common Mistakes

1. **Adding "Bearer" prefix** — Don't. Raw key only: `Authorization: scout-c1_...`
2. **Omitting outputFileExtension** — Always include `"EXTENSION_HTML"`. Without it you get code 3.
3. **Using camelCase for response** — The content field is `file_content` (snake_case), not `fileContent`
4. **Too many parallel requests** — Keep under 3-5 simultaneous. More = pool exhaustion = 100% failure.
5. **Using non-working countries** — Only FR, DE, GB work. Everything else fails instantly.
6. **Not checking content quality** — A `state: "complete"` response might still contain a CAPTCHA page instead of real content. Always validate the HTML.

---

## Architecture Notes

- Scout routes requests through Sentinel's decentralized VPN nodes
- Each country code maps to a pool of residential/datacenter proxies in that region
- The proxy pool is shared across all Scout users — high traffic = pool exhaustion
- `antiBotScrape: true` adds browser-like headers and behavior
- `fallBackRouting: true` allows routing through nearby countries if primary pool is empty
- Results are cached server-side for ~4 hours per URL+country combination

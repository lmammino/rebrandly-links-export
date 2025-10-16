import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { format as formatPath, parse as parsePath } from 'node:path'
import { finished } from 'node:stream/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs } from 'node:util'

// ----- CLI -----
const { values } = parseArgs({
  options: {
    workspace: { type: 'string', multiple: true },
    out: { type: 'string' }, // base name used to derive per-workspace files
    'max-page-size': { type: 'string' },
  },
  allowPositionals: false,
})

const apiKey = process.env.REBRANDLY_API_KEY ?? '<<apiKey>>'
const configuredWorkspaces = values.workspace?.length
  ? values.workspace
  : process.env.REBRANDLY_WORKSPACES
    ? process.env.REBRANDLY_WORKSPACES.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
const baseOut = values.out ?? process.env.REBRANDLY_EXPORT_BASE ?? 'rebrandly-links.csv'
const MAX_PAGE_SIZE = Number(
  values['max-page-size'] ?? process.env.REBRANDLY_MAX_PAGE_SIZE ?? 25,
)

// ----- CSV config -----
const fieldnames = ['id', 'createdAt', 'shortUrl', 'domain', 'slashtag', 'destination']

// ----- Helpers -----
function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function extractDomain(shortUrl) {
  if (!shortUrl) return ''
  try {
    // Add protocol if missing for URL parsing
    const urlWithProtocol = shortUrl.startsWith('http') ? shortUrl : `https://${shortUrl}`
    const url = new URL(urlWithProtocol)
    return url.hostname
  } catch {
    return ''
  }
}
function extractSlashtag(shortUrl) {
  if (!shortUrl) return ''
  try {
    // Add protocol if missing for URL parsing
    const urlWithProtocol = shortUrl.startsWith('http') ? shortUrl : `https://${shortUrl}`
    const url = new URL(urlWithProtocol)
    // Remove leading slash from pathname
    return url.pathname.substring(1)
  } catch {
    return ''
  }
}
function toCsvRow(obj, fields) {
  return fields
    .map((f) => {
      if (f === 'domain') {
        return csvEscape(extractDomain(obj?.shortUrl))
      }
      if (f === 'slashtag') {
        return csvEscape(extractSlashtag(obj?.shortUrl))
      }
      return csvEscape(obj?.[f] ?? '')
    })
    .join(',')
}
async function writeChunk(stream, chunk) {
  if (!stream.write(chunk)) await once(stream, 'drain')
}
function safeSlug(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, '-')
}
function outPathForWorkspace(base, workspaceId) {
  if (!workspaceId) return base // default workspace -> use base filename
  const p = parsePath(base)
  const suffixed = `${p.name}-${safeSlug(workspaceId)}${p.ext || ''}`
  return formatPath({ ...p, base: undefined, name: suffixed, ext: '' })
}

// ----- API -----
async function discoverWorkspaces() {
  const headers = {
    'Content-Type': 'application/json',
    apikey: apiKey,
  }

  const params = new URLSearchParams({
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit: '100', // fetch up to 100 workspaces
  })

  const url = `https://api.rebrandly.com/v1/workspaces?${params}`

  // Minimal retry / backoff for 429 and 5xx
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers })
    if (res.ok) {
      const workspaces = await res.json()
      return workspaces.map((ws) => ws.id)
    }

    if (res.status === 429 || res.status >= 500) {
      await delay(500 * attempt)
      continue
    }
    const text = await res.text().catch(() => '')
    throw new Error(`Fetch workspaces failed (status ${res.status}). ${text}`)
  }
  throw new Error('Fetch workspaces failed after retries.')
}

async function downloadLinksAfter({ lastLink, workspaceId }) {
  const last = lastLink?.id ?? ''
  const headers = {
    'Content-Type': 'application/json',
    apikey: apiKey,
  }
  if (workspaceId) headers.workspace = workspaceId

  const params = new URLSearchParams({
    limit: String(MAX_PAGE_SIZE),
    last,
    orderBy: 'createdAt',
    orderDir: 'desc',
  })

  const url = `https://api.rebrandly.com/v1/links?${params}`

  // Minimal retry / backoff for 429 and 5xx
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers })
    if (res.ok) return res.json()

    if (res.status === 429 || res.status >= 500) {
      await delay(500 * attempt)
      continue
    }
    const text = await res.text().catch(() => '')
    throw new Error(`Fetch failed (status ${res.status}). ${text}`)
  }
  throw new Error('Fetch failed after retries.')
}

// ----- Export logic -----
async function exportWorkspace(workspaceId, outPath) {
  const out = createWriteStream(outPath, { encoding: 'utf8' })
  let totalExported = 0

  try {
    await writeChunk(out, `${fieldnames.join(',')}\n`)

    let lastDownloaded = null
    let pageCount = 0

    while (true) {
      const downloaded = await downloadLinksAfter({
        lastLink: lastDownloaded,
        workspaceId,
      })
      if (!downloaded || downloaded.length === 0) break

      const lines = downloaded
        .map((link) => toCsvRow(link, fieldnames))
        .join('\n')
      await writeChunk(out, lines + '\n')

      totalExported += downloaded.length
      pageCount++

      // Progress indicator: show dots and count
      process.stdout.write(
        `\r  Fetched ${totalExported} links (page ${pageCount})...`,
      )

      lastDownloaded = downloaded[downloaded.length - 1]
    }

    // Clear the progress line and show final count
    process.stdout.write(`\r  Exported ${totalExported} links to ${outPath}\n`)
  } finally {
    out.end()
    await finished(out)
  }

  return totalExported
}

if (!apiKey || apiKey === '<<apiKey>>') {
  console.error('Error: missing API key. Set REBRANDLY_API_KEY environment variable.')
  process.exit(1)
}

// Determine which workspaces to export
let targets
if (configuredWorkspaces.length > 0) {
  // Use explicitly configured workspaces
  targets = configuredWorkspaces
  console.log(`Exporting ${targets.length} configured workspace${targets.length === 1 ? '' : 's'}...\n`)
} else {
  // Auto-discover workspaces
  console.log('No workspaces specified. Discovering workspaces...')
  targets = await discoverWorkspaces()
  if (targets.length === 0) {
    console.error('No workspaces found.')
    process.exit(1)
  }
  console.log(`Found ${targets.length} workspace${targets.length === 1 ? '' : 's'}.\n`)
}

// Run sequentially (gentler on rate limits)
let totalLinks = 0
for (const ws of targets) {
  const outPath = outPathForWorkspace(baseOut, ws)
  console.log(`Exporting workspace ${ws}...`)
  const count = await exportWorkspace(ws, outPath)
  totalLinks += count
}

console.log(`\nDone! Exported ${totalLinks} total links.`)

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search'
const CONTACT_PATHS = ['/contact', '/contact-us', '/about', '/about-us']
const REQUEST_TIMEOUT_MS = 6000
const NON_COMPANY_DOMAINS = [
  'linkedin.com', 'facebook.com', 'instagram.com', 'threads.net', 'x.com', 'twitter.com',
  'indiamart.com', 'justdial.com', 'yelp.com', 'reddit.com', 'crunchbase.com',
  'revenuebase.ai', 'superbcompanies.com', 'clutch.co'
]
const NON_COMPANY_PAGE_PATTERN = /\b(?:top\s+\d+|best\s+\d+|directory|list\s+of\s+companies|market\s+(?:size|report|forecast)|industry\s+report)\b/i

function isPublicWebUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    const hostname = url.hostname.toLowerCase()
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return false

    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (ipv4) {
      const [, first, second] = ipv4.map(Number)
      if (first === 10 || first === 127 || first === 0 || (first === 169 && second === 254)) return false
      if (first === 192 && second === 168) return false
      if (first === 172 && second >= 16 && second <= 31) return false
    }

    return true
  } catch {
    return false
  }
}

function normalizePhone(value, geography = '') {
  const trimmed = value.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return null

  if (/india/i.test(geography)) {
    const nationalNumber = digits.length === 10
      ? digits
      : digits.length === 11 && digits.startsWith('0')
        ? digits.slice(1)
        : digits.length === 12 && digits.startsWith('91')
          ? digits.slice(2)
          : null
    if (nationalNumber) return `+91 ${nationalNumber.slice(0, 5)} ${nationalNumber.slice(5)}`
  }

  if (trimmed.startsWith('+')) return `+${digits}`
  return trimmed.replace(/[\s().-]/g, '')
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function extractContactDetails(content, geography) {
  const mailtoMatches = [...content.matchAll(/mailto:([^?'"\s>]+)/gi)]
    .map((match) => safeDecode(match[1]))
  const text = content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&commat;/gi, '@')
    .replace(/&#64;/g, '@')
    .replace(/&period;/gi, '.')
    .replace(/&#46;/g, '.')

  const emailMatches = [...mailtoMatches, ...(text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [])]
  const email = emailMatches.find((value) => !/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(value)) || null
  const telMatches = [...content.matchAll(/tel:([^?'"\s>]+)/gi)].map((match) => safeDecode(match[1]))
  const labeledPhoneMatches = [...text.matchAll(/(?:phone|telephone|tel|call|mobile|whatsapp)[^\d+\n]{0,25}(\+?\d[\d\s().-]{5,}\d)/gi)]
    .map((match) => match[1])
  const formattedPhoneMatches = text.match(/(?:\+\d{1,3}[\s().-]*)?(?:\(\d{2,5}\)|\d{2,5})[\s.-]+\d{3,5}[\s.-]+\d{3,5}/g) || []
  const phoneMatches = [...telMatches, ...labeledPhoneMatches, ...formattedPhoneMatches]
  const phone = phoneMatches
    .map((value) => normalizePhone(value, geography))
    .find(Boolean) || null

  return { email, phone }
}

function companyDomainMatchesName(hostname, companyName) {
  const stopWords = new Set(['inc', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'company', 'co', 'group', 'holdings', 'services', 'service', 'solutions', 'technologies', 'technology', 'healthcare', 'health', 'systems'])
  const nameTokens = companyName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !stopWords.has(token))
  const domain = hostname.toLowerCase().replace(/[^a-z0-9]/g, '')
  return nameTokens.length > 0 && nameTokens.every((token) => domain.includes(token))
}

function resultLooksLikeOfficialCompanySite(result, companyName) {
  if (!isPublicWebUrl(result.url)) return false
  const hostname = new URL(result.url).hostname.toLowerCase().replace(/^www\./, '')
  if (NON_COMPANY_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) return false

  const resultText = `${result.title || ''} ${result.content || ''}`
  if (NON_COMPANY_PAGE_PATTERN.test(resultText)) return false
  if (!companyDomainMatchesName(hostname, companyName)) return false

  const normalizedResultText = resultText.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  const companyTokens = companyName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !['inc', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'company', 'co', 'group', 'holdings', 'services', 'service', 'solutions', 'technologies', 'technology', 'healthcare', 'health', 'systems'].includes(token))
  return companyTokens.length > 0 && companyTokens.every((token) => normalizedResultText.includes(token))
}

async function findOfficialCompanyWebsite(lead, apiKey) {
  const companyName = (lead.companyName || lead.company || '').trim()
  if (!companyName) return { website: null, verification: null }

  const sourceUrl = lead.contactUrl || lead.sourceUrl
  if (isPublicWebUrl(sourceUrl)) {
    const source = new URL(sourceUrl)
    const sourceHost = source.hostname.toLowerCase().replace(/^www\./, '')
    if (lead.sourceIsCompanySite) {
      return { website: source.origin, verification: 'Groq classified source as the company website' }
    }
    if (companyDomainMatchesName(sourceHost, companyName)) {
      return { website: source.origin, verification: 'Company name matches source domain' }
    }
  }

  if (!apiKey?.trim()) return { website: null, verification: null }
  const query = `"${companyName}" official company website ${lead.location || ''}`.trim()
  try {
    const response = await fetch(TAVILY_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        api_key: apiKey.trim(),
        query,
        topic: 'general',
        search_depth: 'basic',
        max_results: 5,
        include_answer: false,
        include_raw_content: false
      })
    })
    if (!response.ok) return { website: null, verification: null }

    const payload = await response.json().catch(() => ({}))
    const officialResult = (payload.results || []).find((result) => resultLooksLikeOfficialCompanySite(result, companyName))
    if (!officialResult) return { website: null, verification: null }

    return {
      website: new URL(officialResult.url).origin,
      verification: 'Tavily official-site lookup matched company name to domain'
    }
  } catch {
    return { website: null, verification: null }
  }
}

async function fetchPage(url) {
  if (!isPublicWebUrl(url)) return ''

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ClientFinderContactLookup/1.0 (+public business contact lookup)' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error'
    })
    if (!response.ok) return ''
    return (await response.text()).slice(0, 500_000)
  } catch {
    return ''
  }
}

async function scrapeCompanySite(website, geography) {
  if (!isPublicWebUrl(website)) return { email: null, phone: null }

  const origin = new URL(website).origin
  const details = { email: null, phone: null }
  for (const path of [...CONTACT_PATHS, '/']) {
    const page = await fetchPage(`${origin}${path}`)
    const found = extractContactDetails(page, geography)
    details.email ||= found.email
    details.phone ||= found.phone
    if (details.email && details.phone) break
  }

  return details
}

async function searchCompanyContacts(lead, apiKey, geography, officialWebsite) {
  if (!apiKey?.trim() || !officialWebsite) return { email: null, phone: null }

  const companyName = lead.companyName || lead.company
  if (!companyName) return { email: null, phone: null }
  const officialHost = new URL(officialWebsite).hostname.replace(/^www\./, '')
  const query = `site:${officialHost} "${companyName}" contact email phone ${geography || ''}`.trim()
  try {
    const response = await fetch(TAVILY_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        api_key: apiKey.trim(),
        query,
        topic: 'general',
        search_depth: 'basic',
        max_results: 3,
        include_answer: false,
        include_raw_content: false
      })
    })

    if (!response.ok) return { email: null, phone: null }
    const payload = await response.json().catch(() => ({}))
    const details = (payload.results || [])
      .filter((result) => {
        const resultHost = new URL(result.url).hostname.replace(/^www\./, '')
        return resultHost === officialHost || resultHost.endsWith(`.${officialHost}`)
      })
      .map((result) => extractContactDetails(`${result.title || ''} ${result.content || ''}`, geography))
    return {
      email: details.find((item) => item.email)?.email || null,
      phone: details.find((item) => item.phone)?.phone || null
    }
  } catch {
    return { email: null, phone: null }
  }
}

export async function enrichB2BContact(lead, options = {}) {
  const apiKey = options.apiKey ?? process.env.TAVILY_API_KEY
  const geography = options.geography || lead.location || ''
  const companyName = lead.companyName || lead.company
  const officialSite = await findOfficialCompanyWebsite({ ...lead, companyName, location: geography }, apiKey)
  const siteDetails = await scrapeCompanySite(officialSite.website || '', geography)
  let email = siteDetails.email
  let phone = siteDetails.phone
  let emailSource = email ? 'Company website' : null
  let phoneSource = phone ? 'Company website' : null

  if ((!email || !phone) && apiKey) {
    const tavilyDetails = await searchCompanyContacts(lead, apiKey, geography, officialSite.website)
    if (!email && tavilyDetails.email) {
      email = tavilyDetails.email
      emailSource = 'Tavily contact search'
    }
    if (!phone && tavilyDetails.phone) {
      phone = tavilyDetails.phone
      phoneSource = 'Tavily contact search'
    }
  }

  const sources = [...new Set([emailSource, phoneSource].filter(Boolean))]
  return {
    ...lead,
    company: companyName || lead.company,
    companyName: companyName || lead.companyName,
    website: officialSite.website,
    officialWebsite: officialSite.website,
    websiteVerification: officialSite.verification,
    email,
    phone,
    emailSource,
    phoneSource,
    contactSource: sources.join(' + ') || null,
    contactConfidence: sources.includes('Company website') ? 'Published on company site' : sources.length ? 'Found in web search' : null,
    contactStatus: email || phone ? 'Contact found' : 'No public contact found'
  }
}

export async function enrichB2BContacts(leads, options = {}) {
  return Promise.all((leads || []).map((lead) => enrichB2BContact(lead, options)))
}
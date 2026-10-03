const TAVILY_SEARCH_URL = 'https://api.tavily.com/search'
const NON_COMPANY_DOMAINS = [
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'threads.net',
  'x.com',
  'twitter.com',
  'indiamart.com',
  'justdial.com',
  'yelp.com',
  'reddit.com',
  'crunchbase.com'
]
const LISTICLE_PATTERN = /\b(?:top\s+\d+|best\s+\d+|(?:top|best)\b.{0,80}\b(?:companies|firms|consultants|agencies|providers|vendors|startups|businesses)|companies\s+to\s+watch|list\s+of\s+(?:top\s+)?\d*\s*(?:companies|firms|vendors|providers)|directory\s+of)\b/i
const REPORT_PATTERN = /\b(?:market\s+(?:size|report|forecast)|industry\s+report|(?:alternatives|competitors)\s+(?:to|for))\b/i

function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function isKnownPlatformResult(result) {
  const hostname = getHostname(result.url)
  return !hostname || NON_COMPANY_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
}

function getPageText(result) {
  return `${result.title || ''} ${(result.content || '').slice(0, 1000)} ${(result.raw_content || '').slice(0, 2500)}`
}

function isListicleResult(result) {
  return LISTICLE_PATTERN.test(getPageText(result))
}

function isReportResult(result) {
  return REPORT_PATTERN.test(getPageText(result))
}

function isActionableCompanyResult(result) {
  if (isKnownPlatformResult(result) || isListicleResult(result) || isReportResult(result)) return false
  const pageText = `${result.title || ''} ${(result.content || '').slice(0, 800)}`
  return Boolean(pageText.trim())
}

function buildSearchQuery(profile) {
  const keywords = (profile.keywords || []).slice(0, 5).join(', ')
  const targetSegment = [profile.target_consumer_segment, profile.target_company_size]
    .filter((value) => value && value !== 'N/A')
    .join('; ')
  const profileText = `${profile.category || ''} ${profile.target_consumer_segment || ''} ${(profile.keywords || []).join(' ')}`
  const buyerTypes = /agri|farm|crop|farmer/i.test(profileText)
    ? 'agricultural lenders and banks, crop insurers, agri-input and seed suppliers, farmer producer organizations and cooperatives, food processors, and agritech platforms with farmer distribution networks'
    : 'resellers, distributors, service providers, associations, institutional buyers, and platforms serving the target customer segment'

  return [
    `Find named B2B customer organizations in ${profile.geography} that could purchase, license, distribute, or integrate ${profile.category}`,
    `Potential buyer types: ${buyerTypes}`,
    `Target segment: ${targetSegment}`,
    `Prioritize organizations already serving this segment or showing relevant adoption and partnership signals. Include evidence in the source pages. Exclude direct product competitors, software vendor roundups, and generic market reports.`,
    `Related terms: ${keywords}`
  ].filter(Boolean).join('. ')
}

function normalizeResult(result, index, profile) {
  let hostname = ''
  try {
    hostname = new URL(result.url).hostname.replace(/^www\./, '')
  } catch {
    hostname = 'Web source'
  }

  const title = result.title?.trim() || hostname
  const snippet = result.content?.trim() || 'No summary was provided by the search result.'

  return {
    id: `b2b-tavily-${index}-${Buffer.from(result.url || title).toString('base64url').slice(0, 12)}`,
    name: title,
    type: 'B2B',
    company: hostname,
    companyName: null,
    title: 'Potential buyer or partner',
    location: profile.geography || 'Not specified',
    contactUrl: result.url,
    website: null,
    officialWebsite: null,
    sourceDomain: hostname,
    employeeCount: profile.target_company_size || 'Not available from web search',
    industry: profile.category || 'Not specified',
    fitScore: Math.round(Math.max(0, Math.min(100, (result.score || 0) * 100))),
    reason: snippet,
    tags: ['Tavily web result', 'Potential B2B prospect'],
    raw_data: {
      title: result.title,
      url: result.url,
      content: result.content,
      raw_content: result.raw_content,
      score: result.score
    }
  }
}

export async function searchB2BLeads(profile, apiKey = process.env.TAVILY_API_KEY) {
  if (!apiKey || !apiKey.trim()) {
    return {
      leads: [],
      isLiveTavily: false,
      notice: 'TAVILY_API_KEY is required for B2B web search. Add it to the root .env file.'
    }
  }

  const query = buildSearchQuery(profile)

  try {
    const response = await fetch(TAVILY_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey.trim(),
        query,
        topic: 'general',
        search_depth: 'advanced',
        max_results: 20,
        include_answer: false,
        include_raw_content: true
      })
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = payload.detail || payload.message || `Tavily returned HTTP ${response.status}`
      throw new Error(message)
    }

    const results = Array.isArray(payload.results) ? payload.results : []
    const actionableResults = results.filter(isActionableCompanyResult)
    const listicleSources = results
      .filter((result) => !isKnownPlatformResult(result) && isListicleResult(result))
      .slice(0, 3)
      .map((result) => ({
        title: result.title || '',
        url: result.url || '',
        content: (result.raw_content || result.content || '').slice(0, 6000)
      }))
    const excludedCount = results.length - actionableResults.length - listicleSources.length
    const baseNotice = actionableResults.length === 0
      ? results.length > 0 && listicleSources.length === 0
        ? `Tavily returned ${results.length} pages, but all were filtered because they were social/platform pages, directories, listicles, or reports.`
        : listicleSources.length > 0
          ? `Tavily returned ${listicleSources.length} list page${listicleSources.length === 1 ? '' : 's'} for company extraction.`
          : 'Tavily completed the web search but found no relevant results for this profile.'
      : `B2B results are web matches, not verified buyers. Review the source evidence before outreach.${excludedCount ? ` Filtered out ${excludedCount} social/report pages.` : ''}${listicleSources.length ? ` Kept ${listicleSources.length} list pages for company extraction.` : ''}`

    return {
      leads: actionableResults.map((result, index) => normalizeResult(result, index, profile)),
      listicleSources,
      isLiveTavily: true,
      searchQuery: query,
      excludedCount,
      notice: baseNotice
    }
  } catch (error) {
    const message = error?.message || String(error)
    console.error('[TavilyService] Web search failed:', message)
    return {
      leads: [],
      isLiveTavily: false,
      searchQuery: query,
      notice: `Tavily B2B web search is unavailable: ${message}`
    }
  }
}
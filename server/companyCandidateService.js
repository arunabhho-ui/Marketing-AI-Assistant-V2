import { Groq } from 'groq-sdk'
import { runGroqRequest } from './groqRequestQueue.js'
import { getDiscoveryGroqApiKey } from './groqConfig.js'
import { getVerificationGroqApiKey } from './groqConfig.js'

function normalizeText(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function createListCompanyLead(company, source, profile, index) {
  const evidence = company.evidence.trim()
  return {
    id: `b2b-list-${index}-${Buffer.from(`${source.url}:${company.name}`).toString('base64url').slice(0, 12)}`,
    name: source.title,
    company: company.name.trim(),
    companyName: company.name.trim(),
    type: 'B2B',
    title: 'Potential buyer or partner',
    location: profile.geography || 'Not specified',
    contactUrl: source.url,
    website: null,
    officialWebsite: null,
    sourceDomain: normalizeHostname(source.url),
    sourceTitle: source.title,
    employeeCount: profile.target_company_size || 'Not available from web search',
    industry: profile.category || 'Not specified',
    reason: `Named in "${source.title}". Evidence: ${evidence}`,
    tags: ['Extracted from company list', 'Official site needs verification'],
    raw_data: {
      title: source.title,
      url: source.url,
      content: evidence,
      source_kind: 'listicle_extraction'
    }
  }
}

async function extractWithGroq(sources, profile, apiKey) {
  if (!apiKey?.trim()) return []

  const groq = new Groq({ apiKey: apiKey.trim(), maxRetries: 0 })
  const sourceContent = sources.map((source, index) => ({
    sourceUrl: source.url,
    title: source.title,
    content: source.content.slice(0, 3000),
    index
  }))
  const extractionProfile = {
    category: profile.category,
    geography: profile.geography,
    target_consumer_segment: profile.target_consumer_segment,
    keywords: (profile.keywords || []).slice(0, 4)
  }
  const messages = [
    {
      role: 'system',
      content: 'Extract up to five distinct operating company or organization names explicitly mentioned as entries in each supplied list or ranking page. Do not return the publisher, article author, sponsors, products, or names inferred from outside the provided text. For each company include a short exact evidence quote copied from that source. If the source has no clearly named organizations, return an empty companies array. Return a JSON object with a results array; each result must include the exact sourceUrl and companies array of {name,evidence}. Return valid JSON only.'
    },
    {
      role: 'user',
      content: `Target profile: ${JSON.stringify(extractionProfile)}\nSources: ${JSON.stringify(sourceContent)}`
    }
  ]
  const estimatedTokens = Math.ceil(messages.reduce((total, message) => total + message.content.length, 0) / 3) + 1024
  const completion = await runGroqRequest(() => groq.chat.completions.create({
    model: 'openai/gpt-oss-20b',
    messages,
    response_format: { type: 'json_object' },
    temperature: 0,
    max_completion_tokens: 1024
  }), { estimatedTokens })
  const raw = completion.choices[0]?.message?.content
  if (!raw) return []

  const parsed = JSON.parse(raw)
  return Array.isArray(parsed.results) ? parsed.results : []
}

export async function extractCompaniesFromListSources(sources, profile, options = {}) {
  const usableSources = (sources || []).filter((source) => source.url && source.content).slice(0, 3)
  if (!usableSources.length) return []

  try {
    const extractor = options.extractor || ((items) => extractWithGroq(
      items,
      profile,
      options.apiKey ?? getDiscoveryGroqApiKey()
    ))
    const extracted = await extractor(usableSources)
    const sourceByUrl = new Map(usableSources.map((source) => [source.url, source]))
    const seenNames = new Set()
    const leads = []

    for (const result of extracted) {
      const source = sourceByUrl.get(result.sourceUrl)
      if (!source || !Array.isArray(result.companies)) continue

      for (const company of result.companies.slice(0, 5)) {
        if (typeof company.name !== 'string' || typeof company.evidence !== 'string') continue
        const name = company.name.trim()
        const evidence = company.evidence.trim()
        const normalizedName = normalizeText(name)
        const normalizedEvidence = normalizeText(evidence)
        const normalizedSource = normalizeText(source.content)
        if (!name || normalizedName.length < 3 || !evidence || !normalizedSource.includes(normalizedEvidence)) continue
        if (!normalizedEvidence.includes(normalizedName)) continue
        if (seenNames.has(normalizedName)) continue
        seenNames.add(normalizedName)
        leads.push(createListCompanyLead({ name, evidence }, source, profile, leads.length))
        if (leads.length >= 10) return leads
      }
    }

    return leads
  } catch (error) {
    console.error('[CompanyCandidateService] List extraction failed:', error.message)
    return []
  }
}

async function verifyBatchWithGroq(leads, profile, apiKey) {
  const groq = new Groq({ apiKey: apiKey.trim(), maxRetries: 0 })
  const compactCandidates = leads.map((lead) => ({
    id: lead.id,
    candidateKind: lead.raw_data?.source_kind || 'single_search_result',
    pageTitle: lead.name,
    listedCompanyName: lead.companyName || (lead.raw_data?.source_kind === 'listicle_extraction' ? lead.company : null),
    sourceDomain: lead.sourceDomain || null,
    sourceUrl: lead.contactUrl,
    evidence: (lead.raw_data?.content || lead.reason || '').slice(0, 350)
  }))
  const target = {
    category: profile.category,
    geography: profile.geography,
    buyerSegment: profile.target_consumer_segment,
    keywords: (profile.keywords || []).slice(0, 4)
  }
  const messages = [
    {
      role: 'system',
      content: 'Verify whether each candidate is a real, individually identifiable operating company relevant as a potential customer or partner. Return a JSON object with a results array. Each result must have id, classification (one of company_site, company_in_article, company_in_list, non_company), company_name (string or null), and short reason. company_site means the source page is on that company\'s own official site. company_in_article means a third-party page is specifically about one named company. company_in_list is only for a company explicitly extracted from a list with quoted evidence. Reject publishers, list pages themselves, social posts, directories, products, market reports, generic pages, and unclear names as non_company. Do not infer a company from the publisher domain. Judge relevance to the target buyer/partner profile. Return valid JSON only.'
    },
    {
      role: 'user',
      content: `Target: ${JSON.stringify(target)}\nCandidates: ${JSON.stringify(compactCandidates)}`
    }
  ]
  const estimatedTokens = Math.ceil(messages.reduce((total, message) => total + message.content.length, 0) / 3) + 800
  const completion = await runGroqRequest(() => groq.chat.completions.create({
    model: 'openai/gpt-oss-20b',
    messages,
    response_format: { type: 'json_object' },
    temperature: 0,
    max_completion_tokens: 800
  }), { estimatedTokens })

  const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}')
  return Array.isArray(parsed.results) ? parsed.results : []
}

async function verifyBatchWithRecovery(leads, profile, apiKey, verifyBatch) {
  try {
    return {
      classifications: await verifyBatch(leads, profile, apiKey),
      isLiveGroq: true,
      notices: []
    }
  } catch (error) {
    const isJsonValidationError = /json_validate_failed|failed to validate json/i.test(error.message || '')
    if (!isJsonValidationError || leads.length <= 1) throw error

    const midpoint = Math.ceil(leads.length / 2)
    const classifications = []
    const notices = ['Split a company-verification batch after Groq returned invalid JSON.']
    let isLiveGroq = false

    for (const smallerBatch of [leads.slice(0, midpoint), leads.slice(midpoint)]) {
      if (!smallerBatch.length) continue
      try {
        const result = await verifyBatchWithRecovery(smallerBatch, profile, apiKey, verifyBatch)
        classifications.push(...result.classifications)
        isLiveGroq = isLiveGroq || result.isLiveGroq
        notices.push(...result.notices)
      } catch (smallerError) {
        notices.push(`Verification failed for ${smallerBatch.length} candidates: ${smallerError.message}`)
      }
    }

    return { classifications, isLiveGroq, notices }
  }
}

export async function verifyCompanyCandidates(leads, profile, options = {}) {
  const apiKey = options.apiKey ?? getVerificationGroqApiKey()
  if (!apiKey?.trim()) {
    return {
      leads: [],
      verifiedCount: 0,
      rejectedCount: (leads || []).length,
      isLiveGroq: false,
      notice: 'GROQ_API_KEY2 is required to verify B2B company identity.'
    }
  }

  const verifiedLeads = []
  let rejectedCount = 0
  let isLiveGroq = false
  const notices = []
  for (let offset = 0; offset < (leads || []).length; offset += 5) {
    const batch = leads.slice(offset, offset + 5)
    try {
      const result = await verifyBatchWithRecovery(
        batch,
        profile,
        apiKey,
        options.verifyBatch || verifyBatchWithGroq
      )
      const classifications = result.classifications
      isLiveGroq = isLiveGroq || result.isLiveGroq
      notices.push(...result.notices)
      for (const lead of batch) {
        const result = classifications.find((item) => item.id === lead.id)
        const companyName = typeof result?.company_name === 'string' ? result.company_name.trim() : ''
        const accepted = ['company_site', 'company_in_article', 'company_in_list'].includes(result?.classification)
        if (!accepted || !companyName) {
          rejectedCount++
          continue
        }

        verifiedLeads.push({
          ...lead,
          name: companyName,
          company: companyName,
          companyName,
          sourceIsCompanySite: result.classification === 'company_site',
          companyClassification: result.classification,
          reason: result.reason || lead.reason
        })
      }
    } catch (error) {
      rejectedCount += batch.length
      notices.push(`Company verification failed for ${batch.length} candidates: ${error.message}`)
    }
  }

  return {
    leads: verifiedLeads,
    verifiedCount: verifiedLeads.length,
    rejectedCount,
    isLiveGroq,
    notice: notices.join(' ') || null
  }
}

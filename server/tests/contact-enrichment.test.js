import test from 'node:test'
import assert from 'node:assert/strict'
import { enrichB2BContact } from '../contactEnrichmentService.js'

const lead = {
  id: 'lead-1',
  name: 'Example Medical Systems',
  company: 'Example Medical Systems',
  companyName: 'Example Medical Systems',
  sourceDomain: 'examplemedical.com',
  contactUrl: 'https://examplemedical.com/solutions',
  website: null,
  location: 'India',
  type: 'B2B',
  fitScore: 82
}

test('B2B enrichment takes phone and email from the company site before Tavily', async () => {
  const originalFetch = globalThis.fetch
  const requestedUrls = []
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url))
    const html = String(url) === 'https://examplemedical.com/contact'
      ? '<main>Contact us at sales@example.com or call +91 98765 43210</main>'
      : '<main>Welcome to Example Medical Systems</main>'
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } })
  }

  try {
    const result = await enrichB2BContact(lead, { apiKey: 'test-key', geography: 'India' })
    assert.equal(result.email, 'sales@example.com')
    assert.equal(result.phone, '+91 98765 43210')
    assert.equal(result.contactSource, 'Company website')
    assert.equal(result.emailSource, 'Company website')
    assert.equal(result.phoneSource, 'Company website')
    assert.equal(result.contactStatus, 'Contact found')
    assert.equal(result.website, 'https://examplemedical.com')
    assert.equal(result.websiteVerification, 'Company name matches source domain')
    assert.equal(requestedUrls.some((url) => url.includes('/search')), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('B2B enrichment uses a company-specific Tavily fallback when site details are absent', async () => {
  const originalFetch = globalThis.fetch
  const tavilyQueries = []
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('api.tavily.com')) {
      const requestBody = JSON.parse(options.body)
      tavilyQueries.push(requestBody.query)
      if (requestBody.query.includes('official company website')) {
        return new Response(JSON.stringify({
          results: [{
            title: 'Example Medical Systems Official Website',
            url: 'https://examplemedical.com',
            content: 'Official website for Example Medical Systems.'
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        results: [{
          title: 'Example Medical Systems Contact',
            url: 'https://examplemedical.com/contact',
          content: 'Email hello@example.com or call +1 212 555 0100.'
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('<main>No contact details listed</main>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    })
  }

  try {
    const publisherLead = {
      ...lead,
      company: 'industrynews.com',
      companyName: 'Example Medical Systems',
      sourceDomain: 'industrynews.com',
      contactUrl: 'https://industrynews.com/example-medical-systems'
    }
    const result = await enrichB2BContact(publisherLead, { apiKey: 'test-key', geography: 'United States' })
    assert.match(tavilyQueries[0], /Example Medical Systems.*official company website/)
    assert.match(tavilyQueries[1], /site:examplemedical\.com .*Example Medical Systems.*contact/)
    assert.doesNotMatch(tavilyQueries[1], /industrynews\.com/)
    assert.equal(result.website, 'https://examplemedical.com')
    assert.equal(result.websiteVerification, 'Tavily official-site lookup matched company name to domain')
    assert.equal(result.email, 'hello@example.com')
    assert.equal(result.phone, '+12125550100')
    assert.equal(result.contactSource, 'Tavily contact search')
    assert.equal(result.emailSource, 'Tavily contact search')
    assert.equal(result.phoneSource, 'Tavily contact search')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('B2B enrichment retains a lead and marks contact details missing when lookup finds none', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.tavily.com')) {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    return new Response('<main>No public contact listed</main>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    })
  }

  try {
    const publisherLead = {
      ...lead,
      company: 'articlepublisher.com',
      sourceDomain: 'articlepublisher.com',
      contactUrl: 'https://articlepublisher.com/story'
    }
    const result = await enrichB2BContact(publisherLead, { apiKey: 'test-key' })
    assert.equal(result.id, lead.id)
    assert.equal(result.fitScore, lead.fitScore)
    assert.equal(result.website, null)
    assert.equal(result.email, null)
    assert.equal(result.phone, null)
    assert.equal(result.contactStatus, 'No public contact found')
  } finally {
    globalThis.fetch = originalFetch
  }
})

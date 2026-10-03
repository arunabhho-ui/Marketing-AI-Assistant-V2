import test from 'node:test'
import assert from 'node:assert/strict'
import { extractCompaniesFromListSources, verifyCompanyCandidates } from '../companyCandidateService.js'

const profile = {
  geography: 'India',
  target_company_size: 'SMB to enterprise',
  category: 'Medical appointment scheduling'
}
const source = {
  title: 'Healthcare Companies in Ahmedabad',
  url: 'https://industry-list.example/healthcare-companies',
  content: 'Acme Medical provides appointment services to regional clinics. Beta Health operates hospitals across Gujarat.'
}

test('list extraction creates separate company candidates with source evidence and no guessed website', async () => {
  const result = await extractCompaniesFromListSources([source], profile, {
    extractor: async () => [{
      sourceUrl: source.url,
      companies: [
        { name: 'Acme Medical', evidence: 'Acme Medical provides appointment services to regional clinics.' },
        { name: 'Beta Health', evidence: 'Beta Health operates hospitals across Gujarat.' }
      ]
    }]
  })

  assert.equal(result.length, 2)
  assert.equal(result[0].companyName, 'Acme Medical')
  assert.equal(result[0].name, source.title)
  assert.equal(result[0].contactUrl, source.url)
  assert.equal(result[0].sourceDomain, 'industry-list.example')
  assert.equal(result[0].website, null)
  assert.equal(result[0].officialWebsite, null)
  assert.match(result[0].reason, /Acme Medical provides appointment services/)
})

test('list extraction rejects names without exact evidence in the page', async () => {
  const result = await extractCompaniesFromListSources([source], profile, {
    extractor: async () => [{
      sourceUrl: source.url,
      companies: [
        { name: 'Invented Company', evidence: 'Invented Company is a nationwide provider.' },
        { name: 'Acme Medical', evidence: 'Acme Medical provides appointment services to regional clinics.' }
      ]
    }]
  })

  assert.deepEqual(result.map((lead) => lead.companyName), ['Acme Medical'])
})

test('company verification keeps company sites/list entries and rejects a publisher page', async () => {
  const candidates = [
    { id: 'site', name: 'Official company site', company: 'Acme Health', type: 'B2B', contactUrl: 'https://acme.example' },
    { id: 'list-entry', name: 'Top healthcare firms', company: 'Beta Clinics', companyName: 'Beta Clinics', type: 'B2B', raw_data: { source_kind: 'listicle_extraction', content: 'Beta Clinics serves local hospitals.' } },
    { id: 'publisher', name: 'Healthcare consulting top 10', company: 'List Publisher', type: 'B2B' }
  ]
  const result = await verifyCompanyCandidates(candidates, profile, {
    apiKey: 'test-key',
    verifyBatch: async (batch) => batch.map((lead) => ({
      id: lead.id,
      classification: lead.id === 'publisher' ? 'non_company' : lead.id === 'list-entry' ? 'company_in_list' : 'company_site',
      company_name: lead.id === 'site' ? 'Acme Health' : lead.id === 'list-entry' ? 'Beta Clinics' : null,
      reason: 'Matches a single named organization.'
    }))
  })

  assert.equal(result.leads.length, 2)
  assert.equal(result.leads[0].sourceIsCompanySite, true)
  assert.equal(result.leads[1].sourceIsCompanySite, false)
  assert.equal(result.leads[1].companyName, 'Beta Clinics')
  assert.equal(result.rejectedCount, 1)
})

test('company verification splits Groq JSON-validation failures and verifies all candidates', async () => {
  const candidates = Array.from({ length: 5 }, (_, index) => ({
    id: `company-${index + 1}`,
    name: `Company ${index + 1}`,
    companyName: `Company ${index + 1}`,
    type: 'B2B'
  }))
  const batchSizes = []
  const result = await verifyCompanyCandidates(candidates, profile, {
    apiKey: 'test-key',
    verifyBatch: async (batch) => {
      batchSizes.push(batch.length)
      if (batch.length > 2) throw new Error('400 json_validate_failed')
      return batch.map((lead) => ({
        id: lead.id,
        classification: 'company_in_list',
        company_name: lead.companyName,
        reason: 'Named company relevant to target.'
      }))
    }
  })

  assert.deepEqual(batchSizes, [5, 3, 2, 1, 2])
  assert.equal(result.leads.length, 5)
  assert.equal(result.rejectedCount, 0)
  assert.equal(result.isLiveGroq, true)
  assert.match(result.notice, /Split a company-verification batch/)
})

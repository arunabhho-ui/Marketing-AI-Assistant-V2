import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreAllLeads } from '../scoringService.js'

const candidates = Array.from({ length: 18 }, (_, index) => ({
  id: `lead-${index + 1}`,
  name: `Lead ${index + 1}`,
  type: 'B2B',
  fitScore: 99
}))

test('scoring processes all candidates in batches and filters only scores below 40', async () => {
  const batches = []
  const result = await scoreAllLeads({}, candidates, {
    scoreBatch: async (_profile, batch) => {
      batches.push(batch)
      return { scoredLeads: batch.map((lead) => ({ ...lead, fitScore: lead.id.endsWith('1') ? 45 : 75 })), isLiveGroq: true, modelUsed: 'test-model' }
    }
  })

  assert.deepEqual(batches.map((batch) => batch.length), [5, 5, 5, 3])
  assert.equal(result.evaluatedCount, 18)
  assert.equal(result.scoredLeads.length, 18)
  assert.ok(result.scoredLeads.every((lead) => lead.fitScore >= 40))
  assert.match(result.notice, /Scored 18 of 18 available candidates/)
})

test('scoring retains successful batches and reports a later batch failure', async () => {
  const batches = []
  const result = await scoreAllLeads({}, candidates, {
    scoreBatch: async (_profile, batch) => {
      batches.push(batch)
      if (batches.length === 3) throw new Error('Groq scoring failed: 429 rate limit')
      return {
        scoredLeads: batch.map((lead) => ({ ...lead, fitScore: 75 })),
        isLiveGroq: true
      }
    }
  })

  assert.deepEqual(batches.map((batch) => batch.length), [5, 5, 5, 3])
  assert.equal(result.evaluatedCount, 18)
  assert.equal(result.scoredLeads.length, 13)
  assert.ok(result.scoredLeads.every((lead) => lead.fitScore >= 40))
  assert.match(result.notice, /Scoring failed for 5 candidates/)
})

test('scoring includes a score of 40 and filters scores below 40', async () => {
  const result = await scoreAllLeads({}, candidates.slice(0, 3), {
    scoreBatch: async (_profile, batch) => ({
      scoredLeads: batch.map((lead, index) => ({
        ...lead,
        fitScore: [39, 40, 41][index]
      })),
      isLiveGroq: true
    })
  })

  assert.deepEqual(result.scoredLeads.map((lead) => lead.fitScore), [40, 41])
})

test('scoring retries a JSON-validation failure with smaller batches', async () => {
  let failedLargeBatch = false
  const result = await scoreAllLeads({}, candidates.slice(0, 5), {
    scoreBatch: async (_profile, batch) => {
      if (batch.length > 2) {
        failedLargeBatch = true
        throw new Error('Groq scoring failed: 400 json_validate_failed')
      }
      return {
        scoredLeads: batch.map((lead) => ({ ...lead, fitScore: 75 })),
        isLiveGroq: true
      }
    }
  })

  assert.equal(failedLargeBatch, true)
  assert.equal(result.evaluatedCount, 5)
  assert.equal(result.scoredLeads.length, 5)
  assert.match(result.notice, /Split a batch after Groq returned invalid JSON/)
})
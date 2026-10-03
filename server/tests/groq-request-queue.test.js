import test from 'node:test'
import assert from 'node:assert/strict'
import { runGroqRequest } from '../groqRequestQueue.js'

test('Groq queue retries 429 using the suggested wait', async () => {
  let calls = 0
  const result = await runGroqRequest(async () => {
    calls++
    if (calls === 1) {
      const error = new Error('Rate limit reached. Please try again in 0.01s.')
      error.status = 429
      throw error
    }
    return 'success'
  }, { maxRetries: 1 })

  assert.equal(result, 'success')
  assert.equal(calls, 2)
})

test('Groq queue serializes concurrent requests', async () => {
  const events = []
  const makeRequest = (name) => runGroqRequest(async () => {
    events.push(`${name}:start`)
    await new Promise((resolve) => setTimeout(resolve, 5))
    events.push(`${name}:end`)
    return name
  })

  const results = await Promise.all([makeRequest('first'), makeRequest('second')])
  assert.deepEqual(results, ['first', 'second'])
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end'])
})

test('Groq queue blocks a request larger than its configured TPM budget', async () => {
  const originalBudget = process.env.GROQ_TPM_BUDGET
  process.env.GROQ_TPM_BUDGET = '10'
  let operationCalled = false

  try {
    await assert.rejects(
      runGroqRequest(async () => {
        operationCalled = true
      }, { estimatedTokens: 11, maxRetries: 0 }),
      /above the configured 10 TPM safety budget/
    )
    assert.equal(operationCalled, false)
  } finally {
    if (originalBudget === undefined) delete process.env.GROQ_TPM_BUDGET
    else process.env.GROQ_TPM_BUDGET = originalBudget
  }
})

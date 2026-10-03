import test from 'node:test'
import assert from 'node:assert/strict'
import { getDiscoveryGroqApiKey, getGroqConfiguration, getScoringGroqApiKey, getVerificationGroqApiKey } from '../groqConfig.js'

const keys = ['GROQ_API_KEY', 'GROQ_API_KEY1', 'GROQ_API_KEY2', 'GROQ_API_KEY3']
const originalValues = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

test('dedicated Groq keys route discovery and scoring independently', () => {
  process.env.GROQ_API_KEY1 = 'discovery-key'
  process.env.GROQ_API_KEY2 = 'verification-key'
  process.env.GROQ_API_KEY3 = 'scoring-key'
  delete process.env.GROQ_API_KEY

  try {
    assert.equal(getDiscoveryGroqApiKey(), 'discovery-key')
    assert.equal(getVerificationGroqApiKey(), 'verification-key')
    assert.equal(getScoringGroqApiKey(), 'scoring-key')
    assert.deepEqual(getGroqConfiguration(), {
      discoveryConfigured: true,
      verificationConfigured: true,
      scoringConfigured: true,
      groqConfigured: true
    })
  } finally {
    for (const key of keys) {
      if (originalValues[key] === undefined) delete process.env[key]
      else process.env[key] = originalValues[key]
    }
  }
})

test('legacy Groq key remains a fallback for both roles', () => {
  delete process.env.GROQ_API_KEY1
  delete process.env.GROQ_API_KEY2
  delete process.env.GROQ_API_KEY3
  process.env.GROQ_API_KEY = 'legacy-key'

  try {
    assert.equal(getDiscoveryGroqApiKey(), 'legacy-key')
    assert.equal(getVerificationGroqApiKey(), 'legacy-key')
    assert.equal(getScoringGroqApiKey(), 'legacy-key')
  } finally {
    for (const key of keys) {
      if (originalValues[key] === undefined) delete process.env[key]
      else process.env[key] = originalValues[key]
    }
  }
})

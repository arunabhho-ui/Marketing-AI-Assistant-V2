import test from 'node:test'
import assert from 'node:assert/strict'
import { extractProfile } from '../groqService.js'

test('extractProfile requires a real Groq API key and does not fall back to demo data', async () => {
  await assert.rejects(
    () => extractProfile('A satellite-based farmer decision assistant that predicts crop health using Sentinel-2 and radar for Indian farmers.'),
    /GROQ_API_KEY1 is required/i
  )
})

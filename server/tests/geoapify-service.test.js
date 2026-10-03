import test from 'node:test'
import assert from 'node:assert/strict'
import { searchB2CLeads } from '../geoapifyService.js'

const profile = {
  category: 'Medical clinic scheduling platform',
  geography: 'Austin, Texas, USA',
  target_consumer_segment: 'Local patients',
  keywords: ['medical', 'clinic', 'appointments']
}

function geocodeResponse() {
  return new Response(JSON.stringify({
    features: [{
      geometry: { coordinates: [-97.7431, 30.2672] },
      properties: { formatted: 'Austin, Texas, USA' }
    }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

test('Geoapify reports rejected place categories as provider errors', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).includes('/v1/geocode/')) return geocodeResponse()
    return new Response(JSON.stringify({ message: 'Invalid category' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const result = await searchB2CLeads(profile, 'test-key')
    assert.equal(result.isLiveGeoapify, false)
    assert.equal(result.count, 0)
    assert.match(result.notice, /HTTP 400: Invalid category/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Geoapify keeps a successful empty place search distinct from an API error', async () => {
  const originalFetch = globalThis.fetch
  let requestedCategories
  globalThis.fetch = async (url) => {
    if (String(url).includes('/v1/geocode/')) return geocodeResponse()
    requestedCategories = new URL(String(url)).searchParams.get('categories')
    return new Response(JSON.stringify({ features: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const result = await searchB2CLeads(profile, 'test-key')
    assert.equal(requestedCategories, 'healthcare')
    assert.equal(result.isLiveGeoapify, true)
    assert.equal(result.count, 0)
    assert.match(result.notice, /zero places/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Geoapify does not substitute unrelated commercial places for farmer prospects', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('No provider request should be made for unsupported farmer places')
  }

  try {
    const result = await searchB2CLeads({
      ...profile,
      category: 'Satellite crop monitoring service',
      keywords: ['agriculture', 'farm', 'crop health'],
      target_consumer_segment: 'Indian farmers'
    }, 'test-key')
    assert.equal(result.isLiveGeoapify, false)
    assert.equal(result.count, 0)
    assert.match(result.notice, /individual farmers/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Geoapify returns all 20 unique place candidates fetched for scoring', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).includes('/v1/geocode/')) return geocodeResponse()
    return new Response(JSON.stringify({
      features: Array.from({ length: 20 }, (_, index) => ({
        geometry: { coordinates: [-97.74 + index / 1000, 30.26 + index / 1000] },
        properties: {
          name: `Cafe ${index + 1}`,
          categories: ['catering.cafe'],
          city: 'Austin',
          state_code: 'TX'
        }
      }))
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const result = await searchB2CLeads({
      ...profile,
      category: 'Coffee shop ordering app',
      keywords: ['coffee', 'cafe']
    }, 'test-key')
    assert.equal(result.leads.length, 20)
    assert.equal(result.count, 20)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Geoapify passes through listed place email, phone, and website contacts', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).includes('/v1/geocode/')) return geocodeResponse()
    return new Response(JSON.stringify({
      features: [{
        geometry: { coordinates: [-97.7431, 30.2672] },
        properties: {
          name: 'Austin Medical Clinic',
          categories: ['healthcare.hospital'],
          city: 'Austin',
          state_code: 'TX',
          website: 'https://clinic.example',
          contact: { phone: '+1 512 555 0100', email: 'hello@clinic.example' }
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const result = await searchB2CLeads(profile, 'test-key')
    assert.equal(result.leads[0].email, 'hello@clinic.example')
    assert.equal(result.leads[0].phone, '+1 512 555 0100')
    assert.equal(result.leads[0].website, 'https://clinic.example')
    assert.equal(result.leads[0].contactSource, 'Geoapify listing')
    assert.equal(result.leads[0].emailSource, 'Geoapify listing')
    assert.equal(result.leads[0].phoneSource, 'Geoapify listing')
    assert.equal(result.leads[0].contactStatus, 'Contact found')
  } finally {
    globalThis.fetch = originalFetch
  }
})
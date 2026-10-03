import type { StructuredProfile, Lead } from '../types'

export interface ExtractResponse {
  success: boolean
  data: StructuredProfile
  meta: {
    isLiveGroq: boolean
    modelUsed: string | null
    notice: string | null
  }
}

export interface DiscoveryResponse {
  success: boolean
  data: Lead[]
  meta: {
    audience?: string
    isLiveTavily?: boolean
    isLiveGeoapify?: boolean
    searchQuery?: string | null
    notice?: string | null
    count: number
  }
}

export type DiscoveryPhase = 'search' | 'verify' | 'score'

export interface DiscoveryProgress {
  phase: DiscoveryPhase
  message: string
}

export async function fetchProfileExtraction(description: string): Promise<ExtractResponse> {
  const response = await fetch('/api/extract-profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ description })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `HTTP ${response.status}: Failed to extract profile`)
  }

  return response.json()
}

export async function fetchB2BDiscovery(profile: StructuredProfile): Promise<DiscoveryResponse> {
  const response = await fetch('/api/discover-b2b', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ profile })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `HTTP ${response.status}: Failed to discover B2B leads`)
  }

  return response.json()
}

export async function fetchB2CDiscovery(profile: StructuredProfile): Promise<DiscoveryResponse> {
  const response = await fetch('/api/discover-b2c', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ profile })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `HTTP ${response.status}: Failed to discover B2C leads`)
  }

  return response.json()
}

/**
 * Universal discovery endpoint: Automatically handles B2B, B2C, or both based on profile.audience_type
 */
export async function fetchDiscovery(
  profile: StructuredProfile,
  onProgress?: (progress: DiscoveryProgress) => void
): Promise<DiscoveryResponse> {
  const response = await fetch('/api/discover', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ profile })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `HTTP ${response.status}: Failed to execute discovery pipeline`)
  }

  if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
    return response.json()
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completedResponse: DiscoveryResponse | null = null

  const processFrame = (frame: string) => {
    let event = 'message'
    const dataLines: string[] = []
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
    if (!dataLines.length) return

    const payload = JSON.parse(dataLines.join('\n'))
    if (event === 'progress') onProgress?.(payload as DiscoveryProgress)
    if (event === 'failure') throw new Error(payload.error || 'Discovery pipeline failed')
    if (event === 'complete') completedResponse = payload as DiscoveryResponse
  }

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n/g, '\n')
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''
    for (const frame of frames) processFrame(frame)
    if (done) break
  }
  if (buffer.trim()) processFrame(buffer)
  if (!completedResponse) throw new Error('Discovery stream ended before returning results')
  return completedResponse
}

export async function fetchHealth(): Promise<{
  status: string
  config: {
    groqConfigured: boolean
    groqDiscoveryConfigured: boolean
    groqVerificationConfigured: boolean
    groqScoringConfigured: boolean
    tavilyConfigured: boolean
    geoapifyConfigured: boolean
  }
}> {
  const response = await fetch('/api/health')
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`)
  }
  return response.json()
}

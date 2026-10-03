export function getDiscoveryGroqApiKey() {
  return process.env.GROQ_API_KEY1?.trim()
    || process.env.GROQ_API_KEY?.trim()
    || ''
}

export function getScoringGroqApiKey() {
  return process.env.GROQ_API_KEY3?.trim()
    || process.env.GROQ_API_KEY?.trim()
    || ''
}

export function getVerificationGroqApiKey() {
  return process.env.GROQ_API_KEY2?.trim()
    || process.env.GROQ_API_KEY?.trim()
    || ''
}

export function getGroqConfiguration() {
  const discoveryConfigured = Boolean(getDiscoveryGroqApiKey())
  const verificationConfigured = Boolean(getVerificationGroqApiKey())
  const scoringConfigured = Boolean(getScoringGroqApiKey())
  return {
    discoveryConfigured,
    verificationConfigured,
    scoringConfigured,
    groqConfigured: discoveryConfigured && verificationConfigured && scoringConfigured
  }
}

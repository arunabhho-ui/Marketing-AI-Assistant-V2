import { Groq } from 'groq-sdk'
import { runGroqRequest } from './groqRequestQueue.js'
import { getDiscoveryGroqApiKey } from './groqConfig.js'

export const GROQ_MODEL = 'openai/gpt-oss-20b'

/**
 * Extract structured customer profile from free-text offering description.
 *
 * @param {string} description - The user's input business or offering description
 * @param {string} [apiKey] - GroqCloud API Key (optional, defaults to process.env.GROQ_API_KEY)
 * @returns {Promise<{ profile: object, isLiveGroq: boolean }>} 
 */
export async function extractProfile(description, apiKey = getDiscoveryGroqApiKey()) {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('GROQ_API_KEY1 is required for profile extraction. Add it to your .env file.')
  }

  const groq = new Groq({ apiKey, maxRetries: 0 })

  const systemPrompt = `You are an expert B2B and B2C market intelligence analyst.
Analyze the user's business, product, or service offering and extract a precise, structured customer profile suitable for targeted prospecting.

You must respond ONLY with a valid JSON object matching this schema:
{
  "audience_type": "B2B" | "B2C" | "both",
  "category": "Primary industry or domain category (e.g. Cold-Chain Fleet Telematics, Outpatient Preventative Cardiology)",
  "geography": "Target geographic scope or region (e.g. United States, Regional Metro Areas, Global)",
  "target_company_size": "Target company employee count or scale (e.g. 50-500 employees, Enterprise 1000+, Small Businesses) or 'N/A' if purely B2C",
  "target_consumer_segment": "Target individual customer demographic or profile (e.g. Health-conscious professionals 35-65, Local homeowners) or 'N/A' if purely B2B",
  "keywords": ["4-8 concise, high-relevance search keywords"],
  "budget_scale_signal": "Budget / pricing / purchasing power tier (e.g. Mid-Market $10k-$50k ACV, Premium Out-of-Pocket $300-$800, Enterprise RFP)",
  "summary": "Concise 1-sentence synthesis of the ideal target client and key buying trigger"
}

Keep every string concise. Return only the JSON object, with no explanation or markdown.`

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analyze this offering and extract the structured customer profile:\n\n"${description}"` }
    ]
    const estimatedTokens = Math.ceil(messages.reduce((total, message) => total + message.content.length, 0) / 3) + 2048
    const chatCompletion = await runGroqRequest(() => groq.chat.completions.create({
      messages,
      model: GROQ_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_completion_tokens: 2048
    }), { estimatedTokens })

    const rawContent = chatCompletion.choices[0]?.message?.content
    if (!rawContent) {
      throw new Error('Empty response from GroqCloud API')
    }

    const parsed = JSON.parse(rawContent)

    // Normalize expected fields with fallbacks
    const normalized = {
      audience_type: ['B2B', 'B2C', 'both'].includes(parsed.audience_type) ? parsed.audience_type : 'both',
      category: parsed.category || 'General Business Offering',
      geography: parsed.geography || 'United States / Global',
      target_company_size: parsed.target_company_size || 'N/A',
      target_consumer_segment: parsed.target_consumer_segment || 'N/A',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      budget_scale_signal: parsed.budget_scale_signal || 'Standard Commercial',
      summary: parsed.summary || ''
    }

    return {
      profile: normalized,
      isLiveGroq: true,
      modelUsed: GROQ_MODEL
    }
  } catch (error) {
    console.error('[GroqService] Error calling GroqCloud API:', error.message)
    throw new Error(`GroqCloud extraction failed: ${error.message}`)
  }
}

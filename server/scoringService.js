import { Groq } from 'groq-sdk';
import { runGroqRequest } from './groqRequestQueue.js';
import { getScoringGroqApiKey } from './groqConfig.js';

/**
 * Score leads using Groq LLM based on the extracted profile.
 * Scores verified leads and returns a fit score with a short rationale.
 * If GROQ_API_KEY is missing or the API call fails, falls back to the
 * existing heuristic scores and marks the result as non‑live.
 *
 * @param {object} profile - Structured profile from Groq extraction.
 * @param {Array<object>} leads - Array of lead objects (B2B or B2C) to score.
 * @param {string} [apiKey] - Optional API key; defaults to env var.
 * @returns {Promise<{scoredLeads: Array<object>, isLiveGroq: boolean, modelUsed?: string, notice?: string}>}
 */
export async function scoreLeads(profile, leads, apiKey = getScoringGroqApiKey()) {
  if (!leads || leads.length === 0) {
    return {
      scoredLeads: [],
      isLiveGroq: false,
      notice: 'No discovered leads available for scoring.'
    };
  }

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('GROQ_API_KEY3 is required for lead scoring. Add it to your .env file.');
  }

  const groq = new Groq({ apiKey: apiKey.trim(), maxRetries: 0 });

  // Build a concise representation for each lead.
  const leadSummaries = leads
    .map((lead, i) => {
      const minimal = {
        id: lead.id,
        name: lead.name,
        type: lead.type,
        company: lead.companyName || (lead.raw_data?.source_kind === 'listicle_extraction' ? lead.company : undefined) || lead.place_type || undefined,
        location: lead.location,
        industry: lead.industry,
        evidence: (lead.raw_data?.content || lead.reason || '').slice(0, 180)
      };
      return `Lead ${i + 1}: ${JSON.stringify(minimal)}`;
    })
    .join('\n');

  const systemPrompt = `Score each verified company or local place for plausible fit with the target profile, not confirmed buying intent. Use this calibration: 80-100 = strong direct fit; 65-79 = clear fit; 50-64 = plausible or adjacent fit; 40-49 = weaker but still reasonable fit; below 40 = little relevant fit or clear mismatch. Be generous with plausible prospects: do not require explicit purchase intent, proven adoption, exact keyword matches, or complete public information. Treat missing contact details or limited evidence as unknown, not as evidence of poor fit. Use the candidate's type, industry, location, company identity, and available source evidence to judge whether it could reasonably be a customer or partner; do not invent facts. Return exactly one result per candidate in this JSON shape: {"results":[{"id":"same id","fitScore":75,"reason":"Short evidence-based rationale."}]}. fitScore must be an integer from 0 to 100. Keep each reason under 12 words. Do not add fields, analysis, or prose. Complete the full results array and return valid JSON only.`;

  const scoringProfile = {
    audience_type: profile.audience_type,
    category: profile.category,
    geography: profile.geography,
    target_company_size: profile.target_company_size,
    target_consumer_segment: profile.target_consumer_segment,
    keywords: (profile.keywords || []).slice(0, 5)
  };
  const userPrompt = `Target: ${JSON.stringify(scoringProfile)}\nCandidates:\n${leadSummaries}`;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
  const maxCompletionTokens = Math.max(1024, leads.length * 400);
  const estimatedTokens = Math.ceil(messages.reduce((total, message) => total + message.content.length, 0) / 3) + maxCompletionTokens;

  try {
    const completion = await runGroqRequest(() => groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_completion_tokens: maxCompletionTokens
    }), { estimatedTokens });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('Empty response from Groq');

    const parsed = JSON.parse(raw);
    const scoringItems = Array.isArray(parsed) ? parsed : parsed.results;
    if (!Array.isArray(scoringItems)) throw new Error('Expected a results array in the scoring response');

    const scoredLeads = leads.map(lead => {
      const match = scoringItems.find(item => item.id === lead.id);
      if (match && typeof match.fitScore === 'number' && Number.isFinite(match.fitScore)) {
        return {
          ...lead,
          fitScore: Math.max(0, Math.min(100, Math.round(match.fitScore))),
          reason: match.reason || lead.reason || ''
        };
      }
      throw new Error(`Groq did not return a valid score for lead ${lead.id}`);
    });

    return {
      scoredLeads,
      isLiveGroq: true,
      modelUsed: 'openai/gpt-oss-20b'
    };
  } catch (error) {
    console.error('[ScoringService] Error during LLM scoring:', error.message);
    throw new Error(`Groq scoring failed: ${error.message}`);
  }
}

async function scoreBatchWithRecovery(profile, batch, scoreBatch) {
  try {
    const result = await scoreBatch(profile, batch);
    return { ...result, evaluatedCount: batch.length, notice: null };
  } catch (error) {
    const isJsonValidationError = /json_validate_failed|failed to validate json/i.test(error.message || '');
    if (!isJsonValidationError || batch.length <= 1) throw error;

    const midpoint = Math.ceil(batch.length / 2);
    const recovered = [];
    const errors = [];
    let evaluatedCount = 0;
    let isLiveGroq = false;
    let modelUsed = null;

    for (const smallerBatch of [batch.slice(0, midpoint), batch.slice(midpoint)]) {
      if (!smallerBatch.length) continue;
      try {
        const result = await scoreBatchWithRecovery(profile, smallerBatch, scoreBatch);
        recovered.push(...result.scoredLeads);
        evaluatedCount += result.evaluatedCount;
        isLiveGroq = isLiveGroq || result.isLiveGroq;
        modelUsed = result.modelUsed || modelUsed;
        if (result.notice) errors.push(result.notice);
      } catch (smallerError) {
        evaluatedCount += smallerBatch.length;
        errors.push(smallerError.message);
      }
    }

    if (!recovered.length) throw new Error(`JSON scoring failed after splitting the batch: ${errors.join('; ')}`);
    return {
      scoredLeads: recovered,
      evaluatedCount,
      isLiveGroq,
      modelUsed,
      notice: `Split a batch after Groq returned invalid JSON.${errors.length ? ` Some smaller batches failed: ${errors.join('; ')}` : ''}`
    };
  }
}

export async function scoreAllLeads(profile, leads, options = {}) {
  const minScore = options.minScore ?? 40;
  const batchSize = options.batchSize ?? 5;
  const scoreBatch = options.scoreBatch ?? scoreLeads;
  const candidates = leads || [];
  const qualifiedLeads = [];
  let evaluatedCount = 0;
  let isLiveGroq = false;
  let modelUsed = null;
  const notices = [];

  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const batch = candidates.slice(offset, offset + batchSize);
    const batchProfile = {
      ...profile,
      audience_type: batch[0]?.type || profile.audience_type
    };

    try {
      const result = await scoreBatchWithRecovery(batchProfile, batch, scoreBatch);
      evaluatedCount += result.evaluatedCount;
      isLiveGroq = isLiveGroq || result.isLiveGroq;
      modelUsed = result.modelUsed || modelUsed;
      qualifiedLeads.push(...result.scoredLeads.filter((lead) => lead.fitScore >= minScore));
      if (result.notice) notices.push(result.notice);
    } catch (error) {
      evaluatedCount += batch.length;
      notices.push(`Scoring failed for ${batch.length} candidates: ${error.message}`);
    }
  }

  const notice = `Scored ${evaluatedCount} of ${candidates.length} available candidates; ${qualifiedLeads.length} scored at least ${minScore}.${notices.length ? ` ${notices.join(' ')}` : ''}`

  return {
    scoredLeads: qualifiedLeads,
    evaluatedCount,
    isLiveGroq,
    modelUsed,
    notice
  };
}

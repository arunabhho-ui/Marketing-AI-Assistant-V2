let requestQueue = Promise.resolve()
const WINDOW_MS = 60_000
const DEFAULT_TPM_BUDGET = 6_500
const tokenReservations = []

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

async function reserveTokenBudget(estimatedTokens) {
  const budget = Number(process.env.GROQ_TPM_BUDGET) || DEFAULT_TPM_BUDGET
  const requestedTokens = Math.max(0, Math.ceil(estimatedTokens || 0))
  if (!requestedTokens) return
  if (requestedTokens > budget) {
    throw new Error(`Groq request is estimated at ${requestedTokens} tokens, above the configured ${budget} TPM safety budget. Reduce the prompt or raise GROQ_TPM_BUDGET after checking your plan.`)
  }

  while (true) {
    const now = Date.now()
    while (tokenReservations.length && now - tokenReservations[0].timestamp >= WINDOW_MS) {
      tokenReservations.shift()
    }

    const usedTokens = tokenReservations.reduce((total, reservation) => total + reservation.tokens, 0)
    if (usedTokens + requestedTokens <= budget) {
      tokenReservations.push({ timestamp: now, tokens: requestedTokens })
      return
    }

    const waitMs = tokenReservations[0].timestamp + WINDOW_MS - now + 50
    console.warn(`[GroqQueue] TPM safety budget reached (${usedTokens}/${budget}); waiting ${(waitMs / 1000).toFixed(1)}s`)
    await sleep(waitMs)
  }
}

function getStatus(error) {
  return error?.status ?? error?.statusCode ?? error?.cause?.status ?? null
}

function getRetryDelayMs(error, attempt) {
  const retryAfterHeader = error?.headers?.get?.('retry-after')
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader)
    if (Number.isFinite(seconds)) return Math.min(30_000, Math.max(250, seconds * 1000))
    const dateDelay = Date.parse(retryAfterHeader) - Date.now()
    if (Number.isFinite(dateDelay) && dateDelay > 0) return Math.min(30_000, dateDelay)
  }

  const message = `${error?.message || ''} ${error?.cause?.message || ''}`
  const retryIn = message.match(/try again in\s+([\d.]+)\s*s/i)
  if (retryIn) return Math.min(30_000, Math.max(250, Number(retryIn[1]) * 1000 + 250))

  const resetHeader = error?.headers?.get?.('x-ratelimit-reset-tokens')
  const reset = resetHeader?.match(/([\d.]+)\s*s/i)
  if (reset) return Math.min(30_000, Math.max(250, Number(reset[1]) * 1000 + 250))

  return Math.min(15_000, 1000 * (2 ** attempt))
}

function isRateLimitError(error) {
  return getStatus(error) === 429 || /rate[_ ]limit|too many requests|\b429\b/i.test(error?.message || '')
}

async function executeWithRetry(operation, maxRetries) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (!isRateLimitError(error) || attempt >= maxRetries) throw error
      const delayMs = getRetryDelayMs(error, attempt)
      console.warn(`[GroqQueue] Rate limited; retrying in ${(delayMs / 1000).toFixed(1)}s (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

export function runGroqRequest(operation, options = {}) {
  const maxRetries = options.maxRetries ?? 2
  const estimatedTokens = options.estimatedTokens ?? 0
  const queuedOperation = async () => executeWithRetry(async () => {
    await reserveTokenBudget(estimatedTokens)
    return operation()
  }, maxRetries)
  const request = requestQueue.then(
    queuedOperation,
    queuedOperation
  )
  requestQueue = request.catch(() => undefined)
  return request
}

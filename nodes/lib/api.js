// Calls to the Lazybird API (https://www.lazybird.app/docs/api-reference). Errors are thrown with a
// message written for the person running the flow.

const BASE_URL = 'https://api.lazybird.app/v2';

async function request(apiKey, method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'X-API-Key': apiKey,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.ok) return response;

  let error = {};
  try {
    error = await response.json();
  } catch {
    // Not JSON: fall back to the status code below.
  }
  throw new Error(errorMessage(response.status, error));
}

function errorMessage(status, body) {
  // "Authorization Error: …", "Invalid Input: …" read better without the prefix.
  const message = String(body.error ?? '').replace(/^[A-Za-z ]+(?:Error|Input): /, '');
  switch (status) {
    case 401:
      return 'Your Lazybird API key is not valid. Check the Lazybird config node.';
    case 422:
      return /credit/i.test(message)
        ? 'You are out of Lazybird credits. Get more at lazybird.app/pricing, or wait for your monthly credits to reset.'
        : `${message || 'Your plan does not allow this request.'} See lazybird.app/pricing.`;
    case 429:
      return body.retryAfterSeconds
        ? `Too many requests. Try again in ${body.retryAfterSeconds} seconds.`
        : 'Too many requests. Try again shortly.';
    case 503:
      return 'Lazybird is busy right now. Try again in a minute.';
    default:
      return message || `Lazybird request failed (${status})`;
  }
}

/** POST /generate-speech: the MP3 as a Buffer. `speech` is { voiceId, text | ssml, settings }. */
async function generateSpeech(apiKey, speech) {
  const response = await request(apiKey, 'POST', '/generate-speech', speech);
  return Buffer.from(await response.arrayBuffer());
}

/** GET /voices: your own voices first, then the Lazybird library, matching `query`. */
async function listVoices(apiKey, query) {
  const params = new URLSearchParams({ limit: '100' });
  if (query) params.set('q', query);
  const response = await request(apiKey, 'GET', `/voices?${params}`);
  const { myVoices = [], library = [] } = await response.json();
  return [...myVoices, ...library];
}

module.exports = { generateSpeech, listVoices };

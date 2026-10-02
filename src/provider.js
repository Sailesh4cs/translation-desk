import { ApiError } from "./http.js";

/**
 * Calls an OpenAI-compatible POST {baseUrl}/chat/completions endpoint.
 * Provider response bodies are never forwarded to clients because they can
 * contain account details; only normalized error codes are returned.
 */
export async function chatCompletion(config, fetchImpl, messages, { temperature = 0, maxTokens } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          temperature,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
          messages,
        }),
        signal: controller.signal,
      });
    } catch (cause) {
      if (controller.signal.aborted || cause?.name === "AbortError" || cause?.name === "TimeoutError") {
        throw new ApiError(504, "ai_provider_timeout", "The AI provider did not respond before the configured timeout.");
      }
      throw new ApiError(502, "ai_provider_unavailable", "The AI provider could not be reached.");
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new ApiError(502, "ai_provider_auth_failed", "The AI provider rejected the configured credentials.");
      }
      if (response.status === 429) {
        throw new ApiError(503, "ai_provider_rate_limited", "The AI provider is rate limiting requests. Try again shortly.");
      }
      throw new ApiError(502, "ai_provider_error", `The AI provider returned HTTP ${response.status}.`);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      if (controller.signal.aborted) {
        throw new ApiError(504, "ai_provider_timeout", "The AI provider did not respond before the configured timeout.");
      }
      throw new ApiError(502, "ai_provider_invalid_response", "The AI provider returned a response that is not valid JSON.");
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new ApiError(502, "ai_provider_invalid_response", "The AI provider returned no message content.");
    }
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}
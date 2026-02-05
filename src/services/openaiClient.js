import fetch from "node-fetch";
import https from "https";

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_RETRIES = 1;

async function requestWithRetry(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES) {
  let lastError;
  const insecureTls = process.env.OPENAI_INSECURE_TLS === "true";
  const agent = insecureTls ? new https.Agent({ rejectUnauthorized: false }) : undefined;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal, agent });
      clearTimeout(timer);
      return res;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;

      if (attempt === retries) {
        throw lastError;
      }
    }
  }

  throw lastError;
}

export async function createChatCompletion(apiKey, { system, userText }) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  if (!userText) {
    throw new Error("user_text is required");
  }

  const res = await requestWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText }
      ],
      temperature: 0.7
    })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.error?.message || "OpenAI request failed";
    const error = new Error(message);
    error.detail = data?.error || data;
    throw error;
  }

  const text = data?.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error("OpenAI returned empty response");
  }

  return { text, raw: data };
}

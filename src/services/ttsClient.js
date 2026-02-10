import fetch from "node-fetch";
import https from "https";
import { Buffer } from "buffer";

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_RETRIES = 1;

async function requestWithRetry(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES) {
  let lastError;
  const insecureTls = process.env.CUSTOM_TTS_INSECURE_TLS === "true";
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

function requireEndpoint() {
  if (!process.env.CUSTOM_TTS_ENDPOINT) {
    throw new Error("CUSTOM_TTS_ENDPOINT is not set");
  }
}

function resolveProvider() {
  const provider = (process.env.CUSTOM_TTS_PROVIDER || "").toLowerCase();
  if (provider) return provider;
  const endpoint = process.env.CUSTOM_TTS_ENDPOINT || "";
  if (endpoint.includes("api.openai.com/v1/audio/speech")) {
    return "openai";
  }
  return "custom";
}

function buildHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };

  const apiKey = process.env.CUSTOM_TTS_API_KEY;
  if (apiKey) {
    const headerName = process.env.CUSTOM_TTS_AUTH_HEADER || "Authorization";
    const prefix = process.env.CUSTOM_TTS_AUTH_PREFIX || "Bearer";
    headers[headerName] = prefix ? `${prefix} ${apiKey}` : apiKey;
  }

  return headers;
}

function mapOpenAiResponseFormat(outputFormat) {
  if (!outputFormat) return null;
  const normalized = outputFormat.toLowerCase();
  if (normalized.includes("pcm")) return "pcm";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mp3")) return "mp3";
  if (normalized.includes("opus")) return "opus";
  if (normalized.includes("aac")) return "aac";
  if (normalized.includes("flac")) return "flac";
  return null;
}

function buildOpenAiVoice() {
  const voice = process.env.CUSTOM_TTS_VOICE || "alloy";
  const isCustom = process.env.CUSTOM_TTS_VOICE_IS_CUSTOM === "true";
  if (isCustom) {
    return { id: voice };
  }
  return voice;
}

async function synthesizeOpenAi({ text, outputFormat }) {
  requireEndpoint();
  const apiKey = process.env.CUSTOM_TTS_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("CUSTOM_TTS_API_KEY or OPENAI_API_KEY is not set");
  }

  const model = process.env.CUSTOM_TTS_MODEL || "gpt-4o-mini-tts";
  const responseFormat =
    process.env.CUSTOM_TTS_RESPONSE_FORMAT ||
    mapOpenAiResponseFormat(outputFormat) ||
    "pcm";

  const res = await requestWithRetry(process.env.CUSTOM_TTS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: text,
      voice: buildOpenAiVoice(),
      response_format: responseFormat
    })
  });

  const ok = res.ok;
  if (!ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message = errorBody?.error?.message || errorBody?.message || "OpenAI TTS request failed";
    const error = new Error(message);
    error.detail = errorBody?.error || errorBody;
    throw error;
  }

  const audioBuffer = Buffer.from(await res.arrayBuffer());
  const audioBase64 = audioBuffer.toString("base64");

  const format =
    responseFormat === "pcm" ? "pcm_s16le" : responseFormat;
  const sampleRate =
    Number(process.env.CUSTOM_TTS_SAMPLE_RATE) || 24000;

  return {
    audioBase64,
    sampleRate,
    format
  };
}

export async function synthesizeSpeech({ text, voiceId, outputFormat, sampleRate }) {
  requireEndpoint();
  if (!text) {
    throw new Error("text is required for TTS");
  }

  const provider = resolveProvider();
  if (provider === "openai") {
    return synthesizeOpenAi({ text, outputFormat });
  }

  const body = {
    text,
    voice_id: voiceId || undefined,
    format: outputFormat || "pcm_s16le",
    sample_rate_hz: sampleRate || 24000
  };

  const res = await requestWithRetry(process.env.CUSTOM_TTS_ENDPOINT, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || data?.error?.message || "Custom TTS request failed";
    const error = new Error(message);
    error.detail = data?.error || data;
    throw error;
  }

  const audioBase64 =
    data?.audio_base64 ||
    data?.audioBase64 ||
    data?.audio ||
    data?.data?.audio_base64 ||
    data?.data?.audioBase64 ||
    data?.data?.audio;

  if (!audioBase64) {
    throw new Error("Custom TTS response missing audio_base64");
  }

  return {
    audioBase64,
    sampleRate: data?.sample_rate_hz || data?.sampleRate || body.sample_rate_hz,
    format: data?.format || data?.audio_format || body.format
  };
}

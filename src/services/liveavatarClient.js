import fetch from "node-fetch";
import https from "https";

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_RETRIES = 1;

async function requestWithRetry(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES) {
  let lastError;
  const insecureTls = process.env.LIVEAVATAR_INSECURE_TLS === "true";
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

function requireApiKey(apiKey) {
  if (!apiKey) {
    throw new Error("LIVEAVATAR_API_KEY is not set");
  }
}

async function readJson(res) {
  return res.json().catch(() => ({}));
}

function raiseForStatus(res, data, fallbackMessage) {
  if (res.ok) return;
  const message = data?.message || data?.error?.message || fallbackMessage;
  const error = new Error(message);
  error.detail = JSON.stringify({ status: res.status, data });
  throw error;
}

export async function createLiveavatarSessionToken(apiKey, baseUrl, payload) {
  requireApiKey(apiKey);
  const url = `${baseUrl}/sessions/token`;
  const res = await requestWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey
    },
    body: JSON.stringify(payload || {})
  });
  const data = await readJson(res);
  raiseForStatus(res, data, "Failed to create LiveAvatar session token");
  return data;
}

export async function startLiveavatarSession(sessionToken, baseUrl) {
  if (!sessionToken) {
    throw new Error("session_token is required");
  }
  const url = `${baseUrl}/sessions/start`;
  const res = await requestWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`
    }
  });
  const data = await readJson(res);
  raiseForStatus(res, data, "Failed to start LiveAvatar session");
  return data;
}

export async function stopLiveavatarSession(apiKey, baseUrl, sessionId, sessionToken, reason) {
  requireApiKey(apiKey);
  if (!sessionId) {
    throw new Error("session_id is required");
  }
  const url = `${baseUrl}/sessions/stop`;
  const headers = {
    "Content-Type": "application/json",
    "X-API-KEY": apiKey
  };
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  const payload = { session_id: sessionId };
  if (reason) {
    payload.reason = reason;
  }
  const res = await requestWithRetry(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const data = await readJson(res);
  raiseForStatus(res, data, "Failed to stop LiveAvatar session");
  return data;
}

export async function keepLiveavatarAlive(apiKey, baseUrl, sessionId, sessionToken) {
  requireApiKey(apiKey);
  if (!sessionId) {
    throw new Error("session_id is required");
  }
  const url = `${baseUrl}/sessions/keep-alive`;
  const headers = {
    "Content-Type": "application/json",
    "X-API-KEY": apiKey
  };
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  const res = await requestWithRetry(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ session_id: sessionId })
  });
  const data = await readJson(res);
  raiseForStatus(res, data, "Failed to keep LiveAvatar session alive");
  return data;
}

export async function listPublicAvatars(apiKey, baseUrl) {
  requireApiKey(apiKey);
  const url = `${baseUrl}/avatars/public`;
  const res = await requestWithRetry(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-KEY": apiKey
    }
  });
  const data = await readJson(res);
  raiseForStatus(res, data, "Failed to list public avatars");
  return data;
}

export async function listUserAvatars(apiKey, baseUrl) {
  requireApiKey(apiKey);
  const url = `${baseUrl}/avatars`;
  const res = await requestWithRetry(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-KEY": apiKey
    }
  });
  const data = await readJson(res);
  raiseForStatus(res, data, "Failed to list user avatars");
  return data;
}

export async function listVoices(apiKey, baseUrl, voiceType) {
  requireApiKey(apiKey);
  const query = new URLSearchParams();
  if (voiceType) {
    query.set("voice_type", voiceType);
  }
  query.set("page_size", "100");
  const suffix = query.toString();
  const url = suffix ? `${baseUrl}/voices?${suffix}` : `${baseUrl}/voices`;
  const res = await requestWithRetry(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-KEY": apiKey
    }
  });
  const data = await readJson(res);
  raiseForStatus(res, data, "Failed to list voices");
  return data;
}

export async function listContexts(apiKey, baseUrl) {
  requireApiKey(apiKey);
  const url = `${baseUrl}/contexts`;
  const res = await requestWithRetry(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-KEY": apiKey
    }
  });
  const data = await readJson(res);
  raiseForStatus(res, data, "Failed to list contexts");
  return data;
}

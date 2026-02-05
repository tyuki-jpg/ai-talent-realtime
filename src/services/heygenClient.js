import fetch from "node-fetch";
import https from "https";

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_RETRIES = 1;

async function requestWithRetry(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES) {
  let lastError;
  const insecureTls = process.env.HEYGEN_INSECURE_TLS === "true";
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

export async function createHeygenToken(apiKey, baseUrl) {
  if (!apiKey) {
    throw new Error("HEYGEN_API_KEY is not set");
  }

  // TODO: verify with HeyGen docs (endpoint, headers, response schema)
  const url = `${baseUrl}/streaming.create_token`;
  const res = await requestWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || "Failed to create HeyGen token";
    throw new Error(message);
  }

  return data;
}

export async function createHeygenSession(apiKey, baseUrl, avatarId) {
  if (!apiKey) {
    throw new Error("HEYGEN_API_KEY is not set");
  }

  if (!avatarId) {
    throw new Error("avatar_id is required");
  }

  // TODO: verify with HeyGen docs (endpoint, body, response schema)
  const url = `${baseUrl}/streaming.new`;
  const res = await requestWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey
    },
    body: JSON.stringify({
      avatar_id: avatarId
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || "Failed to create HeyGen session";
    throw new Error(message);
  }

  return data;
}

export async function sendHeygenTask(apiKey, baseUrl, sessionId, text) {
  if (!apiKey) {
    throw new Error("HEYGEN_API_KEY is not set");
  }

  if (!sessionId || !text) {
    throw new Error("session_id and text are required");
  }

  // TODO: verify with HeyGen docs (endpoint, body, response schema)
  const url = `${baseUrl}/streaming.task`;
  const res = await requestWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey
    },
    body: JSON.stringify({
      session_id: sessionId,
      text
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || "Failed to send HeyGen task";
    throw new Error(message);
  }

  return data;
}

export async function keepHeygenAlive(apiKey, baseUrl, sessionId) {
  if (!apiKey) {
    throw new Error("HEYGEN_API_KEY is not set");
  }

  if (!sessionId) {
    throw new Error("session_id is required");
  }

  // TODO: verify with HeyGen docs (endpoint, body, response schema)
  const url = `${baseUrl}/streaming.keep_alive`;
  const res = await requestWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey
    },
    body: JSON.stringify({
      session_id: sessionId
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || "Failed to keep HeyGen session alive";
    throw new Error(message);
  }

  return data;
}

export async function listStreamingAvatars(apiKey, baseUrl) {
  if (!apiKey) {
    throw new Error("HEYGEN_API_KEY is not set");
  }

  const url = `${baseUrl}/streaming/avatar.list`;
  const res = await requestWithRetry(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "X-Api-Key": apiKey
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || data?.error?.message || "Failed to list streaming avatars";
    const error = new Error(message);
    error.detail = JSON.stringify({ status: res.status, data });
    throw error;
  }

  return data;
}

export async function uploadHeygenAsset(apiKey, uploadBaseUrl, file) {
  if (!apiKey) {
    throw new Error("HEYGEN_API_KEY is not set");
  }

  if (!file?.buffer) {
    throw new Error("image file is required");
  }

  const url = `${uploadBaseUrl}/asset`;
  const res = await requestWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": file.mimetype || "application/octet-stream",
      "X-Api-Key": apiKey
    },
    body: file.buffer
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || "Failed to upload HeyGen asset";
    throw new Error(message);
  }

  return data;
}

export async function createPhotoAvatarGroup(apiKey, baseUrl, imageKey, name) {
  if (!apiKey) {
    throw new Error("HEYGEN_API_KEY is not set");
  }

  if (!imageKey) {
    throw new Error("image_key is required");
  }

  const url = `${baseUrl}/photo_avatar/avatar_group/create`;
  const res = await requestWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey
    },
    body: JSON.stringify({
      name: name || "photo-avatar",
      image_key: imageKey
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data?.message ||
      data?.error?.message ||
      data?.error ||
      "Failed to create photo avatar group";
    const error = new Error(message);
    error.detail = JSON.stringify({ status: res.status, data });
    throw error;
  }

  return data;
}

export async function listAvatarGroupAvatars(apiKey, baseUrl, groupId) {
  if (!apiKey) {
    throw new Error("HEYGEN_API_KEY is not set");
  }

  if (!groupId) {
    throw new Error("group_id is required");
  }

  const url = `${baseUrl}/avatar_group/${groupId}/avatars`;
  const res = await requestWithRetry(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "X-Api-Key": apiKey
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || data?.error?.message || "Failed to fetch avatar group avatars";
    const error = new Error(message);
    error.detail = JSON.stringify({ status: res.status, data });
    throw error;
  }

  return data;
}

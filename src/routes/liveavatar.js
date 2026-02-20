import { Router } from "express";
import {
  createLiveavatarSessionToken,
  startLiveavatarSession,
  stopLiveavatarSession,
  keepLiveavatarAlive,
  listPublicAvatars,
  listUserAvatars,
  listVoices,
  listContexts
} from "../services/liveavatarClient.js";
import { synthesizeSpeech } from "../services/ttsClient.js";
import { sendAudioToLiveavatar, closeWs } from "../services/liveavatarWsClient.js";

const router = Router();
const baseUrl = process.env.LIVEAVATAR_BASE_URL || "https://api.liveavatar.com/v1";
const sessionTokens = new Map();
const sessionMeta = new Map();

function handleError(res, error, fallbackMessage) {
  console.error(error);
  return res.status(500).json({
    ok: false,
    error: {
      message: fallbackMessage,
      detail: error?.detail || error?.message || "Unknown error"
    }
  });
}

function normalizeApiList(payload) {
  const data = payload?.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data)) return data;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function extractWsUrl(payload) {
  const candidates = [payload, payload?.data, payload?.start, payload?.start?.data];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const wsUrl =
      candidate.ws_url ||
      candidate.websocket_url ||
      candidate.wsUrl ||
      candidate.websocketUrl ||
      candidate.livekit_ws_url;
    if (wsUrl) return wsUrl;
  }
  return null;
}

function getLivekitConfigFromEnv() {
  const url = process.env.LIVEAVATAR_CUSTOM_LIVEKIT_URL;
  const room = process.env.LIVEAVATAR_CUSTOM_LIVEKIT_ROOM;
  const token = process.env.LIVEAVATAR_CUSTOM_LIVEKIT_TOKEN;
  if (!url || !room || !token) return null;
  return {
    livekit_url: url,
    livekit_room: room,
    livekit_client_token: token
  };
}

router.get("/avatars/public", async (req, res) => {
  try {
    const apiKey = process.env.LIVEAVATAR_API_KEY;
    const data = await listPublicAvatars(apiKey, baseUrl);
    const avatars = data?.data || data?.avatars || data?.items || [];
    return res.json({ ok: true, data: { avatars, raw: data } });
  } catch (error) {
    return handleError(res, error, "Failed to list public avatars");
  }
});

router.get("/avatars/user", async (req, res) => {
  try {
    const apiKey = process.env.LIVEAVATAR_API_KEY;
    const data = await listUserAvatars(apiKey, baseUrl);
    const avatars = data?.data || data?.avatars || data?.items || [];
    return res.json({ ok: true, data: { avatars, raw: data } });
  } catch (error) {
    return handleError(res, error, "Failed to list user avatars");
  }
});

router.get("/voices", async (req, res) => {
  try {
    const apiKey = process.env.LIVEAVATAR_API_KEY;
    const [publicResult, privateResult] = await Promise.allSettled([
      listVoices(apiKey, baseUrl, "public"),
      listVoices(apiKey, baseUrl, "private")
    ]);

    if (publicResult.status === "rejected" && privateResult.status === "rejected") {
      throw publicResult.reason;
    }

    const publicVoices =
      publicResult.status === "fulfilled"
        ? normalizeApiList(publicResult.value).map((voice) => ({ ...voice, voice_type: "public" }))
        : [];
    const privateVoices =
      privateResult.status === "fulfilled"
        ? normalizeApiList(privateResult.value).map((voice) => ({ ...voice, voice_type: "private" }))
        : [];

    const seen = new Set();
    const voices = [...privateVoices, ...publicVoices].filter((voice) => {
      const id = voice?.voice_id || voice?.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const warnings = [];
    if (publicResult.status === "rejected") {
      warnings.push({ source: "public", message: publicResult.reason?.message });
    }
    if (privateResult.status === "rejected") {
      warnings.push({ source: "private", message: privateResult.reason?.message });
    }

    return res.json({
      ok: true,
      data: {
        voices,
        warnings,
        raw: {
          public: publicResult.status === "fulfilled" ? publicResult.value : null,
          private: privateResult.status === "fulfilled" ? privateResult.value : null
        }
      }
    });
  } catch (error) {
    return handleError(res, error, "Failed to list voices");
  }
});

router.get("/contexts", async (req, res) => {
  try {
    const apiKey = process.env.LIVEAVATAR_API_KEY;
    const data = await listContexts(apiKey, baseUrl);
    const contexts = data?.data || data?.contexts || data?.items || [];
    return res.json({ ok: true, data: { contexts, raw: data } });
  } catch (error) {
    return handleError(res, error, "Failed to list contexts");
  }
});

router.post("/new-session", async (req, res) => {
  try {
    const apiKey = process.env.LIVEAVATAR_API_KEY;
    const {
      avatar_id: avatarId,
      voice_id: voiceId,
      context_id: contextId,
      language,
      mode,
      livekit_config: livekitConfigOverride
    } = req.body || {};

    const resolvedMode = mode || "FULL";

    if (!avatarId) {
      return res.status(400).json({
        ok: false,
        error: { message: "avatar_id is required" }
      });
    }

    if (resolvedMode === "FULL" && (!voiceId || !contextId)) {
      return res.status(400).json({
        ok: false,
        error: { message: "voice_id and context_id are required for FULL mode" }
      });
    }

    const avatarPersona = resolvedMode === "FULL" ? { voice_id: voiceId, context_id: contextId } : undefined;
    if (avatarPersona && language) {
      avatarPersona.language = language;
    }

    const sessionTokenPayload = {
      avatar_id: avatarId,
      mode: resolvedMode
    };
    if (avatarPersona) {
      sessionTokenPayload.avatar_persona = avatarPersona;
    }

    if (resolvedMode !== "FULL") {
      const livekitConfig = livekitConfigOverride || getLivekitConfigFromEnv();
      if (livekitConfig) {
        sessionTokenPayload.livekit_config = livekitConfig;
      }
    }

    const tokenResult = await createLiveavatarSessionToken(apiKey, baseUrl, sessionTokenPayload);
    const sessionToken = tokenResult?.data?.session_token || tokenResult?.session_token;
    const sessionId = tokenResult?.data?.session_id || tokenResult?.session_id;

    if (!sessionToken) {
      const error = new Error("session_token not found in LiveAvatar response");
      error.detail = JSON.stringify(tokenResult);
      throw error;
    }

    const startResult = await startLiveavatarSession(sessionToken, baseUrl);
    if (sessionId && sessionToken) {
      sessionTokens.set(sessionId, sessionToken);
    }
    const wsUrl = extractWsUrl(startResult);
    if (sessionId) {
      sessionMeta.set(sessionId, {
        mode: resolvedMode,
        wsUrl
      });
    }

    const payload = {
      session_id: sessionId,
      start: startResult,
      ws_url: wsUrl
    };

    return res.json({ ok: true, data: payload });
  } catch (error) {
    return handleError(res, error, "Failed to create LiveAvatar session");
  }
});

router.post("/keepalive", async (req, res) => {
  try {
    const apiKey = process.env.LIVEAVATAR_API_KEY;
    const { session_id: sessionId, reason } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        error: { message: "session_id is required" }
      });
    }

    const sessionToken = sessionTokens.get(sessionId);
    const data = await keepLiveavatarAlive(apiKey, baseUrl, sessionId, sessionToken);
    return res.json({ ok: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to keep LiveAvatar session alive");
  }
});

router.post("/stop", async (req, res) => {
  try {
    const apiKey = process.env.LIVEAVATAR_API_KEY;
    const { session_id: sessionId, reason } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        error: { message: "session_id is required" }
      });
    }

    const sessionToken = sessionTokens.get(sessionId);
    const data = await stopLiveavatarSession(apiKey, baseUrl, sessionId, sessionToken, reason);
    sessionTokens.delete(sessionId);
    sessionMeta.delete(sessionId);
    closeWs(sessionId);
    return res.json({ ok: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to stop LiveAvatar session");
  }
});

router.post("/speak", async (req, res) => {
  try {
    const { session_id: sessionId, text, tts_voice_id: voiceId } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        error: { message: "session_id is required" }
      });
    }

    if (!text) {
      return res.status(400).json({
        ok: false,
        error: { message: "text is required" }
      });
    }

    const meta = sessionMeta.get(sessionId);
    if (!meta?.wsUrl) {
      return res.status(400).json({
        ok: false,
        error: { message: "ws_url not found for session. Start in CUSTOM mode first." }
      });
    }

    const ttsResult = await synthesizeSpeech({
      text,
      voiceId,
      outputFormat: "pcm_s16le",
      sampleRate: 24000
    });

    await sendAudioToLiveavatar(sessionId, meta.wsUrl, {
      audioBase64: ttsResult.audioBase64,
      sampleRate: ttsResult.sampleRate,
      format: ttsResult.format
    });

    const shouldReturnAudio = process.env.CUSTOM_TTS_RETURN_AUDIO === "true";
    return res.json({
      ok: true,
      data: {
        session_id: sessionId,
        audio_base64: shouldReturnAudio ? ttsResult.audioBase64 : undefined,
        sample_rate_hz: shouldReturnAudio ? ttsResult.sampleRate : undefined,
        audio_format: shouldReturnAudio ? ttsResult.format : undefined
      }
    });
  } catch (error) {
    return handleError(res, error, "Failed to send custom audio");
  }
});

export default router;

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

const router = Router();
const baseUrl = process.env.LIVEAVATAR_BASE_URL || "https://api.liveavatar.com/v1";
const sessionTokens = new Map();

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
    const data = await listVoices(apiKey, baseUrl);
    const voices = data?.data || data?.voices || data?.items || [];
    return res.json({ ok: true, data: { voices, raw: data } });
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
      mode
    } = req.body || {};

    if (!avatarId) {
      return res.status(400).json({
        ok: false,
        error: { message: "avatar_id is required" }
      });
    }

    if (!voiceId || !contextId) {
      return res.status(400).json({
        ok: false,
        error: { message: "voice_id and context_id are required for FULL mode" }
      });
    }

    const avatarPersona = {
      voice_id: voiceId,
      context_id: contextId
    };
    if (language) {
      avatarPersona.language = language;
    }

    const sessionTokenPayload = {
      avatar_id: avatarId,
      mode: mode || "FULL",
      avatar_persona: avatarPersona
    };

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

    const payload = {
      session_id: sessionId,
      start: startResult
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
    const { session_id: sessionId } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        error: { message: "session_id is required" }
      });
    }

    const sessionToken = sessionTokens.get(sessionId);
    const data = await stopLiveavatarSession(apiKey, baseUrl, sessionId, sessionToken, reason);
    sessionTokens.delete(sessionId);
    return res.json({ ok: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to stop LiveAvatar session");
  }
});

export default router;

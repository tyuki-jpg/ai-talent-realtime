import { Router } from "express";
import multer from "multer";
import {
  createHeygenToken,
  createHeygenSession,
  keepHeygenAlive,
  sendHeygenTask,
  listStreamingAvatars,
  uploadHeygenAsset,
  createPhotoAvatarGroup,
  listAvatarGroupAvatars
} from "../services/heygenClient.js";

const router = Router();
const baseUrl = process.env.HEYGEN_BASE_URL || "https://api.heygen.com/v1";
const baseUrlV2 = process.env.HEYGEN_V2_BASE_URL || "https://api.heygen.com/v2";
const uploadBaseUrl = process.env.HEYGEN_UPLOAD_BASE_URL || "https://upload.heygen.com/v1";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

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

function pickAvatarId(avatarList) {
  if (!Array.isArray(avatarList)) return null;
  for (const item of avatarList) {
    const candidate =
      item?.avatar_id ||
      item?.id ||
      item?.avatarId ||
      item?.avatarID;
    if (candidate) return candidate;
  }
  return null;
}

router.get("/token", async (req, res) => {
  try {
    const apiKey = process.env.HEYGEN_API_KEY;
    const data = await createHeygenToken(apiKey, baseUrl);
    return res.json({ ok: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to create HeyGen token");
  }
});

router.post("/new-session", async (req, res) => {
  try {
    const apiKey = process.env.HEYGEN_API_KEY;
    const { avatar_id: avatarId } = req.body || {};

    if (!avatarId) {
      return res.status(400).json({
        ok: false,
        error: { message: "avatar_id is required" }
      });
    }

    const data = await createHeygenSession(apiKey, baseUrl, avatarId);
    return res.json({ ok: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to create HeyGen session");
  }
});

router.post("/task", async (req, res) => {
  try {
    const apiKey = process.env.HEYGEN_API_KEY;
    const { session_id: sessionId, text } = req.body || {};

    if (!sessionId || !text) {
      return res.status(400).json({
        ok: false,
        error: { message: "session_id and text are required" }
      });
    }

    const data = await sendHeygenTask(apiKey, baseUrl, sessionId, text);
    return res.json({ ok: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to send HeyGen task");
  }
});

router.post("/keepalive", async (req, res) => {
  try {
    const apiKey = process.env.HEYGEN_API_KEY;
    const { session_id: sessionId } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        error: { message: "session_id is required" }
      });
    }

    const data = await keepHeygenAlive(apiKey, baseUrl, sessionId);
    return res.json({ ok: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to keep HeyGen session alive");
  }
});

router.get("/interactive-avatars", async (req, res) => {
  try {
    const apiKey = process.env.HEYGEN_API_KEY;
    const data = await listStreamingAvatars(apiKey, baseUrl);
    const avatars = data?.data?.avatars || data?.data || [];
    return res.json({ ok: true, data: { avatars, raw: data } });
  } catch (error) {
    return handleError(res, error, "Failed to list interactive avatars");
  }
});

router.post("/photo-avatar", upload.single("image"), async (req, res) => {
  let uploadResult;
  let imageKey;

  try {
    const apiKey = process.env.HEYGEN_API_KEY;
    const { avatar_name: avatarName, name } = req.body || {};
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        ok: false,
        error: { message: "image file is required" }
      });
    }

    uploadResult = await uploadHeygenAsset(apiKey, uploadBaseUrl, file);
    const uploadData = uploadResult?.data || {};
    const urlCandidate =
      uploadData?.url || uploadData?.image_url || uploadData?.asset_url || uploadData?.preview_url;

    if (uploadData?.image_key) {
      imageKey = uploadData.image_key;
    } else if (urlCandidate) {
      try {
        const pathname = new URL(urlCandidate).pathname.replace(/^\//, "");
        imageKey = pathname.startsWith("image/") ? pathname : pathname.split("/image/")[1] && `image/${pathname.split("/image/")[1]}`;
      } catch (error) {
        imageKey = undefined;
      }
    }

    if (!imageKey && (uploadData?.id || uploadData?.asset_id)) {
      const rawId = uploadData.id || uploadData.asset_id;
      imageKey = `image/${rawId}/original`;
    }

    if (!imageKey) {
      return res.status(500).json({
        ok: false,
        error: { message: "Failed to get image_key from HeyGen upload" }
      });
    }

    const avatarResult = await createPhotoAvatarGroup(
      apiKey,
      baseUrlV2,
      imageKey,
      avatarName || name
    );

    return res.json({
      ok: true,
      data: {
        upload: uploadResult,
        avatar_group: avatarResult
      }
    });
  } catch (error) {
    const detailPayload = {
      upstream: error?.detail || error?.message || "Unknown error",
      image_key: imageKey,
      upload: uploadResult
    };
    error.detail = JSON.stringify(detailPayload);
    return handleError(res, error, "Failed to create photo avatar group");
  }
});

router.get("/photo-avatar/status", async (req, res) => {
  try {
    const apiKey = process.env.HEYGEN_API_KEY;
    const { group_id: groupId } = req.query || {};

    if (!groupId) {
      return res.status(400).json({
        ok: false,
        error: { message: "group_id is required" }
      });
    }

    const data = await listAvatarGroupAvatars(apiKey, baseUrlV2, groupId);
    const avatarList =
      data?.data?.avatars ||
      data?.data?.avatar_list ||
      data?.data?.items ||
      [];
    const avatarId = pickAvatarId(avatarList);

    let status = "pending";
    const normalized = avatarList
      .map((item) => item?.status)
      .filter(Boolean)
      .map((value) => value.toLowerCase());

    if (normalized.includes("failed") || normalized.includes("error")) {
      status = "failed";
    } else if (normalized.length > 0 && normalized.every((value) => value === "completed" || value === "complete")) {
      status = "completed";
    } else if (normalized.length === 0) {
      status = "pending";
    } else {
      status = "processing";
    }

    return res.json({
      ok: true,
      data: {
        status,
        avatar_id: avatarId,
        avatar_list: avatarList,
        raw: data
      }
    });
  } catch (error) {
    return handleError(res, error, "Failed to fetch photo avatar status");
  }
});

router.get("/photo-avatar/avatar-id", async (req, res) => {
  try {
    const apiKey = process.env.HEYGEN_API_KEY;
    const { group_id: groupId } = req.query || {};

    if (!groupId) {
      return res.status(400).json({
        ok: false,
        error: { message: "group_id is required" }
      });
    }

    const data = await listAvatarGroupAvatars(apiKey, baseUrlV2, groupId);
    const avatarList =
      data?.data?.avatars ||
      data?.data?.avatar_list ||
      data?.data?.items ||
      [];
    const avatarId = pickAvatarId(avatarList);

    if (!avatarId) {
      return res.status(404).json({
        ok: false,
        error: { message: "avatar_id not found yet", detail: JSON.stringify({ avatar_list: avatarList }) }
      });
    }

    return res.json({
      ok: true,
      data: {
        avatar_id: avatarId,
        avatar_list: avatarList
      }
    });
  } catch (error) {
    return handleError(res, error, "Failed to fetch avatar_id");
  }
});

export default router;

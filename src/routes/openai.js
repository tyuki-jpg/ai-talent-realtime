import { Router } from "express";
import { createChatCompletion } from "../services/openaiClient.js";
import { getPersonaSystem, getCurrentPersonaKey } from "./persona.js";

const router = Router();

router.post("/", async (req, res) => {
  const { user_text: userText, persona_key: personaKey } = req.body || {};

  if (!userText) {
    return res.status(400).json({
      ok: false,
      error: { message: "user_text is required" }
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const key = personaKey || getCurrentPersonaKey();
  const system = getPersonaSystem(key);

  try {
    const result = await createChatCompletion(apiKey, { system, userText });
    return res.json({ ok: true, data: { text: result.text } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      error: { message: "Failed to generate reply", detail: error?.message }
    });
  }
});

export default router;

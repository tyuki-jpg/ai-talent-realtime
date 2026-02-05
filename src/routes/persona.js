import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const personasPath = path.resolve(__dirname, "..", "config", "personas.json");

let personas = {};
let currentPersonaKey = "default";

function loadPersonas() {
  try {
    const raw = fs.readFileSync(personasPath, "utf-8");
    const sanitized = raw.replace(/^\uFEFF/, "");
    personas = JSON.parse(sanitized);
  } catch (error) {
    console.error("Failed to load personas.json", error);
    personas = {};
  }
}

loadPersonas();

router.get("/", (req, res) => {
  res.json({ ok: true, data: { persona_key: currentPersonaKey } });
});

router.post("/", (req, res) => {
  const { persona_key: personaKey } = req.body || {};

  if (!personaKey || !personas[personaKey]) {
    return res.status(400).json({
      ok: false,
      error: { message: "Unknown persona_key" }
    });
  }

  currentPersonaKey = personaKey;

  return res.json({ ok: true, data: { persona_key: currentPersonaKey } });
});

export function getPersonaSystem(personaKey) {
  return personas?.[personaKey]?.system || personas?.default?.system || "You are a helpful assistant.";
}

export function getCurrentPersonaKey() {
  return currentPersonaKey;
}

export function getAllPersonas() {
  return personas;
}

export default router;

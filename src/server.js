import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import liveavatarRoutes from "./routes/liveavatar.js";
import openaiRoutes from "./routes/openai.js";
import personaRoutes from "./routes/persona.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const app = express();
const port = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/liveavatar", liveavatarRoutes);
app.use("/reply", openaiRoutes);
app.use("/persona", personaRoutes);

app.use(express.static(path.join(__dirname, "public")));

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: { message: "Not found" }
  });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error", err);
  res.status(500).json({
    ok: false,
    error: { message: "Server error", detail: err?.message }
  });
});

app.listen(port, () => {
  const key = process.env.LIVEAVATAR_API_KEY || "";
  console.log(`LIVEAVATAR_API_KEY length: ${key.length}`);
  console.log(`Server running at http://localhost:${port}`);
});

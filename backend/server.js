require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { GoogleAuth } = require("google-auth-library");

const app = express();
const PORT = process.env.PORT || 3001;

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.GCP_LOCATION || "eu";
const ENGINE_ID = process.env.ENGINE_ID;

const DISCOVERY_ENGINE_BASE = `https://${LOCATION}-discoveryengine.googleapis.com/v1alpha`;
const ANSWER_ENDPOINT = `${DISCOVERY_ENGINE_BASE}/projects/${PROJECT_ID}/locations/${LOCATION}/collections/default_collection/engines/${ENGINE_ID}/servingConfigs/default_serving_config:answer`;

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

app.use(express.json({ limit: "32kb" }));
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST"],
  })
);

// Call Discovery Engine with a single retry on transient failures
async function callAnswerApi(accessToken, payload, attempt = 1) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55_000);

  try {
    const response = await fetch(ANSWER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Goog-User-Project": PROJECT_ID,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Discovery Engine error (attempt ${attempt}):`, response.status, errorBody);
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      err.detail = errorBody;
      throw err;
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      // Some Discovery Engine responses use newline-delimited JSON — take first complete object
      const firstLine = text.split("\n").find((l) => l.trim().startsWith("{"));
      if (firstLine) return JSON.parse(firstLine);
      throw new Error("Risposta non valida dal servizio di ricerca.");
    }
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      throw Object.assign(new Error("timeout"), { isTimeout: true });
    }

    // Retry once on transient network errors (not 4xx client errors)
    const isTransient = !err.status || err.status >= 500;
    if (attempt === 1 && isTransient) {
      console.warn("Transient error, retrying after 2s…", err.message);
      await new Promise((r) => setTimeout(r, 2000));
      const client = await auth.getClient();
      const { token } = await client.getAccessToken();
      return callAnswerApi(token, payload, 2);
    }

    throw err;
  }
}

app.post("/api/ask", async (req, res) => {
  const { query, sessionId } = req.body;

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return res.status(400).json({ error: "Query non valida." });
  }
  if (query.trim().length > 2000) {
    return res.status(400).json({ error: "La query supera il limite massimo di 2000 caratteri." });
  }
  if (sessionId !== undefined && (typeof sessionId !== "string" || sessionId.trim().length === 0)) {
    return res.status(400).json({ error: "sessionId non valido." });
  }

  try {
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    const payload = {
      query: { text: query.trim() },
      session: sessionId
        ? `projects/${PROJECT_ID}/locations/${LOCATION}/collections/default_collection/engines/${ENGINE_ID}/sessions/${sessionId}`
        : undefined,
      answerGenerationSpec: {
        modelSpec: { modelVersion: "stable" },
        promptSpec: {
          preamble:
            "Sei un assistente storico specializzato nel disastro del Moby Prince (10 aprile 1991). " +
            "Rispondi in italiano, in modo preciso e documentato, citando le fonti disponibili. " +
            "Se l'informazione non è presente nei documenti, dichiaralo esplicitamente.",
        },
      },
      relatedQuestionsSpec: { enable: true },
      searchSpec: {
        searchParams: {
          searchResultMode: "CHUNKS",
          maxReturnResults: 10,
        },
      },
    };

    const data = await callAnswerApi(accessToken, payload);
    res.json(data);
  } catch (err) {
    if (err.isTimeout) {
      return res.status(504).json({
        error: "Il servizio di ricerca non ha risposto in tempo. Riprova tra qualche secondo.",
      });
    }
    if (err.status && err.status < 500) {
      return res.status(err.status).json({
        error: "Errore nella richiesta al servizio di ricerca.",
        detail: err.detail,
      });
    }
    console.error("Internal server error:", err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", project: PROJECT_ID, engine: ENGINE_ID });
});

app.listen(PORT, () => {
  console.log(`Moby Prince backend running on http://localhost:${PORT}`);
  console.log(`Discovery Engine endpoint: ${ANSWER_ENDPOINT}`);
});

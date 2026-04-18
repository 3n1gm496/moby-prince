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

// google-auth-library automatically resolves credentials via:
// 1. GOOGLE_APPLICATION_CREDENTIALS env var (service account key file)
// 2. gcloud Application Default Credentials (~/.config/gcloud/application_default_credentials.json)
// 3. Workload Identity (when running on GCP — Cloud Run, GKE, etc.)
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

app.post("/api/ask", async (req, res) => {
  const { query, sessionId } = req.body;

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return res.status(400).json({ error: "Query non valida." });
  }
  if (query.trim().length > 2000) {
    return res.status(400).json({ error: "La query supera il limite massimo di 2000 caratteri." });
  }

  try {
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    const payload = {
      query: {
        text: query.trim(),
      },
      session: sessionId
        ? `projects/${PROJECT_ID}/locations/${LOCATION}/collections/default_collection/engines/${ENGINE_ID}/sessions/${sessionId}`
        : undefined,
      answerGenerationSpec: {
        modelSpec: {
          modelVersion: "stable",
        },
        promptSpec: {
          preamble:
            "Sei un assistente storico specializzato nel disastro del Moby Prince (10 aprile 1991). " +
            "Rispondi in italiano, in modo preciso e documentato, citando le fonti disponibili. " +
            "Se l'informazione non è presente nei documenti, dichiaralo esplicitamente.",
        },
      },
      relatedQuestionsSpec: {
        enable: true,
      },
      searchSpec: {
        searchParams: {
          searchResultMode: "CHUNKS",
          maxReturnResults: 10,
        },
      },
    };

    const response = await fetch(ANSWER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Goog-User-Project": PROJECT_ID,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Discovery Engine error:", response.status, errorBody);
      return res
        .status(response.status)
        .json({ error: "Errore dal servizio di ricerca.", detail: errorBody });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
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

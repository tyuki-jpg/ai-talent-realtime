import WebSocket from "ws";

const connections = new Map();

function createConnection(sessionId, wsUrl) {
  const ws = new WebSocket(wsUrl);
  const connection = {
    sessionId,
    wsUrl,
    ws,
    state: "connecting",
    connectedAt: null,
    readyPromise: null,
    readyResolve: null,
    readyReject: null
  };

  connection.readyPromise = new Promise((resolve, reject) => {
    connection.readyResolve = resolve;
    connection.readyReject = reject;
  });

  ws.on("open", () => {
    if (connection.state === "connecting") {
      connection.state = "open";
    }
  });

  ws.on("message", (data) => {
    let payload;
    try {
      payload = JSON.parse(data.toString());
    } catch {
      return;
    }

    const messageType = payload?.type || payload?.event_type;
    if (messageType === "session.state_updated") {
      const state = payload?.state || payload?.data?.state;
      if (state === "connected") {
        connection.state = "connected";
        connection.connectedAt = Date.now();
        if (connection.readyResolve) {
          connection.readyResolve();
        }
      }
    }
  });

  ws.on("error", (error) => {
    if (connection.readyReject) {
      connection.readyReject(error);
    }
  });

  ws.on("close", () => {
    connections.delete(sessionId);
  });

  connections.set(sessionId, connection);
  return connection;
}

function getConnection(sessionId) {
  return connections.get(sessionId);
}

export async function ensureWsReady(sessionId, wsUrl) {
  let connection = getConnection(sessionId);
  if (!connection) {
    connection = createConnection(sessionId, wsUrl);
  }

  if (connection.state === "connected") {
    return connection;
  }

  const timeoutMs = 8000;
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("LiveAvatar WebSocket ready timeout")), timeoutMs);
  });

  await Promise.race([connection.readyPromise, timeout]).catch((error) => {
    if (connection.state === "open") {
      return;
    }
    throw error;
  });

  return connection;
}

export function closeWs(sessionId) {
  const connection = getConnection(sessionId);
  if (!connection) return;
  try {
    connection.ws.close();
  } catch {
    // ignore
  }
  connections.delete(sessionId);
}

function chunkBase64(base64, maxChunkSize) {
  const chunks = [];
  for (let i = 0; i < base64.length; i += maxChunkSize) {
    chunks.push(base64.slice(i, i + maxChunkSize));
  }
  return chunks;
}

export async function sendAudioToLiveavatar(sessionId, wsUrl, { audioBase64, sampleRate, format }) {
  if (!audioBase64) {
    throw new Error("audioBase64 is required");
  }

  const connection = await ensureWsReady(sessionId, wsUrl);
  const eventId = `${sessionId}-${Date.now()}`;
  const maxChunkSize = 800000;
  const chunks = chunkBase64(audioBase64, maxChunkSize);
  const includeMeta = process.env.LIVEAVATAR_WS_INCLUDE_AUDIO_META === "true";

  for (const chunk of chunks) {
    const payload = {
      type: "agent.speak",
      event_id: eventId,
      audio: chunk
    };

    if (includeMeta && sampleRate) {
      payload.sample_rate_hz = sampleRate;
    }

    if (includeMeta && format) {
      payload.audio_format = format;
    }

    connection.ws.send(JSON.stringify(payload));
  }

  const endType = process.env.LIVEAVATAR_SPEAK_END_TYPE || "agent.speak_end";
  const endPayload = {
    type: endType,
    event_id: eventId
  };

  connection.ws.send(JSON.stringify(endPayload));
}

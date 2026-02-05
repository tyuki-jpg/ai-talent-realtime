const state = {
  sessionId: null,
  personaKey: "default",
  keepaliveTimer: null,
  livekitRoom: null,
  recognition: null,
  busy: false,
  useGpt: true,
  livekitLoadingPromise: null
};

const els = {
  avatarId: document.getElementById("avatarId"),
  connectBtn: document.getElementById("connectBtn"),
  stopBtn: document.getElementById("stopBtn"),
  fetchPublicBtn: document.getElementById("fetchPublicBtn"),
  fetchUserBtn: document.getElementById("fetchUserBtn"),
  publicSelect: document.getElementById("publicSelect"),
  userSelect: document.getElementById("userSelect"),
  fetchVoicesBtn: document.getElementById("fetchVoicesBtn"),
  voiceSelect: document.getElementById("voiceSelect"),
  fetchContextsBtn: document.getElementById("fetchContextsBtn"),
  contextSelect: document.getElementById("contextSelect"),
  personaSelect: document.getElementById("personaSelect"),
  personaBtn: document.getElementById("personaBtn"),
  personaStatus: document.getElementById("personaStatus"),
  connectionStatus: document.getElementById("connectionStatus"),
  manualText: document.getElementById("manualText"),
  useGptToggle: document.getElementById("useGptToggle"),
  sendBtn: document.getElementById("sendBtn"),
  logBox: document.getElementById("logBox"),
  avatarContainer: document.getElementById("avatarContainer")
};

function log(message, data) {
  const time = new Date().toLocaleTimeString();
  const payload = data ? `\n${JSON.stringify(data, null, 2)}` : "";
  els.logBox.textContent = `[${time}] ${message}${payload}\n` + els.logBox.textContent;
}

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({ ok: false, error: { message: "Invalid JSON" } }));
  if (!data.ok) {
    const err = new Error(data?.error?.message || "API error");
    err.detail = data?.error?.detail;
    throw err;
  }
  return data;
}

function setConnectionStatus(text) {
  els.connectionStatus.textContent = text;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.results)) return value.results;
  if (value && Array.isArray(value.items)) return value.items;
  if (value && Array.isArray(value.avatars)) return value.avatars;
  if (value && Array.isArray(value.data)) return value.data;
  return [];
}

function renderAvatars(selectEl, avatars, prefix) {
  selectEl.innerHTML = "";
  const list = normalizeList(avatars);
  if (list.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "該当なし";
    selectEl.appendChild(option);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "選択してください";
  selectEl.appendChild(placeholder);

  list.forEach((avatar) => {
    const option = document.createElement("option");
    option.value = avatar?.avatar_id || avatar?.id || "";
    option.textContent = `${prefix || "avatar"}: ${avatar?.name || "avatar"} (${option.value || "no-id"})`;
    selectEl.appendChild(option);
  });
}

function renderSimpleSelect(selectEl, items, labelKey, valueKey, emptyText) {
  selectEl.innerHTML = "";
  const list = normalizeList(items);
  if (list.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = emptyText || "該当なし";
    selectEl.appendChild(option);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "選択してください";
  selectEl.appendChild(placeholder);

  list.forEach((item) => {
    const option = document.createElement("option");
    option.value = item?.[valueKey] || item?.id || "";
    option.textContent = `${item?.[labelKey] || item?.name || "item"} (${option.value || "no-id"})`;
    selectEl.appendChild(option);
  });
}

async function handleFetchPublicAvatars() {
  try {
    const response = await api("/liveavatar/avatars/public");
    const avatars = response?.data?.avatars || response?.data?.raw || response?.data;
    const list = normalizeList(avatars);
    renderAvatars(els.publicSelect, list, "Preset");
    log("プリセットアバター取得", { count: list.length });
    if (list.length === 0) {
      log("プリセットアバター raw", response?.data?.raw || response?.data);
    }
  } catch (error) {
    log("プリセットアバター取得失敗", { message: error.message, detail: error.detail });
  }
}

async function handleFetchUserAvatars() {
  try {
    const response = await api("/liveavatar/avatars/user");
    const avatars = response?.data?.avatars || response?.data?.raw || response?.data;
    const list = normalizeList(avatars);
    renderAvatars(els.userSelect, list, "Custom");
    log("カスタムアバター取得", { count: list.length });
    if (list.length === 0) {
      log("カスタムアバター raw", response?.data?.raw || response?.data);
    }
  } catch (error) {
    log("カスタムアバター取得失敗", { message: error.message, detail: error.detail });
  }
}

async function handleFetchVoices() {
  try {
    const response = await api("/liveavatar/voices");
    const voices = response?.data?.voices || response?.data?.raw || response?.data;
    const list = normalizeList(voices);
    renderSimpleSelect(els.voiceSelect, list, "name", "voice_id", "該当なし");
    log("Voice取得", { count: list.length });
  } catch (error) {
    log("Voice取得失敗", { message: error.message, detail: error.detail });
  }
}

async function handleFetchContexts() {
  try {
    const response = await api("/liveavatar/contexts");
    const contexts = response?.data?.contexts || response?.data?.raw || response?.data;
    const list = normalizeList(contexts);
    renderSimpleSelect(els.contextSelect, list, "name", "context_id", "該当なし");
    log("Context取得", { count: list.length });
  } catch (error) {
    log("Context取得失敗", { message: error.message, detail: error.detail });
  }
}

function setPersonaStatus(text) {
  els.personaStatus.textContent = text;
}

function setConnectedUi(connected) {
  els.connectBtn.disabled = connected;
  els.stopBtn.disabled = !connected;
}

function resetAvatarContainer() {
  els.avatarContainer.innerHTML = "<div class=\"avatar-placeholder\">LiveKit接続待ち</div>";
}

function extractLivekitInfo(data) {
  const payload = data?.data || data;
  const candidates = [payload, payload?.start, payload?.start?.data, payload?.livekit, payload?.data, payload?.room];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const url = candidate.livekit_url || candidate.ws_url || candidate.url;
    const token =
      candidate.livekit_token ||
      candidate.livekit_client_token ||
      candidate.livekit_agent_token ||
      candidate.access_token ||
      candidate.token;
    if (url && token) {
      return { url, token };
    }
  }

  return null;
}

function loadLivekitSdk() {
  if (window.LiveKit || window.LivekitClient) {
    return Promise.resolve();
  }

  if (state.livekitLoadingPromise) {
    return state.livekitLoadingPromise;
  }

  state.livekitLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/livekit-client.umd.js";
    script.async = true;
    script.onload = () => {
      if (!window.LiveKit && window.LivekitClient) {
        window.LiveKit = window.LivekitClient;
      }
      log("LiveKit SDKロード完了");
      resolve();
    };
    script.onerror = () => {
      reject(new Error("LiveKit SDK load failed"));
    };
    document.head.appendChild(script);
  });

  return state.livekitLoadingPromise;
}

async function connectLivekit(info) {
  if (!info) {
    log("LiveKit接続情報なし", info);
    return;
  }

  if (!window.LiveKit && window.LivekitClient) {
    window.LiveKit = window.LivekitClient;
  }

  if (!window.LiveKit) {
    try {
      await loadLivekitSdk();
    } catch (error) {
      log("LiveKit SDK読込失敗", { message: error.message });
      return;
    }
  }

  try {
    const room = new window.LiveKit.Room();
    state.livekitRoom = room;

    room.on(window.LiveKit.RoomEvent.TrackSubscribed, (track, publication, participant) => {
      const isLocal = participant?.isLocal ?? false;
      log("LiveKit TrackSubscribed", {
        kind: track.kind,
        sid: track.sid,
        source: track.source,
        participant: participant?.identity,
        isLocal
      });
      if (track.kind === "video") {
        if (isLocal) {
          return;
        }
        const video = track.attach();
        video.autoplay = true;
        video.playsInline = true;
        resetAvatarContainer();
        els.avatarContainer.appendChild(video);
      }

      if (track.kind === "audio") {
        if (isLocal) {
          return;
        }
        const identity = participant?.identity || "";
        if (identity && !identity.toLowerCase().includes("heygen")) {
          log("Skip non-avatar audio", { participant: identity });
          return;
        }
        const audio = track.attach();
        audio.autoplay = true;
        audio.playsInline = true;
        audio.muted = false;
        audio.volume = 1;
        els.avatarContainer.appendChild(audio);
        const playResult = audio.play();
        if (playResult && typeof playResult.then === "function") {
          playResult.then(
            () => log("Audio play started"),
            (error) => log("Audio play failed", { message: error.message })
          );
        }
        audio.onloadedmetadata = () => log("Audio loadedmetadata", { duration: audio.duration });
        audio.oncanplay = () => log("Audio canplay", { readyState: audio.readyState });
        audio.onplay = () => log("Audio onplay");
        audio.onpause = () => log("Audio onpause");
        audio.onended = () => log("Audio ended");
        if (track.on && window.LiveKit?.TrackEvent) {
          track.on(window.LiveKit.TrackEvent.Muted, () => {
            log("Audio track muted");
          });
          track.on(window.LiveKit.TrackEvent.Unmuted, () => {
            log("Audio track unmuted");
            const retry = audio.play();
            if (retry && typeof retry.then === "function") {
              retry.then(
                () => log("Audio play retry started"),
                (error) => log("Audio play retry failed", { message: error.message })
              );
            }
          });
        }
        log("Audio element attached", {
          muted: audio.muted,
          volume: audio.volume,
          readyState: audio.readyState,
          trackMuted: typeof track.isMuted === "function" ? track.isMuted() : undefined,
          enabled: track.mediaStreamTrack?.enabled,
          mediaTrackMuted: track.mediaStreamTrack?.muted
        });
      }
    });

    await room.connect(info.url, info.token);
    log("LiveKit接続成功", info);
  } catch (error) {
    log("LiveKit接続失敗", { message: error.message });
  }
}

function startKeepalive() {
  stopKeepalive();
  state.keepaliveTimer = setInterval(async () => {
    if (!state.sessionId) return;
    try {
      await api("/liveavatar/keepalive", "POST", { session_id: state.sessionId });
      log("keepalive送信");
    } catch (error) {
      log("keepalive失敗", { message: error.message, detail: error.detail });
    }
  }, 30000);
}

function stopKeepalive() {
  if (state.keepaliveTimer) {
    clearInterval(state.keepaliveTimer);
    state.keepaliveTimer = null;
  }
}

function startRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    log("Web Speech APIが利用できません。Chromeを推奨します。");
    return;
  }

  const recognition = new SpeechRecognition();
  state.recognition = recognition;
  recognition.lang = "ja-JP";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = async (event) => {
    const transcript = event.results?.[event.results.length - 1]?.[0]?.transcript;
    if (!transcript || state.busy) return;

    state.busy = true;
    log("音声認識", { text: transcript });

    try {
      if (state.useGpt) {
        const reply = await api("/reply", "POST", {
          user_text: transcript,
          persona_key: state.personaKey
        });
        log("GPT応答", reply.data);
        await sendAgentText(reply.data.text);
      } else {
        await sendAgentText(transcript);
      }
    } catch (error) {
      log("音声フロー失敗", { message: error.message, detail: error.detail });
    } finally {
      state.busy = false;
    }
  };

  recognition.onerror = (event) => {
    log("音声認識エラー", { error: event.error });
  };

  recognition.start();
  log("音声認識開始");
}

function stopRecognition() {
  if (state.recognition) {
    state.recognition.stop();
    state.recognition = null;
    log("音声認識停止");
  }
}

async function handleConnect() {
  const avatarId = els.avatarId.value.trim();
  if (!avatarId) {
    log("avatar_idを入力してください");
    return;
  }

  const voiceId = els.voiceSelect.value;
  const contextId = els.contextSelect.value;
  if (!voiceId || !contextId) {
    log("voice_id と context_id を選択してください");
    return;
  }

  setConnectionStatus("接続中...");
  try {
    const response = await api("/liveavatar/new-session", "POST", {
      avatar_id: avatarId,
      voice_id: voiceId,
      context_id: contextId,
      mode: "FULL"
    });
    log("LiveAvatar session作成", response.data);

    const payload = response.data;
    const sessionId = payload.session_id || payload.data?.session_id;
    if (!sessionId) {
      throw new Error("session_idが見つかりません");
    }

    state.sessionId = sessionId;
    setConnectedUi(true);
    setConnectionStatus(`接続済み: ${sessionId}`);
    startKeepalive();

    const livekitInfo = extractLivekitInfo(response.data);
    await connectLivekit(livekitInfo);
    startRecognition();
  } catch (error) {
    setConnectionStatus("接続失敗");
    log("接続失敗", { message: error.message, detail: error.detail });
  }
}

async function handleStop() {
  stopKeepalive();
  stopRecognition();

  if (state.livekitRoom) {
    state.livekitRoom.disconnect();
    state.livekitRoom = null;
  }

  const sessionId = state.sessionId;
  state.sessionId = null;
  setConnectedUi(false);
  setConnectionStatus("停止済み");
  resetAvatarContainer();

  if (sessionId) {
    try {
      await api("/liveavatar/stop", "POST", { session_id: sessionId, reason: "USER_DISCONNECTED" });
    } catch (error) {
      log("LiveAvatar停止失敗", { message: error.message, detail: error.detail });
    }
  }
}

async function handlePersonaChange() {
  const personaKey = els.personaSelect.value;
  try {
    const response = await api("/persona", "POST", { persona_key: personaKey });
    state.personaKey = response.data.persona_key;
    setPersonaStatus(state.personaKey);
    log("ペルソナ切替", response.data);
  } catch (error) {
    log("ペルソナ切替失敗", { message: error.message, detail: error.detail });
  }
}

async function handleManualSend() {
  const text = els.manualText.value.trim();
  if (!text) {
    log("送信テキストを入力してください");
    return;
  }

  try {
    if (state.useGpt) {
      const reply = await api("/reply", "POST", {
        user_text: text,
        persona_key: state.personaKey
      });
      log("GPT応答", reply.data);
      await sendAgentText(reply.data.text);
    } else {
      await sendAgentText(text);
    }
  } catch (error) {
    log("手入力フロー失敗", { message: error.message, detail: error.detail });
  }
}

async function sendAgentText(text) {
  if (!state.sessionId) {
    log("session_id未設定のため送信しませんでした");
    return;
  }
  if (!state.livekitRoom) {
    log("LiveKit未接続のため送信しませんでした");
    return;
  }

  try {
    const event = {
      event_type: "avatar.speak_text",
      session_id: state.sessionId,
      text
    };
    const payload = JSON.stringify(event);
    const data = new TextEncoder().encode(payload);
    await state.livekitRoom.localParticipant.publishData(data, {
      reliable: true,
      topic: "agent-control"
    });
    log("LiveAvatar発話イベント送信", { text });
  } catch (error) {
    log("LiveAvatar発話イベント送信失敗", { message: error.message });
  }
}

async function init() {
  if (!window.LiveKit) {
    try {
      const res = await fetch("/vendor/livekit-client.umd.js", { method: "HEAD" });
      log("LiveKit SDK取得チェック", { status: res.status });
    } catch (error) {
      log("LiveKit SDK取得チェック失敗", { message: error.message });
    }
  }

  if (els.useGptToggle) {
    state.useGpt = Boolean(els.useGptToggle.checked);
  }

  try {
    const response = await api("/persona");
    state.personaKey = response.data.persona_key;
    els.personaSelect.value = state.personaKey;
    setPersonaStatus(state.personaKey);
  } catch (error) {
    log("初期ペルソナ取得失敗", { message: error.message, detail: error.detail });
  }
}

els.connectBtn.addEventListener("click", handleConnect);
els.stopBtn.addEventListener("click", handleStop);
els.fetchPublicBtn.addEventListener("click", handleFetchPublicAvatars);
els.fetchUserBtn.addEventListener("click", handleFetchUserAvatars);
els.fetchVoicesBtn.addEventListener("click", handleFetchVoices);
els.fetchContextsBtn.addEventListener("click", handleFetchContexts);
els.publicSelect.addEventListener("change", () => {
  const value = els.publicSelect.value;
  if (value) {
    els.avatarId.value = value;
  }
});
els.userSelect.addEventListener("change", () => {
  const value = els.userSelect.value;
  if (value) {
    els.avatarId.value = value;
  }
});
els.personaBtn.addEventListener("click", handlePersonaChange);
els.sendBtn.addEventListener("click", handleManualSend);
els.useGptToggle.addEventListener("change", () => {
  state.useGpt = Boolean(els.useGptToggle.checked);
  log("GPT利用切替", { enabled: state.useGpt });
});

init();

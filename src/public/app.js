const state = {
  sessionId: null,
  personaKey: "default",
  keepaliveTimer: null,
  livekitRoom: null,
  recognition: null,
  busy: false,
  useGpt: true,
  livekitLoadingPromise: null,
  mode: "FULL",
  audioStatsTimer: null,
  audioContext: null
};

const els = {
  avatarId: document.getElementById("avatarId"),
  modeSelect: document.getElementById("modeSelect"),
  connectBtn: document.getElementById("connectBtn"),
  stopBtn: document.getElementById("stopBtn"),
  fetchPublicBtn: document.getElementById("fetchPublicBtn"),
  fetchUserBtn: document.getElementById("fetchUserBtn"),
  publicSelect: document.getElementById("publicSelect"),
  userSelect: document.getElementById("userSelect"),
  fetchVoicesBtn: document.getElementById("fetchVoicesBtn"),
  voiceSelect: document.getElementById("voiceSelect"),
  ttsVoiceId: document.getElementById("ttsVoiceId"),
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

async function logOutputDevices(context) {
  if (!navigator.mediaDevices?.enumerateDevices) {
    log("OutputDevices: enumerateDevices unsupported");
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices
      .filter((device) => device.kind === "audiooutput")
      .map((device) => ({ deviceId: device.deviceId, label: device.label || "(no label)" }));
    log("OutputDevices", { context, outputs });
  } catch (error) {
    log("OutputDevices error", { message: error.message });
  }
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

function updateModeUi() {
  const mode = els.modeSelect?.value || "FULL";
  state.mode = mode;
  const isCustom = mode !== "FULL";
  els.voiceSelect.disabled = isCustom;
  els.fetchVoicesBtn.disabled = isCustom;
  els.contextSelect.disabled = isCustom;
  els.fetchContextsBtn.disabled = isCustom;
  els.ttsVoiceId.disabled = !isCustom;
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

    room.on(window.LiveKit.RoomEvent.DataReceived, (payload, participant, kind, topic) => {
      let text = "";
      try {
        text = new TextDecoder().decode(payload);
      } catch {
        text = String(payload);
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      log("LiveKit DataReceived", {
        topic,
        kind,
        participant: participant?.identity,
        data: parsed
      });
    });

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
        const identityLower = identity.toLowerCase();
        const allowAudio =
          !identity ||
          identityLower.includes("heygen") ||
          identityLower.includes("liveavatar") ||
          identityLower.includes("agent");
        if (!allowAudio) {
          log("Skip non-avatar audio", { participant: identity });
          return;
        }
        const audio = track.attach();
        audio.autoplay = true;
        audio.playsInline = true;
        audio.muted = false;
        audio.volume = 1;
        els.avatarContainer.appendChild(audio);
        if (typeof audio.setSinkId === "function") {
          log("Audio sinkId", { sinkId: audio.sinkId || "default" });
        } else {
          log("Audio sinkId unsupported");
        }
        logOutputDevices("audio-attached");
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
        if (track.mediaStreamTrack) {
          track.mediaStreamTrack.onmute = () => log("Audio mediaStreamTrack muted");
          track.mediaStreamTrack.onunmute = () => log("Audio mediaStreamTrack unmuted");
        }
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

function stopAudioStats() {
  if (state.audioStatsTimer) {
    clearInterval(state.audioStatsTimer);
    state.audioStatsTimer = null;
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
        await sendAvatarText(reply.data.text);
      } else {
        await sendAvatarText(transcript);
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

async function logAudioStats(room) {
  if (!room) return;
  const participants = room.remoteParticipants ? Array.from(room.remoteParticipants.values()) : [];
  if (participants.length === 0) {
    log("AudioStats: remote participants not found");
    return;
  }

  for (const participant of participants) {
    const publications = participant.audioTrackPublications
      ? Array.from(participant.audioTrackPublications.values())
      : [];
    if (publications.length === 0) {
      log("AudioStats: no audio publications", { participant: participant.identity });
      continue;
    }
    for (const pub of publications) {
      const track = pub?.track;
      if (!track) {
        log("AudioStats: track missing", {
          participant: participant.identity,
          trackSid: pub.trackSid,
          muted: pub.isMuted,
          subscribed: pub.isSubscribed
        });
        continue;
      }
      if (typeof track.getStats !== "function") {
        log("AudioStats: getStats unavailable", {
          participant: participant.identity,
          trackSid: pub.trackSid
        });
        continue;
      }
      try {
        const stats = await track.getStats();
        let inboundBytes = 0;
        let packets = 0;
        stats.forEach((report) => {
          if (report.type === "inbound-rtp" && (report.kind === "audio" || report.mediaType === "audio")) {
            inboundBytes += report.bytesReceived || 0;
            packets += report.packetsReceived || 0;
          }
        });
        log("AudioStats", {
          participant: participant.identity,
          trackSid: pub.trackSid,
          muted: pub.isMuted,
          subscribed: pub.isSubscribed,
          bytesReceived: inboundBytes,
          packetsReceived: packets
        });
      } catch (error) {
        log("AudioStats error", { participant: participant.identity, message: error.message });
      }
    }
  }
}

async function handleConnect() {
  const avatarId = els.avatarId.value.trim();
  if (!avatarId) {
    log("avatar_idを入力してください");
    return;
  }

  const mode = state.mode || "FULL";
  const voiceId = els.voiceSelect.value;
  const contextId = els.contextSelect.value;
  if (mode === "FULL" && (!voiceId || !contextId)) {
    log("voice_id と context_id を選択してください");
    return;
  }

  setConnectionStatus("接続中...");
  try {
    const response = await api("/liveavatar/new-session", "POST", {
      avatar_id: avatarId,
      voice_id: voiceId,
      context_id: contextId,
      mode
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
    stopAudioStats();
    state.audioStatsTimer = setInterval(() => {
      logAudioStats(state.livekitRoom);
    }, 5000);
  } catch (error) {
    setConnectionStatus("接続失敗");
    log("接続失敗", { message: error.message, detail: error.detail });
  }
}

async function handleStop() {
  stopKeepalive();
  stopRecognition();
  stopAudioStats();

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
      await sendAvatarText(reply.data.text);
    } else {
      await sendAvatarText(text);
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
    log("LiveAvatar発話イベント送信", { text, topic: "agent-control" });
  } catch (error) {
    log("LiveAvatar発話イベント送信失敗", { message: error.message });
  }
}

async function sendCustomAudio(text) {
  if (!state.sessionId) {
    log("session_id未設定のため送信しませんでした");
    return;
  }

  try {
    const voiceId = els.ttsVoiceId.value.trim();
    const response = await api("/liveavatar/speak", "POST", {
      session_id: state.sessionId,
      text,
      tts_voice_id: voiceId || undefined
    });
    log("Custom TTS送信", { text });
    const audioBase64 = response?.data?.audio_base64;
    const sampleRate = response?.data?.sample_rate_hz || 24000;
    const format = response?.data?.audio_format || "pcm_s16le";
    if (audioBase64) {
      playPcm16leBase64(audioBase64, sampleRate, format);
    }
  } catch (error) {
    log("Custom TTS送信失敗", { message: error.message, detail: error.detail });
  }
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function playPcm16leBase64(base64, sampleRate, format) {
  if (format !== "pcm_s16le") {
    log("Custom audio format unsupported for local playback", { format });
    return;
  }
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      log("AudioContext unsupported");
      return;
    }
    if (!state.audioContext) {
      state.audioContext = new AudioContext({ sampleRate: sampleRate || 24000 });
    }
    const ctx = state.audioContext;
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    const buffer = base64ToArrayBuffer(base64);
    const int16 = new Int16Array(buffer);
    const audioBuffer = ctx.createBuffer(1, int16.length, sampleRate || 24000);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < int16.length; i += 1) {
      channel[i] = int16[i] / 32768;
    }
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start();
    log("Custom audio local playback", { sampleRate: sampleRate || 24000, frames: int16.length });
  } catch (error) {
    log("Custom audio playback failed", { message: error.message });
  }
}

async function sendAvatarText(text) {
  if (state.mode === "FULL") {
    await sendAgentText(text);
    return;
  }
  await sendCustomAudio(text);
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

  if (els.modeSelect) {
    updateModeUi();
  }

  logOutputDevices("init");

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
els.modeSelect?.addEventListener("change", () => {
  updateModeUi();
  log("Mode切替", { mode: state.mode });
});

init();

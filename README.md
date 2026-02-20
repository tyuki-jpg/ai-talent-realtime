# AI Talent Realtime Demo

LiveAvatar + OpenAI（gpt-4o-mini）リアルタイム会話のローカル検証用プロトタイプです。ブラウザで起動し、音声認識 → GPT 応答 → LiveAvatar アバター発話までの一連の流れを確認できます。

## セットアップ

1) 依存インストール
```
cd c:\Project\ai-talent-realtime
npm install
```

2) 環境変数を設定
```
cp .env.example .env
cp .env.local.example .env.local
```

`.env` に以下を設定します。
```
LIVEAVATAR_BASE_URL=https://api.liveavatar.com/v1
LIVEAVATAR_INSECURE_TLS=false
OPENAI_INSECURE_TLS=false
PORT=3000
CUSTOM_TTS_ENDPOINT=
CUSTOM_TTS_INSECURE_TLS=false
CUSTOM_TTS_AUTH_HEADER=Authorization
CUSTOM_TTS_AUTH_PREFIX=Bearer
CUSTOM_TTS_PROVIDER=openai
CUSTOM_TTS_MODEL=gpt-4o-mini-tts
CUSTOM_TTS_VOICE=alloy
CUSTOM_TTS_VOICE_IS_CUSTOM=false
CUSTOM_TTS_RESPONSE_FORMAT=pcm
CUSTOM_TTS_SAMPLE_RATE=24000
CUSTOM_TTS_RETURN_AUDIO=false
LIVEAVATAR_WS_INCLUDE_AUDIO_META=false
LIVEAVATAR_SPEAK_END_TYPE=agent.speak_end
LIVEAVATAR_CUSTOM_LIVEKIT_URL=
LIVEAVATAR_CUSTOM_LIVEKIT_ROOM=
LIVEAVATAR_CUSTOM_LIVEKIT_TOKEN=
```

`.env.local` に API キーを設定します。
```
OPENAI_API_KEY=
LIVEAVATAR_API_KEY=
CUSTOM_TTS_API_KEY=
```

3) 起動
```
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## 使い方

1) プリセット or カスタムアバター一覧を取得して Avatar ID を選択
2) Mode を選択（FULL=LiveAvatar Voice / CUSTOM=Custom TTS）
3) FULL の場合は Voice / Context を選択して「接続開始」
   - カスタムアバターを選択し、Voice 一覧取得後は `default_voice`（private voice）が自動選択されます。
4) LiveKit 接続情報が返ると自動で映像・音声を接続
5) 音声認識でテキスト化 → /reply で GPT 応答 → LiveKit Data Channel（agent-control）で発話イベント送信
6) keepalive は 30 秒間隔で自動送信（停止ボタンで停止）

手入力で送信ボタンを使うと、音声なしで GPT と LiveAvatar 発話をテストできます。
CUSTOM モードでは、/liveavatar/speak 経由でカスタム TTS 音声を LiveAvatar に送信します。

## エンドポイント

- GET  `/liveavatar/avatars/public` : プリセットアバター一覧
- GET  `/liveavatar/avatars/user` : カスタムアバター一覧
- GET  `/liveavatar/voices` : Voice 一覧（public/private）
- GET  `/liveavatar/contexts` : Context 一覧
- POST `/liveavatar/new-session` : avatar_id / voice_id / context_id を受け取り session_id と LiveKit 情報を返す
- POST `/liveavatar/speak` : session_id / text / tts_voice_id を受け取りカスタム音声を送信
- POST `/liveavatar/keepalive` : session_id を受け取り keepalive 送信
- POST `/liveavatar/stop` : session_id を受け取りセッション停止
- POST `/reply` : user_text と persona_key を受け取り GPT 応答生成
- GET  `/persona` : 現在の persona_key 取得
- POST `/persona` : persona_key 切替

すべてのレスポンスは以下の形式です。
```
{ "ok": true, "data": { ... } }
{ "ok": false, "error": { "message": "...", "detail": "..." } }
```

## ペルソナ

`src/config/personas.json` に定義されています。UI から切替可能です。

## トラブルシュート

- **SSL エラー (self-signed certificate)**
  - 企業プロキシ等の証明書が原因の可能性があります。暫定回避として `.env` に `LIVEAVATAR_INSECURE_TLS=true` / `OPENAI_INSECURE_TLS=true` を設定すると TLS 検証を無効化します（本番では非推奨）。
- **マイクが使えない**
  - ブラウザのマイク許可を有効にしてください（Chrome 推奨）。
- **API キー未設定エラー**
  - `.env.local` に `OPENAI_API_KEY` / `LIVEAVATAR_API_KEY` を設定してください。
- **LiveKit 映像が出ない**
  - LiveAvatar から返る LiveKit 接続情報のキー名が異なる可能性があります。
  - `src/public/app.js` の `extractLivekitInfo` を調整してください。
  - LiveKit SDK が読み込めていない場合は `src/public/vendor/livekit-client.umd.js` の存在を確認してください。
- **CUSTOM モードで音声が出ない**
  - `.env` の `CUSTOM_TTS_ENDPOINT` が未設定の場合はエラーになります。
  - OpenAI TTS を使う場合は `CUSTOM_TTS_PROVIDER=openai` と `CUSTOM_TTS_ENDPOINT=https://api.openai.com/v1/audio/speech` を設定してください。
  - 独自TTSの場合は `CUSTOM_TTS_ENDPOINT` が `{ text, voice_id, format, sample_rate_hz }` を受け取り、`audio_base64` を返す必要があります。
  - LiveAvatar が ws_url を返さない場合、CUSTOM モードでの開始に失敗している可能性があります。
  - CUSTOM モードは **LiveAvatar側から音声が返ってこないことがあります**。その場合は `CUSTOM_TTS_RETURN_AUDIO=true` にしてローカル再生してください。

## セキュリティ

サーバーは `LIVEAVATAR_API_KEY` / `OPENAI_API_KEY` をフロントに返しません。

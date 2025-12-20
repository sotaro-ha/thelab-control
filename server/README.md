# Lab Control Server - QubiLink対応

このサーバーは、ブラウザからのポーズデータを受信し、QubiLinkプロトコルを使用してブロードキャスト経由でロボットを制御します。

## セットアップ

```bash
cd server
npm install
```

## 起動方法

```bash
npm start
```

開発モード（自動再起動）:
```bash
npm run dev
```

## QubiLinkプロトコル

### ディスカバリー

サーバーは起動時と5秒ごとに、ポート **12340** でブロードキャストディスカバリーリクエストを送信します。

**ディスカバリーリクエスト（サーバー → ブロードキャスト）:**
```json
{
  "type": "discover",
  "proto": "qubilink",
  "ver": 1
}
```

**アナウンスメッセージ（ロボット → ブロードキャスト）:**
```json
{
  "type": "announce",
  "proto": "qubilink",
  "ver": 1,
  "device_id": "actuator_01",
  "caps": {
    "control": true,
    "video_in": false,
    "video_out": false
  },
  "ip": "192.168.1.100",
  "ports": {
    "control": 12345,
    "video_in": 0
  },
  "nonce": 1234567890
}
```

### コントロールコマンド

検出されたデバイスのIPアドレスとコントロールポート（通常12345）にコマンドを送信します。

**サーボ制御コマンド:**
```json
{
  "action": "set_servo",
  "params": {
    "angle": 90.0
  }
}
```

- `angle`: 0-180の範囲の角度（float）

## ポーズから角度への変換

MediaPipeのポーズランドマークから、サーボ角度を自動計算します。

現在の実装：
- **右手首**（ランドマーク16）のY座標を使用
- Y座標 0（上） → 角度 180度
- Y座標 1（下） → 角度 0度
- 見えない場合（visibility < 0.5）→ 90度（ニュートラル）

### カスタマイズ例

`server.js`の`calculateServoAngle`関数を編集して、異なるランドマークや計算方法を使用できます：

```javascript
function calculateServoAngle(landmarks) {
  // 例1: 左手首を使用
  const leftWrist = landmarks[15]
  if (leftWrist && leftWrist.visibility > 0.5) {
    return Math.round((1 - leftWrist.y) * 180)
  }

  // 例2: 両手の平均
  const leftWrist = landmarks[15]
  const rightWrist = landmarks[16]
  if (leftWrist?.visibility > 0.5 && rightWrist?.visibility > 0.5) {
    const avgY = (leftWrist.y + rightWrist.y) / 2
    return Math.round((1 - avgY) * 180)
  }

  // 例3: 肘の角度を使用
  const shoulder = landmarks[12] // 右肩
  const elbow = landmarks[14]    // 右肘
  const wrist = landmarks[16]    // 右手首

  if (shoulder && elbow && wrist) {
    // 角度計算のロジック
    const angle = calculateArmAngle(shoulder, elbow, wrist)
    return angle
  }

  return 90 // デフォルト
}
```

## APIエンドポイント

### WebSocket: `ws://localhost:3001`

**送信（フロントエンド → サーバー）:**
```json
{
  "type": "pose",
  "timestamp": 1234567890,
  "landmarks": [...]
}
```

**受信（サーバー → フロントエンド）:**
```json
{
  "type": "devices",
  "devices": [
    {
      "id": "actuator_01",
      "ip": "192.168.1.100",
      "controlPort": 12345,
      "capabilities": { "control": true },
      "lastSeen": 1234567890
    }
  ]
}
```

### REST API

#### `GET /health`
サーバーの状態とデバイス数を取得

**レスポンス:**
```json
{
  "status": "ok",
  "devices": 1
}
```

#### `GET /api/devices`
検出されたデバイスのリストを取得

**レスポンス:**
```json
{
  "devices": [
    {
      "id": "actuator_01",
      "ip": "192.168.1.100",
      "controlPort": 12345,
      "capabilities": { "control": true },
      "lastSeen": 1234567890
    }
  ]
}
```

#### `POST /api/discover`
手動でディスカバリーリクエストを送信

#### `POST /api/command/:deviceId`
特定のデバイスに直接コマンドを送信

**リクエスト:**
```json
{
  "angle": 90
}
```

**レスポンス:**
```json
{
  "success": true
}
```

#### `POST /api/feedback`
ユーザーの感想を保存

**リクエスト:**
```json
{
  "feedback": "とても楽しかったです！"
}
```

## MediaPipeランドマーク一覧

```
0-10:  顔（鼻、目、耳、口）
11:    左肩
12:    右肩
13:    左肘
14:    右肘
15:    左手首
16:    右手首
17-22: 手
23:    左腰
24:    右腰
25:    左膝
26:    右膝
27:    左足首
28:    右足首
29-32: 足
```

各ランドマークの構造：
```javascript
{
  x: 0.5,          // 水平位置（0-1の正規化座標）
  y: 0.5,          // 垂直位置（0-1の正規化座標）
  z: -0.1,         // 深度（カメラからの相対距離）
  visibility: 0.99 // 検出の信頼度（0-1）
}
```

## ネットワーク設定

### ファイアウォール設定

以下のポートを開放してください：

- **12340 (UDP)**: ディスカバリー（受信）
- **12345 (UDP)**: コントロール（送信）
- **3001 (TCP)**: HTTPとWebSocket

### 同じネットワーク内での動作確認

1. サーバーとロボットが同じWi-Fiネットワークに接続していることを確認
2. サーバーを起動
3. ログに「Device discovered」と表示されることを確認
4. ブラウザで `/motion` ページを開き、体を動かす
5. ログに「Sent to actuator_01: angle=XXX」と表示されることを確認

### トラブルシューティング

#### デバイスが検出されない

1. 同じネットワークに接続しているか確認
   ```bash
   # サーバーのIPを確認
   ifconfig  # macOS/Linux
   ipconfig  # Windows
   ```

2. ファイアウォールを確認
   ```bash
   # macOS: システム環境設定 → セキュリティとプライバシー → ファイアウォール
   # Windows: コントロールパネル → Windows Defender ファイアウォール
   ```

3. 手動でディスカバリーを実行
   ```bash
   curl -X POST http://localhost:3001/api/discover
   ```

4. デバイスログを確認（actuator.cppのシリアル出力）

#### コマンドが届かない

1. デバイスが検出されているか確認
   ```bash
   curl http://localhost:3001/api/devices
   ```

2. 手動でコマンドを送信してテスト
   ```bash
   curl -X POST http://localhost:3001/api/command/actuator_01 \
     -H "Content-Type: application/json" \
     -d '{"angle": 90}'
   ```

3. サーバーログで「Sent to actuator_01」メッセージを確認

#### パフォーマンスの問題

フレームレートを調整（`server.js`）:
```javascript
const POSE_SEND_INTERVAL = 100 // 50ms → 100ms（20fps → 10fps）
```

## 開発Tips

### デバッグモード

詳細なログを表示：
```javascript
// server.jsの先頭に追加
const DEBUG = true

// ログ出力を追加
if (DEBUG) {
  console.log('Pose data:', landmarks)
  console.log('Calculated angle:', angle)
}
```

### カスタムコマンドの追加

```javascript
// server.jsに追加
function sendCustomCommand(deviceId, commandData) {
  const device = discoveredDevices.get(deviceId)
  if (!device) return

  const command = {
    action: 'custom_action',
    params: commandData
  }

  const buffer = Buffer.from(JSON.stringify(command))
  controlSocket.send(buffer, 0, buffer.length, device.controlPort, device.ip)
}
```

### 複数デバイスの個別制御

```javascript
// 左手で actuator_01、右手で actuator_02 を制御
function calculateAnglesForMultipleDevices(landmarks) {
  return {
    'actuator_01': calculateAngleFromWrist(landmarks[15]), // 左手首
    'actuator_02': calculateAngleFromWrist(landmarks[16])  // 右手首
  }
}
```

## ライセンス

MIT License

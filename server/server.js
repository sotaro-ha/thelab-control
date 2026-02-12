import express from 'express'
import { WebSocketServer } from 'ws'
import dgram from 'dgram'
import cors from 'cors'

const app = express()
const PORT = 3001

// QubiLink プロトコル設定
const DISCOVERY_UDP_PORT = 12340
const CONTROL_PORT = 12345
const BROADCAST_ADDRESS = '255.255.255.255'

app.use(cors())
app.use(express.json())

// 検出されたデバイスを保存
const discoveredDevices = new Map()

const experienceState = {
  step: 'explain',
  captures: {
    min: false,
    max: false
  },
  robotEnabled: false,
  captureRequestId: null,
  captureTarget: null
}

function resetExperienceState() {
  experienceState.step = 'explain'
  experienceState.captures = { min: false, max: false }
  experienceState.robotEnabled = false
  experienceState.captureRequestId = null
  experienceState.captureTarget = null
}

// UDPソケットの作成（ディスカバリー用）
const discoverySocket = dgram.createSocket('udp4')

// UDPソケットの作成（コントロール用）
const controlSocket = dgram.createSocket('udp4')

// ブロードキャスト送信を有効化
controlSocket.bind(() => {
  controlSocket.setBroadcast(true)
})

// ディスカバリーソケットの設定
discoverySocket.on('message', (msg, rinfo) => {
  try {
    const data = JSON.parse(msg.toString())

    // QubiLinkプロトコルのチェック
    if (data.proto === 'qubilink' && data.ver === 1) {
      if (data.type === 'announce' || data.type === 'reply') {
        const deviceId = data.device_id
        const deviceInfo = {
          id: deviceId,
          ip: data.ip || rinfo.address,
          controlPort: data.ports?.control || CONTROL_PORT,
          capabilities: data.caps || {},
          lastSeen: Date.now()
        }

        discoveredDevices.set(deviceId, deviceInfo)
        console.log(`📡 Device discovered: ${deviceId} at ${deviceInfo.ip}:${deviceInfo.controlPort}`)
      }
    }
  } catch (error) {
    // JSON解析エラーは無視
  }
})

discoverySocket.on('error', (err) => {
  console.error('Discovery socket error:', err)
})

// ディスカバリーソケットをバインド
discoverySocket.bind(DISCOVERY_UDP_PORT, () => {
  console.log(`🔍 Discovery listener on port ${DISCOVERY_UDP_PORT}`)
})

// ディスカバリーリクエストを送信
function sendDiscoveryRequest() {
  const message = JSON.stringify({
    type: 'discover',
    proto: 'qubilink',
    ver: 1
  })

  const buffer = Buffer.from(message)
  controlSocket.send(buffer, 0, buffer.length, DISCOVERY_UDP_PORT, BROADCAST_ADDRESS, (err) => {
    if (err) {
      console.error('Discovery broadcast error:', err)
    } else {
      console.log('📡 Discovery request sent')
    }
  })
}

// 定期的にディスカバリーを実行
setInterval(sendDiscoveryRequest, 5000)
setTimeout(sendDiscoveryRequest, 1000) // 起動時にすぐ実行

// ポーズデータからサーボ角度を計算
function calculateServoAngle(landmarks) {
  // MediaPipeのランドマーク:
  // 11: 左肩, 12: 右肩
  // 13: 左肘, 14: 右肘
  // 15: 左手首, 16: 右手首

  if (!landmarks || landmarks.length < 16) {
    return 90 // デフォルト角度
  }

  // 右手首の高さを使用（0が上、1が下）
  const rightWrist = landmarks[16]

  if (!rightWrist || rightWrist.visibility < 0.5) {
    return 90 // 見えない場合はニュートラル
  }

  // y座標を角度に変換（0-1 → 180-0）
  // y=0（上）→ 180度, y=1（下）→ 0度
  const angle = Math.round((1 - rightWrist.y) * 180)

  // 0-180の範囲に制限
  return Math.max(0, Math.min(180, angle))
}

// ロボットにコマンドを送信 (ブロードキャストでID指定)
function sendCommandToRobot(deviceId, angle) {
  const command = {
    module_type: 'actuator', // プロトコルに準拠
    module_id: deviceId,     // device_id ではなく module_id
    action: 'set_servo',
    params: {
      angle: parseInt(angle, 10) // 確実に整数として送信
    }
  }

  const message = JSON.stringify(command)
  const buffer = Buffer.from(message)

  // ブロードキャスト送信
  controlSocket.send(buffer, 0, buffer.length, CONTROL_PORT, '255.255.255.255', (err) => {
    if (err) {
      console.error(`Error broadcasting to ${deviceId}:`, err)
    } else {
      // console.log(`🤖 Broadcast to ${deviceId}: angle=${angle}`)
    }
  })

  return true
}

// すべての検出されたデバイスにコマンドを送信
function sendCommandToAllDevices(angle) {
  if (discoveredDevices.size === 0) {
    console.warn('No devices discovered yet')
    return
  }

  for (const [deviceId] of discoveredDevices) {
    sendCommandToRobot(deviceId, angle)
  }
}

// HTTPサーバーの起動
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`📡 Listening for QubiLink devices on port ${DISCOVERY_UDP_PORT}`)
})

// WebSocketサーバーの作成
const wss = new WebSocketServer({ server })

function broadcastExperienceState() {
  const message = JSON.stringify({
    type: 'experience_state',
    state: experienceState
  })

  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(message)
    }
  }
}

function applyExperiencePatch(patch) {
  if (!patch) return

  if (patch.reset) {
    resetExperienceState()
  }

  if (patch.step) {
    experienceState.step = patch.step
    if (patch.step !== 'robot') {
      experienceState.robotEnabled = false
    }
  }

  if (typeof patch.robotEnabled === 'boolean') {
    experienceState.robotEnabled = patch.robotEnabled
  }

  if (patch.captureTarget) {
    experienceState.captureTarget = patch.captureTarget
    experienceState.captureRequestId = patch.captureRequestId || Date.now()
  }

  if (patch.resetCaptures) {
    experienceState.captures = { min: false, max: false }
  }
}

// フレームレート制限用
let lastPoseSendTime = 0
const POSE_SEND_INTERVAL = 50 // 50ms = 20fps

wss.on('connection', (ws) => {
  console.log('🔌 New WebSocket client connected')

  // 接続時に検出されたデバイス情報を送信
  ws.send(JSON.stringify({
    type: 'devices',
    devices: Array.from(discoveredDevices.values())
  }))
  ws.send(JSON.stringify({
    type: 'experience_state',
    state: experienceState
  }))

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message)

      if (data.type === 'experience_update') {
        applyExperiencePatch(data.patch)
        broadcastExperienceState()
        return
      }

      if (data.type === 'experience_capture') {
        const target = data.target === 'max' ? 'max' : 'min'
        experienceState.captures[target] = Boolean(data.success)
        broadcastExperienceState()
        return
      }

      if (!experienceState.robotEnabled) {
        return
      }

      if (data.type === 'pose' || data.type === 'actuator') {
        const now = Date.now()
        if (now - lastPoseSendTime < POSE_SEND_INTERVAL) {
          return
        }
        lastPoseSendTime = now
      }

      if (data.type === 'pose') {
        const angle = calculateServoAngle(data.landmarks)
        sendCommandToAllDevices(angle)
      }

      if (data.type === 'actuator') {
        // 個別のアクチュエータにコマンドを送信
        if (typeof data.actuator_01 === 'number') {
          // actuator_01 へ送信 (デバイスIDを指定してブロードキャスト)
          // 角度に変換 (0.0-1.0 -> 0-180)
          const angle = Math.round(Math.max(0, Math.min(1, data.actuator_01)) * 180)
          sendCommandToRobot('actuator_01', angle)
        }

        if (typeof data.actuator_02 === 'number') {
          // actuator_02 へ送信 (逆回転)
          const angle = Math.round(Math.max(0, Math.min(1, 1 - data.actuator_02)) * 180)
          sendCommandToRobot('actuator_02', angle)
        }
      }
    } catch (error) {
      console.error('Error processing message:', error)
    }
  })

  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected')
  })

  ws.on('error', (error) => {
    console.error('WebSocket error:', error)
  })
})

// 定期的に古いデバイスを削除（30秒以上応答がない場合）
setInterval(() => {
  const now = Date.now()
  for (const [deviceId, device] of discoveredDevices) {
    if (now - device.lastSeen > 30000) {
      console.log(`❌ Device timeout: ${deviceId}`)
      discoveredDevices.delete(deviceId)
    }
  }
}, 10000)

// REST APIエンドポイント

// デバイスリストを取得
app.get('/api/devices', (req, res) => {
  res.json({
    devices: Array.from(discoveredDevices.values())
  })
})

// 手動でディスカバリーを実行
app.post('/api/discover', (req, res) => {
  sendDiscoveryRequest()
  res.json({ success: true })
})

// 特定のデバイスにコマンドを送信
app.post('/api/command/:deviceId', (req, res) => {
  try {
    const { deviceId } = req.params
    const { angle } = req.body

    if (typeof angle !== 'number' || angle < 0 || angle > 180) {
      return res.status(400).json({
        success: false,
        error: 'Invalid angle (must be 0-180)'
      })
    }

    const success = sendCommandToRobot(deviceId, angle)
    res.json({ success })
  } catch (error) {
    console.error('Error in /api/command:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const LOG_FILE = path.join(__dirname, 'feedback_log.json')

// ... (existing code)

// フィードバック送信
app.post('/api/feedback', (req, res) => {
  try {
    const { feedback, duration, age, gender } = req.body
    console.log('📝 Received feedback:', feedback, 'Duration:', duration, 'Age:', age, 'Gender:', gender)

    const logEntry = {
      timestamp: new Date().toISOString(),
      feedback: feedback,
      duration_seconds: duration,
      age: age || null,
      gender: gender || null
    }

    // 既存のログを読み込む（なければ空配列）
    let logs = []
    if (fs.existsSync(LOG_FILE)) {
      try {
        const fileContent = fs.readFileSync(LOG_FILE, 'utf-8')
        logs = JSON.parse(fileContent)
      } catch (e) {
        console.error('Error reading log file, starting new:', e)
      }
    }

    logs.push(logEntry)

    // 保存
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2))

    res.json({ success: true })
  } catch (error) {
    console.error('Error in /api/feedback:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    devices: discoveredDevices.size
  })
})

// エラーハンドリング
controlSocket.on('error', (err) => {
  console.error('Control socket error:', err)
})

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down server...')
  discoverySocket.close()
  controlSocket.close()
  server.close()
  process.exit(0)
})

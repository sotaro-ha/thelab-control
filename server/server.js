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

// デバイスごとのマッピング設定
// { hand: 'right'|'left'|'both', angleMin: 0, angleMax: 180, invert: false }
// 空の場合は全デバイスに従来動作（平均値）で送信
const deviceMappings = new Map()

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
        const deviceId = String(data.device_id)
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

// ディスカバリーは手動（POST /api/discover）でのみ実行

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

// ロボットにコマンドを送信
function sendCommandToRobot(deviceId, angle) {
  const device = discoveredDevices.get(deviceId)

  if (!device) {
    console.warn(`Device ${deviceId} not found`)
    return false
  }

  const command = {
    action: 'set_servo',
    params: {
      angle: angle
    }
  }

  const message = JSON.stringify(command)
  const buffer = Buffer.from(message)

  controlSocket.send(buffer, 0, buffer.length, device.controlPort, device.ip, (err) => {
    if (err) {
      console.error(`Error sending to ${deviceId}:`, err)
    } else {
      console.log(`🤖 Sent to ${deviceId}: angle=${angle}`)
    }
  })

  return true
}

// actuatorデータをマッピングに基づいて各デバイスに送信
function sendActuatorToDevices(actuator01, actuator02) {
  if (discoveredDevices.size === 0) {
    console.warn('No devices discovered yet')
    return
  }

  // マッピングが設定されている場合、マッピングされたデバイスのみに送信
  if (deviceMappings.size > 0) {
    for (const [deviceId, config] of deviceMappings) {
      if (!discoveredDevices.has(deviceId)) continue
      const value = pickActuatorValue(config.hand, actuator01, actuator02)
      if (value === null) continue
      const clamped = Math.max(0, Math.min(1, value))
      const t = config.invert ? 1 - clamped : clamped
      const angle = Math.round(config.angleMin + t * (config.angleMax - config.angleMin))
      sendCommandToRobot(deviceId, angle)
    }
  } else {
    // マッピング未設定: 従来動作（平均値を全デバイスに送信）
    const values = []
    if (actuator01 !== null) values.push(actuator01)
    if (actuator02 !== null) values.push(actuator02)
    if (values.length === 0) return
    const average = values.reduce((s, v) => s + v, 0) / values.length
    const angle = Math.round(Math.max(0, Math.min(1, average)) * 180)
    for (const deviceId of discoveredDevices.keys()) {
      sendCommandToRobot(deviceId, angle)
    }
  }
}

// マッピングに応じた actuator 値を選択
function pickActuatorValue(mapping, actuator01, actuator02) {
  if (mapping === 'right') return actuator01
  if (mapping === 'left') return actuator02
  // 'both': 平均
  const values = []
  if (actuator01 !== null) values.push(actuator01)
  if (actuator02 !== null) values.push(actuator02)
  if (values.length === 0) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

// poseデータ（キャリブレーション前）を全デバイスに送信
function sendCommandToAllDevices(angle) {
  if (discoveredDevices.size === 0) {
    console.warn('No devices discovered yet')
    return
  }

  const targetIds = deviceMappings.size > 0
    ? [...deviceMappings.keys()].filter(id => discoveredDevices.has(id))
    : [...discoveredDevices.keys()]

  for (const deviceId of targetIds) {
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
        const a01 = typeof data.actuator_01 === 'number' ? data.actuator_01 : null
        const a02 = typeof data.actuator_02 === 'number' ? data.actuator_02 : null
        if (a01 === null && a02 === null) return
        sendActuatorToDevices(a01, a02)
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

// 定期的に古いデバイスを削除（5分以上応答がない場合）
setInterval(() => {
  const now = Date.now()
  for (const [deviceId, device] of discoveredDevices) {
    if (now - device.lastSeen > 5 * 60 * 1000) {
      console.log(`❌ Device timeout: ${deviceId}`)
      discoveredDevices.delete(deviceId)
      deviceMappings.delete(deviceId)
    }
  }
}, 60000)

// REST APIエンドポイント

// デバイスリストを取得
app.get('/api/devices', (req, res) => {
  const devices = Array.from(discoveredDevices.values()).map(device => ({
    ...device,
    mapping: deviceMappings.get(device.id) || null
  }))
  res.json({ devices })
})

// デバイスのマッピング設定を更新
app.post('/api/devices/:deviceId/mapping', (req, res) => {
  const { deviceId } = req.params
  const { mapping } = req.body

  // mapping が null / 'none' → クリア
  if (mapping === null || mapping === 'none') {
    deviceMappings.delete(deviceId)
    console.log(`⬜ Device mapping cleared: ${deviceId}`)
    return res.json({ success: true })
  }

  // mapping がオブジェクトの場合 { hand, angleMin, angleMax, invert }
  if (typeof mapping === 'object') {
    if (!['right', 'left', 'both'].includes(mapping.hand)) {
      return res.status(400).json({ success: false, error: 'Invalid hand (right|left|both)' })
    }
    const config = {
      hand: mapping.hand,
      angleMin: typeof mapping.angleMin === 'number' ? Math.max(0, Math.min(180, mapping.angleMin)) : 0,
      angleMax: typeof mapping.angleMax === 'number' ? Math.max(0, Math.min(180, mapping.angleMax)) : 180,
      invert: Boolean(mapping.invert),
    }
    deviceMappings.set(deviceId, config)
    console.log(`🖐 Device mapping set: ${deviceId} ->`, config)
    return res.json({ success: true })
  }

  // mapping が文字列の場合（後方互換）
  if (['right', 'left', 'both'].includes(mapping)) {
    deviceMappings.set(deviceId, { hand: mapping, angleMin: 0, angleMax: 180, invert: false })
    console.log(`🖐 Device mapping set: ${deviceId} -> ${mapping}`)
    return res.json({ success: true })
  }

  res.status(400).json({ success: false, error: 'Invalid mapping' })
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

// フィードバック送信
app.post('/api/feedback', (req, res) => {
  try {
    const { feedback } = req.body
    console.log('📝 Received feedback:', feedback)
    // TODO: データベースに保存
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

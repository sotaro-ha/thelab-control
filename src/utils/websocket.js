import { getWebSocketUrl } from './wsUrl'

// MediaPipe Pose landmarks indices
const LANDMARK = {
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
}

class RobotWebSocket {
  constructor(url) {
    this.url = url || getWebSocketUrl()
    this.ws = null
    this.reconnectInterval = 3000
    this.reconnectTimer = null

    // キャリブレーションデータ
    this.calibration = this.loadCalibration()
  }

  // キャリブレーションデータをlocalStorageから読み込み
  loadCalibration() {
    try {
      const saved = localStorage.getItem('robotCalibration')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('Failed to load calibration:', e)
    }
    return {
      min: null, // 縮めた時の座標
      max: null, // 広げた時の座標
    }
  }

  // キャリブレーションデータをlocalStorageに保存
  saveCalibration() {
    try {
      localStorage.setItem('robotCalibration', JSON.stringify(this.calibration))
    } catch (e) {
      console.error('Failed to save calibration:', e)
    }
  }

  // 体の中心点を計算（両肩の中間点）
  getBodyCenter(landmarks) {
    const leftShoulder = landmarks[LANDMARK.LEFT_SHOULDER]
    const rightShoulder = landmarks[LANDMARK.RIGHT_SHOULDER]
    return {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
    }
  }

  // 手から体の中心までの距離を計算
  getHandDistance(landmarks, isRightHand) {
    const center = this.getBodyCenter(landmarks)
    const wrist = isRightHand
      ? landmarks[LANDMARK.RIGHT_WRIST]
      : landmarks[LANDMARK.LEFT_WRIST]

    // 体の中心からの距離（正規化された座標での距離）
    const dx = wrist.x - center.x
    const dy = wrist.y - center.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  // 「縮める」ポーズをキャリブレーション
  calibrateMin(landmarks) {
    if (!landmarks || landmarks.length === 0) return false

    this.calibration.min = {
      rightDistance: this.getHandDistance(landmarks, true),
      leftDistance: this.getHandDistance(landmarks, false),
    }
    this.saveCalibration()
    console.log('Calibrated MIN:', this.calibration.min)
    return true
  }

  // 「広げる」ポーズをキャリブレーション
  calibrateMax(landmarks) {
    if (!landmarks || landmarks.length === 0) return false

    this.calibration.max = {
      rightDistance: this.getHandDistance(landmarks, true),
      leftDistance: this.getHandDistance(landmarks, false),
    }
    this.saveCalibration()
    console.log('Calibrated MAX:', this.calibration.max)
    return true
  }

  // キャリブレーションをリセット
  resetCalibration() {
    this.calibration = { min: null, max: null }
    localStorage.removeItem('robotCalibration')
  }

  // キャリブレーションが完了しているか
  isCalibrated() {
    return this.calibration.min !== null && this.calibration.max !== null
  }

  // 値を0-1の範囲に正規化
  normalize(value, min, max) {
    if (max === min) return 0.5
    const normalized = (value - min) / (max - min)
    // 0-1の範囲にクランプ
    return Math.max(0, Math.min(1, normalized))
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log('WebSocket connected')
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
          }
          resolve()
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          reject(error)
        }

        this.ws.onclose = () => {
          console.log('WebSocket disconnected')
          this.attemptReconnect()
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  attemptReconnect() {
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        console.log('Attempting to reconnect...')
        this.connect().catch(() => {
          // 再接続失敗時は何もしない（自動的に再試行される）
        })
      }, this.reconnectInterval)
    }
  }

  sendPoseData(landmarks) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      let data

      if (this.isCalibrated()) {
        // キャリブレーション済みの場合、正規化した値を送信
        const rightDistance = this.getHandDistance(landmarks, true)
        const leftDistance = this.getHandDistance(landmarks, false)

        const actuator_01 = this.normalize(
          rightDistance,
          this.calibration.min.rightDistance,
          this.calibration.max.rightDistance
        )

        const actuator_02 = this.normalize(
          leftDistance,
          this.calibration.min.leftDistance,
          this.calibration.max.leftDistance
        )

        data = {
          type: 'actuator',
          timestamp: Date.now(),
          actuator_01: actuator_01,
          actuator_02: actuator_02,
        }
      } else {
        // キャリブレーション前は生のランドマークデータを送信
        data = {
          type: 'pose',
          timestamp: Date.now(),
          landmarks: landmarks.map(landmark => ({
            x: landmark.x,
            y: landmark.y,
            z: landmark.z,
            visibility: landmark.visibility
          }))
        }
      }

      this.ws.send(JSON.stringify(data))
      return data
    } else {
      console.warn('WebSocket is not connected')
      return null
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

export default RobotWebSocket

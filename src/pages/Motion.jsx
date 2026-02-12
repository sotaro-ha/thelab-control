import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pose } from '@mediapipe/pose'
import { Camera } from '@mediapipe/camera_utils'
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils'
import { POSE_CONNECTIONS } from '@mediapipe/pose'
import RobotWebSocket from '../utils/websocket'
import { getWebSocketUrl } from '../utils/wsUrl'
import Ruby from '../components/Ruby'
import './Motion.css'

function Motion() {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const cameraRef = useRef(null)
  const poseRef = useRef(null)
  const wsRef = useRef(null)
  const experienceWsRef = useRef(null)
  const countdownTimerRef = useRef(null)
  const lastCaptureRequestRef = useRef(null)
  const robotEnabledRef = useRef(true)
  const previousStepRef = useRef(null)
  const currentLandmarksRef = useRef(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [experienceState, setExperienceState] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [countdownLabel, setCountdownLabel] = useState('')
  const [calibrationState, setCalibrationState] = useState({
    minSet: false,
    maxSet: false,
  })
  const [actuatorValues, setActuatorValues] = useState({ actuator_01: 0, actuator_02: 0 })
  const [showCalibration, setShowCalibration] = useState(false)

  // キャリブレーション状態を更新
  const updateCalibrationState = useCallback(() => {
    if (wsRef.current) {
      setCalibrationState({
        minSet: wsRef.current.calibration.min !== null,
        maxSet: wsRef.current.calibration.max !== null,
      })
    }
  }, [])

  const sendCaptureStatus = useCallback((target, success) => {
    if (experienceWsRef.current && experienceWsRef.current.readyState === WebSocket.OPEN) {
      experienceWsRef.current.send(JSON.stringify({
        type: 'experience_capture',
        target,
        success
      }))
    }
  }, [])

  const startCountdown = useCallback((target) => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
    }

    const label = target === 'max' ? 'ひろげる' : 'ちぢめる'
    setCountdownLabel(label)
    setCountdown(3)
    let remaining = 3

    countdownTimerRef.current = setInterval(() => {
      remaining -= 1
      if (remaining > 0) {
        setCountdown(remaining)
        return
      }

      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
      setCountdown(null)
      setCountdownLabel('')

      if (!wsRef.current) {
        console.warn('Cannot calibrate: RobotWebSocket is not connected')
        sendCaptureStatus(target, false)
        return
      }

      const success = target === 'max'
        ? wsRef.current.calibrateMax(currentLandmarksRef.current)
        : wsRef.current.calibrateMin(currentLandmarksRef.current)

      if (success) {
        updateCalibrationState()
      }

      sendCaptureStatus(target, success)
    }, 1000)
  }, [sendCaptureStatus, updateCalibrationState])

  useEffect(() => {
    robotEnabledRef.current = experienceState ? experienceState.robotEnabled : true
  }, [experienceState])

  useEffect(() => {
    const ws = new WebSocket(getWebSocketUrl())
    experienceWsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'experience_state' && data.state) {
          setExperienceState(data.state)
        }
      } catch (error) {
        console.error('Failed to parse experience message:', error)
      }
    }

    return () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    if (!experienceState) return

    const { captureRequestId, captureTarget } = experienceState
    console.log('UseEffect [experienceState]:', { captureRequestId, captureTarget, lastReq: lastCaptureRequestRef.current })

    if (!captureRequestId || captureRequestId === lastCaptureRequestRef.current) {
      return
    }

    lastCaptureRequestRef.current = captureRequestId

    if (captureTarget === 'min' || captureTarget === 'max') {
      console.log('Starting countdown for:', captureTarget)
      startCountdown(captureTarget)
    }
  }, [experienceState, startCountdown])

  useEffect(() => {
    if (!experienceState || !wsConnected) return

    if (experienceState.step === 'explain' && previousStepRef.current !== 'explain') {
      if (wsRef.current) {
        wsRef.current.resetCalibration()
        updateCalibrationState()
        setActuatorValues({ actuator_01: 0, actuator_02: 0 })
      }
    }
    previousStepRef.current = experienceState.step
  }, [experienceState, updateCalibrationState, wsConnected])

  useEffect(() => {
    // WebSocket接続の初期化
    const initWebSocket = async () => {
      wsRef.current = new RobotWebSocket()
      updateCalibrationState()
      try {
        await wsRef.current.connect()
        setWsConnected(true)
      } catch (err) {
        console.error('WebSocket connection failed:', err)
      }
    }

    initWebSocket()

    const setupPose = async () => {
      try {
        const pose = new Pose({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
          }
        })

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        })

        pose.onResults((results) => {
          const canvasElement = canvasRef.current
          const canvasCtx = canvasElement.getContext('2d')

          canvasCtx.save()
          canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height)

          canvasCtx.drawImage(
            results.image,
            0,
            0,
            canvasElement.width,
            canvasElement.height
          )

          if (results.poseLandmarks) {
            drawConnectors(
              canvasCtx,
              results.poseLandmarks,
              POSE_CONNECTIONS,
              { color: '#00FF00', lineWidth: 4 }
            )
            drawLandmarks(
              canvasCtx,
              results.poseLandmarks,
              { color: '#FF0000', lineWidth: 2, radius: 6 }
            )

            // 現在のランドマークを保存（キャリブレーション用）
            currentLandmarksRef.current = results.poseLandmarks

            // ロボットにポーズデータを送信
            if (wsRef.current && robotEnabledRef.current) {
              const sentData = wsRef.current.sendPoseData(results.poseLandmarks)
              if (sentData && sentData.type === 'actuator') {
                setActuatorValues({
                  actuator_01: sentData.actuator_01,
                  actuator_02: sentData.actuator_02,
                })
              }
            }
          }

          canvasCtx.restore()
        })

        poseRef.current = pose

        if (videoRef.current) {
          const camera = new Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && poseRef.current) {
                await poseRef.current.send({ image: videoRef.current })
              }
            },
            width: 720,
            height: 1280
          })

          await camera.start()
          cameraRef.current = camera
          setIsLoading(false)
        }
      } catch (err) {
        console.error('Error setting up pose detection:', err)
        setError('カメラをつかえませんでした')
        setIsLoading(false)
      }
    }

    setupPose()

    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop()
      }
      if (poseRef.current) {
        poseRef.current.close()
      }
      if (wsRef.current) {
        wsRef.current.disconnect()
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
    }
  }, [updateCalibrationState])

  const handleBack = () => {
    navigate('/')
  }

  const handleCalibrateMin = () => {
    if (wsRef.current && currentLandmarksRef.current) {
      const success = wsRef.current.calibrateMin(currentLandmarksRef.current)
      if (success) {
        updateCalibrationState()
      }
    }
  }

  const handleCalibrateMax = () => {
    if (wsRef.current && currentLandmarksRef.current) {
      const success = wsRef.current.calibrateMax(currentLandmarksRef.current)
      if (success) {
        updateCalibrationState()
      }
    }
  }

  const handleResetCalibration = () => {
    if (wsRef.current) {
      wsRef.current.resetCalibration()
      updateCalibrationState()
      setActuatorValues({ actuator_01: 0, actuator_02: 0 })
    }
  }

  const isCalibrated = calibrationState.minSet && calibrationState.maxSet

  const isExperienceMode = Boolean(experienceState)

  return (
    <div className={`motion-container ${isExperienceMode ? 'experience-mode' : ''}`}>
      <video
        ref={videoRef}
        className="input-video"
        style={{ display: 'none' }}
      />

      <canvas
        ref={canvasRef}
        className="output-canvas"
        width={720}
        height={1280}
      />

      {countdown !== null && (
        <div className="countdown-overlay">
          <div className="recording-status">
            <span className="rec-icon">●</span> <Ruby rt="ろくがちゅう">録画中</Ruby>
          </div>
          <div className="countdown-label">{countdownLabel}</div>
          <div className="countdown-number">{countdown}</div>
        </div>
      )}

      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>カメラを<Ruby rt="じゅんび">準備</Ruby>しているよ...</p>
        </div>
      )}

      {error && (
        <div className="error-overlay">
          <p>{error}</p>
          <button onClick={handleBack}>もどる</button>
        </div>
      )}

      <button className="back-button" onClick={handleBack}>
        ← もどる
      </button>

      {/* キャリブレーション切り替えボタン */}
      <button
        className="calibration-toggle"
        onClick={() => setShowCalibration(!showCalibration)}
      >
        ⚙
      </button>

      {/* キャリブレーションパネル */}
      {showCalibration && (
        <div className="calibration-panel">
          <h3>キャリブレーション</h3>
          <p className="calibration-instruction">
            <Ruby rt="からだ">体</Ruby>を<Ruby rt="ちい">小</Ruby>さく
            <Ruby rt="ちぢ">縮</Ruby>めてから「<Ruby rt="ちぢ">縮</Ruby>める」ボタン、
            <br />
            <Ruby rt="おお">大</Ruby>きく<Ruby rt="ひろ">広</Ruby>げてから「
            <Ruby rt="ひろ">広</Ruby>げる」ボタンを<Ruby rt="お">押</Ruby>してね
          </p>

          <div className="calibration-buttons">
            <button
              className={`calibration-button ${calibrationState.minSet ? 'set' : ''}`}
              onClick={handleCalibrateMin}
            >
              <Ruby rt="ちぢ">縮</Ruby>める
              {calibrationState.minSet && ' ✓'}
            </button>
            <button
              className={`calibration-button ${calibrationState.maxSet ? 'set' : ''}`}
              onClick={handleCalibrateMax}
            >
              <Ruby rt="ひろ">広</Ruby>げる
              {calibrationState.maxSet && ' ✓'}
            </button>
          </div>

          <button
            className="reset-button"
            onClick={handleResetCalibration}
          >
            リセット
          </button>

          {isCalibrated && (
            <div className="actuator-display">
              <div className="actuator-bar">
                <span className="actuator-label">
                  <Ruby rt="みぎて">右手</Ruby>
                </span>
                <div className="bar-container">
                  <div
                    className="bar-fill"
                    style={{ width: `${actuatorValues.actuator_01 * 100}%` }}
                  />
                </div>
                <span className="actuator-value">
                  {(actuatorValues.actuator_01 * 100).toFixed(0)}%
                </span>
              </div>
              <div className="actuator-bar">
                <span className="actuator-label">
                  <Ruby rt="ひだりて">左手</Ruby>
                </span>
                <div className="bar-container">
                  <div
                    className="bar-fill"
                    style={{ width: `${actuatorValues.actuator_02 * 100}%` }}
                  />
                </div>
                <span className="actuator-value">
                  {(actuatorValues.actuator_02 * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="instruction-overlay">
        <p>
          <Ruby rt="がめん">画面</Ruby>に<Ruby rt="ぜんしん">全身</Ruby>が
          <Ruby rt="うつ">映</Ruby>るように<Ruby rt="た">立</Ruby>ってね
        </p>
        <p>
          <Ruby rt="からだ">体</Ruby>を<Ruby rt="うご">動</Ruby>かすと
          ロボットが<Ruby rt="うご">動</Ruby>くよ！
        </p>
        {wsConnected && (
          <p className="connection-status">
            ロボットにつながっているよ
            {isCalibrated && (
              <>
                {' ('}
                キャリブレーション<Ruby rt="ず">済</Ruby>み
                {')'}
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

export default Motion

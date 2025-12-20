import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import SlideShow from '../components/SlideShow'
import { getWebSocketUrl } from '../utils/wsUrl'
import './Control.css'

const steps = [
  {
    id: 'explain',
    title: '説明を見る',
    description: '体験の流れと動き方を確認します。'
  },
  {
    id: 'capture_min',
    title: '体を縮める撮影',
    description: 'カメラの前で体を小さくして、3・2・1のあとに撮影します。'
  },
  {
    id: 'capture_max',
    title: '体を大きくする撮影',
    description: '体を大きく広げて、3・2・1のあとに撮影します。'
  },
  {
    id: 'robot',
    title: 'ロボットへ信号送信',
    description: '体の動きがロボットに送られる状態に切り替えます。'
  },
  {
    id: 'feedback',
    title: '感想を送信',
    description: '体験の感想を送信して完了です。'
  }
]

const defaultState = {
  step: 'explain',
  captures: {
    min: false,
    max: false
  },
  robotEnabled: false,
  captureRequestId: null,
  captureTarget: null
}

function Control() {
  const location = useLocation()
  const [experienceState, setExperienceState] = useState(defaultState)
  const [wsConnected, setWsConnected] = useState(false)
  const [showSlideShow, setShowSlideShow] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState('idle')
  const wsRef = useRef(null)
  const resetRequestedRef = useRef(false)

  const sendMessage = useCallback((payload) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return
    }
    wsRef.current.send(JSON.stringify(payload))
  }, [])

  const apiBaseUrl = `${window.location.protocol}//${window.location.hostname}:3001`

  const currentStepIndex = useMemo(() => {
    const index = steps.findIndex((step) => step.id === experienceState.step)
    return index === -1 ? 0 : index
  }, [experienceState.step])

  const currentStep = steps[currentStepIndex]
  const prevStep = steps[currentStepIndex - 1]
  const nextStep = steps[currentStepIndex + 1]

  const goToStep = useCallback((stepId) => {
    sendMessage({
      type: 'experience_update',
      patch: {
        step: stepId
      }
    })
  }, [sendMessage])

  const requestCapture = useCallback((target) => {
    sendMessage({
      type: 'experience_update',
      patch: {
        step: target === 'max' ? 'capture_max' : 'capture_min',
        captureTarget: target,
        captureRequestId: Date.now()
      }
    })
  }, [sendMessage])

  const toggleRobot = useCallback(() => {
    sendMessage({
      type: 'experience_update',
      patch: {
        step: 'robot',
        robotEnabled: !experienceState.robotEnabled
      }
    })
  }, [sendMessage, experienceState.robotEnabled])

  const resetExperience = useCallback(() => {
    sendMessage({
      type: 'experience_update',
      patch: {
        reset: true
      }
    })
    setFeedback('')
    setFeedbackStatus('idle')
  }, [sendMessage])

  useEffect(() => {
    resetRequestedRef.current = Boolean(location.state?.resetExperience)
  }, [location.state])

  useEffect(() => {
    if (wsConnected && resetRequestedRef.current) {
      resetExperience()
      resetRequestedRef.current = false
    }
  }, [wsConnected, resetExperience])

  useEffect(() => {
    const ws = new WebSocket(getWebSocketUrl())
    wsRef.current = ws

    ws.onopen = () => {
      setWsConnected(true)
    }

    ws.onclose = () => {
      setWsConnected(false)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'experience_state' && data.state) {
          setExperienceState(data.state)
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    return () => {
      ws.close()
    }
  }, [])

  const canGoNext = () => {
    if (!nextStep) return false
    if (experienceState.step === 'capture_min') {
      return experienceState.captures.min
    }
    if (experienceState.step === 'capture_max') {
      return experienceState.captures.max
    }
    if (experienceState.step === 'robot') {
      return experienceState.robotEnabled
    }
    return true
  }

  const canGoPrev = Boolean(prevStep)

  const stepStatus = (stepId) => {
    if (stepId === experienceState.step) {
      return '進行中'
    }
    if (stepId === 'capture_min') {
      return experienceState.captures.min ? '撮影済み' : '未撮影'
    }
    if (stepId === 'capture_max') {
      return experienceState.captures.max ? '撮影済み' : '未撮影'
    }
    if (stepId === 'robot') {
      return experienceState.robotEnabled ? '送信中' : '停止中'
    }
    if (stepId === 'feedback') {
      return feedbackStatus === 'sent' ? '送信済み' : '未送信'
    }
    return currentStepIndex > steps.findIndex((step) => step.id === stepId)
      ? '完了'
      : '準備中'
  }

  const sendFeedback = async () => {
    if (!feedback.trim() || feedbackStatus === 'sending') {
      return
    }
    setFeedbackStatus('sending')
    try {
      const response = await fetch(`${apiBaseUrl}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ feedback: feedback.trim() })
      })

      if (!response.ok) {
        throw new Error('Feedback request failed')
      }

      setFeedback('')
      setFeedbackStatus('sent')
    } catch (error) {
      console.error('Failed to send feedback:', error)
      setFeedbackStatus('error')
    }
  }

  return (
    <div className="control-container">
      {showSlideShow && (
        <SlideShow onClose={() => setShowSlideShow(false)} />
      )}

      <header className="control-header">
        <div>
          <p className="control-overline">EXHIBITION FLOW</p>
          <h1 className="control-title">展示操作パネル</h1>
        </div>
        <div className={`control-status ${wsConnected ? 'ok' : 'ng'}`}>
          <span className="status-dot" />
          {wsConnected ? 'WebSocket 接続中' : 'WebSocket 未接続'}
        </div>
      </header>

      <div className="control-grid">
        <aside className="control-steps">
          {steps.map((step, index) => {
            const isActive = step.id === experienceState.step
            const status = stepStatus(step.id)
            const isDone = ['完了', '撮影済み', '送信中', '送信済み'].includes(status)
            return (
              <button
                key={step.id}
                className={`step-item ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
                onClick={() => goToStep(step.id)}
                disabled={!wsConnected}
              >
                <div className="step-index">{index + 1}</div>
                <div>
                  <div className="step-title">{step.title}</div>
                  <div className="step-status">{status}</div>
                </div>
              </button>
            )
          })}
        </aside>

        <main className="control-main">
          <div className="step-card">
            <div className="step-tag">STEP {currentStepIndex + 1}</div>
            <h2>{currentStep.title}</h2>
            <p>{currentStep.description}</p>

            {currentStep.id === 'explain' && (
              <div className="step-actions">
                <button
                  className="primary-button"
                  onClick={() => setShowSlideShow(true)}
                >
                  説明スライドをひらく
                </button>
              </div>
            )}

            {currentStep.id === 'capture_min' && (
              <div className="step-actions">
                <button
                  className="primary-button"
                  onClick={() => requestCapture('min')}
                >
                  撮影スタート
                </button>
                <div className="step-hint">
                  状態: {experienceState.captures.min ? '撮影済み' : '未撮影'}
                </div>
              </div>
            )}

            {currentStep.id === 'capture_max' && (
              <div className="step-actions">
                <button
                  className="primary-button"
                  onClick={() => requestCapture('max')}
                >
                  撮影スタート
                </button>
                <div className="step-hint">
                  状態: {experienceState.captures.max ? '撮影済み' : '未撮影'}
                </div>
              </div>
            )}

            {currentStep.id === 'robot' && (
              <div className="step-actions">
                <button
                  className={`primary-button ${experienceState.robotEnabled ? 'is-active' : ''}`}
                  onClick={toggleRobot}
                >
                  {experienceState.robotEnabled ? '送信中（停止する）' : '送信を開始する'}
                </button>
                <div className="step-hint">
                  現在: {experienceState.robotEnabled ? '送信中' : '停止中'}
                </div>
              </div>
            )}

            {currentStep.id === 'feedback' && (
              <div className="step-actions">
                <textarea
                  className="feedback-input"
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="感じたことを自由に書いてください"
                />
                <button
                  className="primary-button"
                  onClick={sendFeedback}
                  disabled={feedbackStatus === 'sending'}
                >
                  {feedbackStatus === 'sending' ? '送信中...' : '感想を送信'}
                </button>
                {feedbackStatus === 'sent' && (
                  <div className="step-hint">送信しました。ありがとうございます！</div>
                )}
                {feedbackStatus === 'error' && (
                  <div className="step-hint error">送信に失敗しました</div>
                )}
              </div>
            )}
          </div>

          <div className="control-actions">
            <button
              className="ghost-button"
              onClick={() => prevStep && goToStep(prevStep.id)}
              disabled={!canGoPrev || !wsConnected}
            >
              戻る
            </button>
            <button
              className="primary-button"
              onClick={() => nextStep && goToStep(nextStep.id)}
              disabled={!canGoNext() || !wsConnected}
            >
              つぎへ
            </button>
          </div>

          <button
            className="reset-control"
            onClick={resetExperience}
            disabled={!wsConnected}
          >
            最初からやり直す
          </button>
        </main>
      </div>
    </div>
  )
}

export default Control

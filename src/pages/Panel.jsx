import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getWebSocketUrl } from '../utils/wsUrl'
import Ruby from '../components/Ruby'
import './Panel.css'

const steps = [
  { id: 'explain' },
  { id: 'capture_min' },
  { id: 'capture_max' },
  { id: 'robot' },
  { id: 'feedback' }
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

function Panel() {
  const location = useLocation()
  const [experienceState, setExperienceState] = useState(defaultState)
  const [wsConnected, setWsConnected] = useState(false)
  const wsRef = useRef(null)
  const resetRequestedRef = useRef(false)

  const sendMessage = useCallback((payload) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return
    }
    wsRef.current.send(JSON.stringify(payload))
  }, [])

  const resetExperience = useCallback(() => {
    sendMessage({
      type: 'experience_update',
      patch: {
        reset: true
      }
    })
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
        console.error('Failed to parse experience message:', error)
      }
    }

    return () => {
      ws.close()
    }
  }, [])

  const currentStepIndex = useMemo(() => {
    const index = steps.findIndex((step) => step.id === experienceState.step)
    return index === -1 ? 0 : index
  }, [experienceState.step])

  const prevStep = steps[currentStepIndex - 1]
  const nextStep = steps[currentStepIndex + 1]

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

  const sendStepUpdate = (stepId) => {
    const patch = { step: stepId }

    if (stepId === 'capture_min' && !experienceState.captures.min) {
      patch.captureTarget = 'min'
      patch.captureRequestId = Date.now()
    }

    if (stepId === 'capture_max' && !experienceState.captures.max) {
      patch.captureTarget = 'max'
      patch.captureRequestId = Date.now()
    }

    if (stepId === 'robot') {
      patch.robotEnabled = true
    }

    sendMessage({
      type: 'experience_update',
      patch
    })
  }

  const triggerCapture = () => {
    if (experienceState.step !== 'capture_min' && experienceState.step !== 'capture_max') {
      return
    }

    const target = experienceState.step === 'capture_max' ? 'max' : 'min'

    sendMessage({
      type: 'experience_update',
      patch: {
        step: experienceState.step,
        captureTarget: target,
        captureRequestId: Date.now()
      }
    })
  }

  const stepCopy = useMemo(() => {
    if (!wsConnected) {
      return {
        now: '準備中です',
        todo: 'そのままお待ちください'
      }
    }

    const copy = {
      explain: {
        now: '説明を表示しています',
        todo: '内容を確認できたら「次へ」を押してください'
      },
      capture_min: {
        now: experienceState.captures.min ? '縮める撮影が完了しました' : '体を縮める動きを撮影中です',
        todo: experienceState.captures.min
          ? '次へで次の撮影に進みます'
          : '体を小さくして、3・2・1の合図まで待ってください'
      },
      capture_max: {
        now: experienceState.captures.max ? '広げる撮影が完了しました' : '体を広げる動きを撮影中です',
        todo: experienceState.captures.max
          ? '次へで信号送信へ進みます'
          : '体を大きく広げて、3・2・1の合図まで待ってください'
      },
      robot: {
        now: experienceState.robotEnabled ? 'ロボットへ信号を送信中です' : '信号送信の準備中です',
        todo: experienceState.robotEnabled
          ? '体を動かしてロボットを操作してください'
          : '次へで信号送信を開始します'
      },
      feedback: {
        now: '感想を受け付けています',
        todo: '音声で感想を伝えてください'
      }
    }

    return copy[experienceState.step] || copy.explain
  }, [experienceState, wsConnected])

  const stepTitle = useMemo(() => {
    const titles = {
      explain: (
        <>
          はじめに<Ruby rt="せつめい">説明</Ruby>を<Ruby rt="み">見</Ruby>よう
        </>
      ),
      capture_min: (
        <>
          <Ruby rt="からだ">体</Ruby>を<Ruby rt="ちぢ">縮</Ruby>める
          <Ruby rt="ようす">様子</Ruby>を<Ruby rt="さつえい">撮影</Ruby>しよう
        </>
      ),
      capture_max: (
        <>
          <Ruby rt="からだ">体</Ruby>を<Ruby rt="おお">大</Ruby>きくする
          <Ruby rt="ようす">様子</Ruby>を<Ruby rt="さつえい">撮影</Ruby>しよう
        </>
      ),
      robot: (
        <>
          ロボットを<Ruby rt="うご">動</Ruby>かしてみよう
        </>
      ),
      feedback: (
        <>
          <Ruby rt="かんそう">感想</Ruby>を<Ruby rt="はな">話</Ruby>そう
        </>
      )
    }

    return titles[experienceState.step] || titles.explain
  }, [experienceState.step])

  return (
    <div className="panel-container">
      <header className="panel-header">
        <h1 className="panel-title">{stepTitle}</h1>
      </header>

      <main className="panel-main">
        <div className="panel-frame">
          <div className="panel-frame-photo" />
        </div>

        <div className="panel-instructions">
          <div className="panel-line">
            <span className="panel-label">いま</span>
            <span className="panel-text">{stepCopy.now}</span>
          </div>
          <div className="panel-line">
            <span className="panel-label">すること</span>
            <span className="panel-text">{stepCopy.todo}</span>
          </div>
          {(experienceState.step === 'capture_min' || experienceState.step === 'capture_max') && (
            <button
              className="panel-record"
              onClick={triggerCapture}
              disabled={!wsConnected}
            >
              {experienceState.step === 'capture_min'
                ? (experienceState.captures.min ? 'もう一度録画する' : '録画開始')
                : (experienceState.captures.max ? 'もう一度録画する' : '録画開始')}
            </button>
          )}
        </div>
      </main>

      <footer className="panel-actions">
        <button
          className="panel-nav"
          onClick={() => prevStep && sendStepUpdate(prevStep.id)}
          disabled={!prevStep || !wsConnected}
        >
          <span className="panel-nav-label">もどる</span>
          <span className="panel-nav-circle">
            <span className="panel-nav-arrow">←</span>
          </span>
        </button>
        <button
          className="panel-nav"
          onClick={() => nextStep && sendStepUpdate(nextStep.id)}
          disabled={!nextStep || !canGoNext() || !wsConnected}
        >
          <span className="panel-nav-label">つぎへ</span>
          <span className="panel-nav-circle">
            <span className="panel-nav-arrow">→</span>
          </span>
        </button>
      </footer>
    </div>
  )
}

export default Panel

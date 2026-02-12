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
  const [speechSupported, setSpeechSupported] = useState(true)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const wsRef = useRef(null)
  const recognitionRef = useRef(null)
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
    setTranscript('')
    setInterimTranscript('')
    setIsRecording(false)
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

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSpeechSupported(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'ja-JP'
    recognition.interimResults = true
    recognition.continuous = true

    recognition.onstart = () => {
      setIsRecording(true)
    }

    recognition.onend = () => {
      setIsRecording(false)
      setInterimTranscript('')
    }

    recognition.onerror = () => {
      setIsRecording(false)
      setInterimTranscript('')
    }

    recognition.onresult = (event) => {
      let interim = ''

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal) {
          setTranscript((prev) => {
            const nextText = result[0].transcript.trim()
            return `${prev}${prev && nextText ? ' ' : ''}${nextText}`
          })
        } else {
          interim += result[0].transcript
        }
      }

      setInterimTranscript(interim.trim())
    }

    recognitionRef.current = recognition

    return () => {
      recognition.stop()
    }
  }, [])

  useEffect(() => {
    if (experienceState.step !== 'feedback' && recognitionRef.current && isRecording) {
      recognitionRef.current.stop()
    }
    if (experienceState.step !== 'feedback') {
      setTranscript('')
      setInterimTranscript('')
    }
  }, [experienceState.step, isRecording])

  const toggleRecording = () => {
    if (!speechSupported || !recognitionRef.current) {
      return
    }

    if (isRecording) {
      recognitionRef.current.stop()
      return
    }

    try {
      recognitionRef.current.start()
    } catch (error) {
      // ignore repeated start errors
    }
  }

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
        now: <><Ruby rt="じゅんび">準備</Ruby><Ruby rt="ちゅう">中</Ruby>です</>,
        todo: <>そのままお<Ruby rt="ま">待</Ruby>ちください</>
      }
    }

    const copy = {
      explain: {
        now: <><Ruby rt="せつめい">説明</Ruby>を<Ruby rt="ひょうじ">表示</Ruby>しています</>,
        todo: <><Ruby rt="ないよう">内容</Ruby>を<Ruby rt="かくにん">確認</Ruby>できたら「つぎへ」を<Ruby rt="お">押</Ruby>してください</>
      },
      capture_min: {
        now: experienceState.captures.min
          ? <>⏹ <Ruby rt="ちぢ">縮</Ruby>める<Ruby rt="さつえい">撮影</Ruby>が<Ruby rt="かんりょう">完了</Ruby>しました</>
          : <>📸 <Ruby rt="からだ">体</Ruby>を<Ruby rt="ちぢ">縮</Ruby>める<Ruby rt="うご">動</Ruby>きを<Ruby rt="さつえい">撮影</Ruby><Ruby rt="ちゅう">中</Ruby>です</>,
        todo: experienceState.captures.min
          ? <>つぎへで<Ruby rt="つぎ">次</Ruby>の<Ruby rt="さつえい">撮影</Ruby>に<Ruby rt="すす">進</Ruby>みます</>
          : <><Ruby rt="からだ">体</Ruby>を<Ruby rt="ちい">小</Ruby>さくして、3・2・1の<Ruby rt="あいず">合図</Ruby>まで<Ruby rt="ま">待</Ruby>ってください</>
      },
      capture_max: {
        now: experienceState.captures.max
          ? <>⏹ <Ruby rt="ひろ">広</Ruby>げる<Ruby rt="さつえい">撮影</Ruby>が<Ruby rt="かんりょう">完了</Ruby>しました</>
          : <>📸 <Ruby rt="からだ">体</Ruby>を<Ruby rt="ひろ">広</Ruby>げる<Ruby rt="うご">動</Ruby>きを<Ruby rt="さつえい">撮影</Ruby><Ruby rt="ちゅう">中</Ruby>です</>,
        todo: experienceState.captures.max
          ? <>つぎへで<Ruby rt="しんごう">信号</Ruby><Ruby rt="そうしん">送信</Ruby>へ<Ruby rt="すす">進</Ruby>みます</>
          : <><Ruby rt="からだ">体</Ruby>を<Ruby rt="おお">大</Ruby>きく<Ruby rt="ひろ">広</Ruby>げて、3・2・1の<Ruby rt="あいず">合図</Ruby>まで<Ruby rt="ま">待</Ruby>ってください</>
      },
      robot: {
        now: experienceState.robotEnabled
          ? <>📡 ロボットへ<Ruby rt="しんごう">信号</Ruby>を<Ruby rt="そうしん">送信</Ruby><Ruby rt="ちゅう">中</Ruby>です</>
          : <>⏳ <Ruby rt="しんごう">信号</Ruby><Ruby rt="そうしん">送信</Ruby>の<Ruby rt="じゅんび">準備</Ruby><Ruby rt="ちゅう">中</Ruby>です</>,
        todo: experienceState.robotEnabled
          ? <><Ruby rt="からだ">体</Ruby>を<Ruby rt="うご">動</Ruby>かしてロボットを<Ruby rt="そうさ">操作</Ruby>してください</>
          : <>つぎへで<Ruby rt="しんごう">信号</Ruby><Ruby rt="そうしん">送信</Ruby>を<Ruby rt="かいし">開始</Ruby>します</>
      },
      feedback: {
        now: <>🎤 <Ruby rt="かんそう">感想</Ruby>を<Ruby rt="う">受</Ruby>け<Ruby rt="つ">付</Ruby>けています</>,
        todo: <><Ruby rt="おんせい">音声</Ruby>で<Ruby rt="かんそう">感想</Ruby>を<Ruby rt="つた">伝</Ruby>えてください</>
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
              {(experienceState.step === 'capture_min' ? experienceState.captures.min : experienceState.captures.max)
                ? <>🔄 もう<Ruby rt="いちど">一度</Ruby><Ruby rt="ろくが">録画</Ruby>する</>
                : <>🔴 <Ruby rt="ろくが">録画</Ruby><Ruby rt="かいし">開始</Ruby></>}
            </button>
          )}
        </div>

        {experienceState.step === 'feedback' && (
          <div className="panel-voice">
            <button
              className={`panel-mic ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
              disabled={!speechSupported || !wsConnected}
            >
              <span className="panel-mic-inner" />
            </button>
            <div className="panel-voice-text">
              <div className="panel-voice-label">
                {speechSupported
                  ? (isRecording
                    ? <>🔴 <Ruby rt="ろくおん">録音</Ruby><Ruby rt="ちゅう">中</Ruby>...</>
                    : <>🎤 マイクを<Ruby rt="お">押</Ruby>して<Ruby rt="はな">話</Ruby>してください</>)
                  : <>このブラウザでは<Ruby rt="おんせい">音声</Ruby><Ruby rt="にゅうりょく">入力</Ruby>が<Ruby rt="つか">使</Ruby>えません</>}
              </div>
              <div className="panel-transcript">
                {transcript || interimTranscript
                  ? `${transcript}${interimTranscript ? ` ${interimTranscript}` : ''}`
                  : '...'}
              </div>
            </div>
          </div>
        )}
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

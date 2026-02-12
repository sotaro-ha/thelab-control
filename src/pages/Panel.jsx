import { ArrowLeft, ArrowRight, Microphone, UserFocus } from '@phosphor-icons/react'
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
  const [showThanks, setShowThanks] = useState(false)
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
    if (experienceState.step === 'feedback') return true
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

  const [feedbackText, setFeedbackText] = useState('')
  const [interimText, setInterimText] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [isListening, setIsListening] = useState(false)
  const startTimeRef = useRef(Date.now())
  const recognitionRef = useRef(null)

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'ja-JP'

      recognition.onresult = (event) => {
        let final = ''
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript
          } else {
            interim += event.results[i][0].transcript
          }
        }

        if (final) {
          setFeedbackText((prev) => prev + final)
        }
        setInterimText(interim)
      }

      recognition.onend = () => {
        setIsListening(false)
        setInterimText('')
      }

      recognitionRef.current = recognition
    }
  }, [])

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return

    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      recognitionRef.current.start()
      setIsListening(true)
    }
  }, [isListening])

  useEffect(() => {
    // Reset start time when going back to explain
    if (experienceState.step === 'explain') {
      startTimeRef.current = Date.now()
      setFeedbackText('')
    }
  }, [experienceState.step])

  const submitFeedback = async () => {
    const duration = Math.round((Date.now() - startTimeRef.current) / 1000)

    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback: feedbackText,
          duration: duration,
          age,
          gender
        })
      })
    } catch (e) {
      console.error('Failed to save feedback', e)
    }

    // Next logic (handled by parent or just moving step)
    // For now just clear and move (assuming nextStep logic handles actual transition)
    // But we are inside Panel, so we should just call the next step action
    if (nextStep) {
      sendStepUpdate(nextStep.id)
    } else {
      setShowThanks(true)
      setTimeout(() => {
        resetExperience()
        setShowThanks(false)
      }, 3000)
    }
  }

  // ... (Keep existing existing logic) ...

  const stepCopy = useMemo(() => {
    if (!wsConnected) {
      return {
        now: '準備中です',
        todo: 'そのままお待ちください'
      }
    }

    const copy = {
      explain: {
        now: (
          <>
            これは<Ruby rt="め">目</Ruby>の<Ruby rt="まえ">前</Ruby>のロボットを<Ruby rt="うご">動</Ruby>かす<Ruby rt="たいけん">体験</Ruby>です
          </>
        ),
        todo: (
          <>
            <Ruby rt="ないよう">内容</Ruby>を<Ruby rt="かくにん">確認</Ruby>できたら「つぎへ」を<Ruby rt="お">押</Ruby>してください
          </>
        )
      },
      capture_min: {
        now: experienceState.captures.min ? (
          <>
            <Ruby rt="ちぢ">縮</Ruby>める<Ruby rt="さつえい">撮影</Ruby>が<Ruby rt="かんりょう">完了</Ruby>しました
          </>
        ) : (
          <>
            <Ruby rt="からだ">体</Ruby>を<Ruby rt="ちぢ">縮</Ruby>める<Ruby rt="うご">動</Ruby>きを<Ruby rt="さつえい">撮影</Ruby><Ruby rt="ちゅう">中</Ruby>です
          </>
        ),
        todo: experienceState.captures.min ? (
          <>
            「つぎへ」で<Ruby rt="つぎ">次</Ruby>の<Ruby rt="さつえい">撮影</Ruby>に<Ruby rt="すす">進</Ruby>みます
          </>
        ) : (
          <>
            <Ruby rt="からだ">体</Ruby>を<Ruby rt="ちい">小</Ruby>さくして、3・2・1の<Ruby rt="あいず">合図</Ruby>まで<Ruby rt="ま">待</Ruby>ってください
          </>
        )
      },
      capture_max: {
        now: experienceState.captures.max ? (
          <>
            <Ruby rt="ひろ">広</Ruby>げる<Ruby rt="さつえい">撮影</Ruby>が<Ruby rt="かんりょう">完了</Ruby>しました
          </>
        ) : (
          <>
            <Ruby rt="からだ">体</Ruby>を<Ruby rt="ひろ">広</Ruby>げる<Ruby rt="うご">動</Ruby>きを<Ruby rt="さつえい">撮影</Ruby><Ruby rt="ちゅう">中</Ruby>です
          </>
        ),
        todo: experienceState.captures.max ? (
          <>
            「つぎへ」で<Ruby rt="しんごう">信号</Ruby><Ruby rt="そうしん">送信</Ruby>へ<Ruby rt="すす">進</Ruby>みます
          </>
        ) : (
          <>
            <Ruby rt="からだ">体</Ruby>を<Ruby rt="おお">大</Ruby>きく<Ruby rt="ひろ">広</Ruby>げて、3・2・1の<Ruby rt="あいず">合図</Ruby>まで<Ruby rt="ま">待</Ruby>ってください
          </>
        )
      },
      robot: {
        now: experienceState.robotEnabled ? (
          <>
            ロボットへ<Ruby rt="しんごう">信号</Ruby>を<Ruby rt="そうしん">送信</Ruby><Ruby rt="ちゅう">中</Ruby>です
          </>
        ) : (
          <>
            <Ruby rt="しんごう">信号</Ruby><Ruby rt="そうしん">送信</Ruby>の<Ruby rt="じゅんび">準備</Ruby><Ruby rt="ちゅう">中</Ruby>です
          </>
        ),
        todo: experienceState.robotEnabled ? (
          <>
            <Ruby rt="からだ">体</Ruby>を<Ruby rt="うご">動</Ruby>かしてロボットを<Ruby rt="そうさ">操作</Ruby>してください
          </>
        ) : (
          <>
            「つぎへ」で<Ruby rt="しんごう">信号</Ruby><Ruby rt="そうしん">送信</Ruby>を<Ruby rt="かいし">開始</Ruby>します
          </>
        )
      },
      feedback: {
        now: (
          <>
            <Ruby rt="かんそう">感想</Ruby>を<Ruby rt="う">受</Ruby>け<Ruby rt="つ">付</Ruby>けています
          </>
        ),
        todo: (
          <>
            <Ruby rt="おんせい">音声</Ruby>で<Ruby rt="かんそう">感想</Ruby>を<Ruby rt="つた">伝</Ruby>えてください
          </>
        )
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

  if (showThanks) {
    return (
      <div className="thanks-screen" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        background: 'var(--panel-bg)',
        zIndex: 100,
        position: 'fixed',
        top: 0,
        left: 0
      }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '2rem' }}>
          ありがとうございました！
        </h1>
        <p style={{ fontSize: '1.5rem' }}>
          また<Ruby rt="あそ">遊</Ruby>びにきてね
        </p>
      </div>
    )
  }

  return (
    <div className="panel-container">
      <header className="panel-header">
        <h1 className="panel-title">{stepTitle}</h1>
      </header>

      <main className="panel-main">
        {experienceState.step === 'feedback' ? (
          <div className="feedback-container">
            <div className="feedback-hints">
              <p className="feedback-hint-title">
                <Ruby rt="たと">例</Ruby>えば...
              </p>
              <ul className="feedback-hint-list">
                <li>「<Ruby rt="いが">意外</Ruby>と<Ruby rt="むずか">難</Ruby>しかった」</li>
                <li>「<Ruby rt="かんたん">簡単</Ruby>だった」</li>
                <li>「こんな<Ruby rt="ふう">風</Ruby>に<Ruby rt="うご">動</Ruby>かしたい」</li>
              </ul>
            </div>
            <div className="feedback-input-wrap">
              <textarea
                className="feedback-textarea"
                placeholder="マイクボタンをおして はなしかけてね"
                value={feedbackText + interimText}
                onChange={(e) => {
                  setFeedbackText(e.target.value)
                  setInterimText('')
                }}
              />
              <button
                className={`mic-button ${isListening ? 'listening' : ''}`}
                onClick={toggleListening}
              >
                <span className="mic-icon">
                  <Microphone size={48} weight="fill" />
                </span>
              </button>
              <div className="mic-label">
                {isListening ? (
                  <>
                    <Ruby rt="き">聞</Ruby>いています...
                  </>
                ) : (
                  <>
                    タップして<Ruby rt="はな">話</Ruby>す
                  </>
                )}
              </div>
            </div>

            <div className="demographics-container">
              <div className="demographic-group">
                <p className="demographic-label"><Ruby rt="ねんだい">年代</Ruby></p>
                <div className="demographic-buttons">
                  {['10代以下', '20代', '30代', '40代', '50代', '60代以上'].map((a) => (
                    <button
                      key={a}
                      className={`demo-button ${age === a ? 'selected' : ''}`}
                      onClick={() => setAge(a)}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div className="demographic-group">
                <p className="demographic-label"><Ruby rt="せいべつ">性別</Ruby></p>
                <div className="demographic-buttons">
                  {['男性', '女性', 'その他'].map((g) => (
                    <button
                      key={g}
                      className={`demo-button ${gender === g ? 'selected' : ''}`}
                      onClick={() => setGender(g)}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="panel-frame">
              <div className="panel-frame-photo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UserFocus size={80} color="var(--panel-accent)" weight="duotone" />
              </div>
            </div>

            <div className="panel-instructions">
              <div className="panel-line">
                <span className="panel-label">いま</span>
                <span className="panel-text">{stepCopy.now}</span>
              </div>
              <div className="panel-line">
                <span className="panel-label">ガイド</span>
                <span className="panel-text">{stepCopy.todo}</span>
              </div>
              {(experienceState.step === 'capture_min' || experienceState.step === 'capture_max') && (
                <div className="panel-record-wrap">
                  <button
                    className="panel-record"
                    onClick={triggerCapture}
                    disabled={!wsConnected}
                    aria-label="録画を開始"
                  />
                  <div className="panel-record-label">
                    <Ruby rt="あか">赤</Ruby>いボタンを<Ruby rt="お">押</Ruby>したら
                    <Ruby rt="ろくが">録画</Ruby><Ruby rt="かいし">開始</Ruby>
                  </div>
                </div>
              )}
            </div>
          </>
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
            <ArrowLeft className="panel-nav-arrow-icon" weight="bold" aria-hidden="true" />
          </span>
        </button>
        <button
          className="panel-nav"
          onClick={() => {
            if (experienceState.step === 'feedback') {
              submitFeedback()
            } else if (nextStep) {
              sendStepUpdate(nextStep.id)
            }
          }}
          disabled={(!nextStep && experienceState.step !== 'feedback') || !canGoNext() || !wsConnected}
        >
          <span className="panel-nav-label">
            {experienceState.step === 'feedback' ? <Ruby rt="かんりょう">完了</Ruby> : 'つぎへ'}
          </span>
          <span className="panel-nav-circle">
            <ArrowRight className="panel-nav-arrow-icon" weight="bold" aria-hidden="true" />
          </span>
        </button>
      </footer>
    </div>
  )
}

export default Panel

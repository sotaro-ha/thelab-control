import { useEffect, useRef, useCallback } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Motion from './pages/Motion'
import Control from './pages/Control'
import Panel from './pages/Panel'

const IDLE_TIMEOUT = 2 * 60 * 1000 // 2 minutes in milliseconds

function App() {
  const clickCountRef = useRef(0)
  const clickTimerRef = useRef(null)
  const idleTimerRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
    }
    // Don't set idle timer on start screens
    if (
      location.pathname !== '/' &&
      location.pathname !== '/control' &&
      location.pathname !== '/panel' &&
      location.pathname !== '/motion'
    ) {
      idleTimerRef.current = setTimeout(() => {
        navigate('/')
      }, IDLE_TIMEOUT)
    }
  }, [navigate, location.pathname])

  useEffect(() => {
    const toggleFullscreen = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        document.documentElement.requestFullscreen()
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        toggleFullscreen()
      }
      resetIdleTimer()
    }

    const handleClick = () => {
      clickCountRef.current += 1

      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current)
      }

      if (clickCountRef.current >= 3) {
        toggleFullscreen()
        clickCountRef.current = 0
      } else {
        clickTimerRef.current = setTimeout(() => {
          clickCountRef.current = 0
        }, 500)
      }
      resetIdleTimer()
    }

    const handleActivity = () => {
      resetIdleTimer()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('click', handleClick)
    document.addEventListener('mousemove', handleActivity)
    document.addEventListener('touchstart', handleActivity)

    // Start idle timer
    resetIdleTimer()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('click', handleClick)
      document.removeEventListener('mousemove', handleActivity)
      document.removeEventListener('touchstart', handleActivity)
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current)
      }
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
      }
    }
  }, [resetIdleTimer])

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/control" element={<Control />} />
      <Route path="/panel" element={<Panel />} />
      <Route path="/motion" element={<Motion />} />
    </Routes>
  )
}

export default App

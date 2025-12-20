import { useNavigate } from 'react-router-dom'

export default function Navigation({ prevPath, nextPath, prevLabel = "もどる", nextLabel = "つぎへ", onNext }) {
  const navigate = useNavigate()

  const handlePrev = () => {
    if (prevPath) navigate(prevPath)
  }

  const handleNext = () => {
    if (onNext) {
      onNext()
    } else if (nextPath) {
      navigate(nextPath)
    }
  }

  return (
    <div className="navigation">
      <button
        className="nav-button"
        onClick={handlePrev}
        disabled={!prevPath}
      >
        <div className="nav-icon">
          <span className="nav-arrow">←</span>
        </div>
        <span>{prevLabel}</span>
      </button>

      <button
        className="nav-button"
        onClick={handleNext}
        disabled={!nextPath && !onNext}
      >
        <div className="nav-icon">
          <span className="nav-arrow">→</span>
        </div>
        <span>{nextLabel}</span>
      </button>
    </div>
  )
}

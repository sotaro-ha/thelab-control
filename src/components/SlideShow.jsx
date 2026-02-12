import { ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { useState } from 'react'
import Ruby from './Ruby'
import './SlideShow.css'

function SlideShow({ onClose }) {
  const [currentSlide, setCurrentSlide] = useState(0)

  const slides = [
    {
      title: (
        <>
          <Ruby rt="からだ">体</Ruby>を<Ruby rt="うご">動</Ruby>かして<Ruby rt="あそ">遊</Ruby>ぼう！
        </>
      ),
      description: (
        <>
          きみの<Ruby rt="からだ">体</Ruby>の<Ruby rt="うご">動</Ruby>きに<Ruby rt="あ">合</Ruby>わせて、ロボットが<Ruby rt="うご">動</Ruby>くよ。
        </>
      ),
      image: null
    },
    {
      title: (
        <>
          <Ruby rt="からだ">体</Ruby>を<Ruby rt="うご">動</Ruby>かしてみよう
        </>
      ),
      description: (
        <>
          カメラの<Ruby rt="まえ">前</Ruby>に<Ruby rt="た">立</Ruby>って、<Ruby rt="て">手</Ruby>や<Ruby rt="からだ">体</Ruby>を<Ruby rt="うご">動</Ruby>かしてみてね。
          <br />
          ロボットが<Ruby rt="おな">同</Ruby>じように<Ruby rt="うご">動</Ruby>くよ！
        </>
      ),
      image: null
    },
    {
      title: (
        <>
          いろんなポーズをしてみよう
        </>
      ),
      description: (
        <>
          <Ruby rt="て">手</Ruby>を<Ruby rt="あ">上</Ruby>げたり、おどったりしてみよう！
          <br />
          ロボットも<Ruby rt="いっしょ">一緒</Ruby>に<Ruby rt="うご">動</Ruby>くよ。
        </>
      ),
      image: null
    }
  ]

  const handlePrevious = () => {
    setCurrentSlide((prev) => (prev > 0 ? prev - 1 : prev))
  }

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide((prev) => prev + 1)
    } else {
      onClose()
    }
  }

  const slide = slides[currentSlide]

  return (
    <div className="slideshow-container">
      <div className="slideshow-content">
        <div className="slide-header">
          <h1 className="slide-title">{slide.title}</h1>
        </div>

        <div className="slide-body">
          {slide.image && (
            <div className="slide-image">
              <img src={slide.image} alt="" />
            </div>
          )}
          <p className="slide-description">{slide.description}</p>
        </div>

        <div className="slide-navigation">
          <button
            className="nav-button nav-previous"
            onClick={handlePrevious}
            disabled={currentSlide === 0}
          >
            <div className="nav-circle">
              <ArrowLeft className="nav-arrow-icon" weight="bold" aria-hidden="true" />
            </div>
            <div className="nav-label">もどる</div>
          </button>

          <div className="slide-dots">
            {slides.map((_, index) => (
              <span
                key={index}
                className={`dot ${index === currentSlide ? 'active' : ''}`}
              />
            ))}
          </div>

          <button
            className="nav-button nav-next"
            onClick={handleNext}
          >
            <div className="nav-circle">
              <ArrowRight className="nav-arrow-icon" weight="bold" aria-hidden="true" />
            </div>
            <div className="nav-label">
              {currentSlide === slides.length - 1 ? 'とじる' : 'つぎへ'}
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

export default SlideShow

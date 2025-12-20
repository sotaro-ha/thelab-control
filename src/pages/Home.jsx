import { useNavigate } from 'react-router-dom'
import Ruby from '../components/Ruby'
import './Home.css'

function Home() {
  const navigate = useNavigate()

  const handleStart = () => {
    navigate('/panel', { state: { resetExperience: true } })
  }

  return (
    <div className="home-container">
      <div className="content-wrapper">
        <header className="header">
          <h1 className="title">
            <Ruby rt="からだ">体</Ruby>を<Ruby rt="うご">動</Ruby>かして<Ruby rt="あそ">遊</Ruby>ぼう！
          </h1>
        </header>

        <main className="main-content">
          <section className="experience-section">
            <button
              className="experience-button"
              onClick={handleStart}
            >
              <Ruby rt="はじ">始</Ruby>める
            </button>
          </section>

          <section className="description-section">
            <div className="description-box">
              <h2>
                <Ruby rt="からだ">体</Ruby>を<Ruby rt="つか">使</Ruby>って
                <Ruby rt="てんじ">展示</Ruby>が<Ruby rt="うご">動</Ruby>くよ
              </h2>
              <p>
                <Ruby rt="がめん">画面</Ruby>の<Ruby rt="まえ">前</Ruby>に
                <Ruby rt="た">立</Ruby>って、<Ruby rt="じゆう">自由</Ruby>に
                <Ruby rt="うご">動</Ruby>いてみてね。
                <br />
                きみの<Ruby rt="からだ">体</Ruby>の<Ruby rt="うご">動</Ruby>きに
                <Ruby rt="あ">合</Ruby>わせて、ロボットが<Ruby rt="うご">動</Ruby>くよ！
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default Home

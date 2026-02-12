import { useState, useEffect, useCallback } from 'react'
import './Admin.css'

const API_BASE = `${window.location.protocol}//${window.location.hostname}:3001`

const HAND_OPTIONS = [
  { value: null, label: '---' },
  { value: 'right', label: '右手' },
  { value: 'left', label: '左手' },
  { value: 'both', label: '両手' },
]

function Admin() {
  const [devices, setDevices] = useState([])

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/devices`)
      const data = await res.json()
      setDevices(data.devices || [])
    } catch {
      // ignore fetch errors
    }
  }, [])

  useEffect(() => {
    fetchDevices()
    const interval = setInterval(fetchDevices, 3000)
    return () => clearInterval(interval)
  }, [fetchDevices])

  async function handleDiscover() {
    try {
      await fetch(`${API_BASE}/api/discover`, { method: 'POST' })
      setTimeout(fetchDevices, 1000)
    } catch {
      // ignore
    }
  }

  async function sendMapping(deviceId, mapping) {
    try {
      await fetch(`${API_BASE}/api/devices/${deviceId}/mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping }),
      })
      fetchDevices()
    } catch {
      // ignore
    }
  }

  function handleHandChange(deviceId, hand, currentMapping) {
    if (hand === null) {
      sendMapping(deviceId, 'none')
    } else {
      sendMapping(deviceId, {
        hand,
        angleMin: currentMapping?.angleMin ?? 0,
        angleMax: currentMapping?.angleMax ?? 180,
        invert: currentMapping?.invert ?? false,
      })
    }
  }

  function handleAngleChange(deviceId, field, value, currentMapping) {
    if (!currentMapping) return
    sendMapping(deviceId, {
      ...currentMapping,
      [field]: Math.max(0, Math.min(180, Number(value))),
    })
  }

  function handleInvertToggle(deviceId, currentMapping) {
    if (!currentMapping) return
    sendMapping(deviceId, {
      ...currentMapping,
      invert: !currentMapping.invert,
    })
  }

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('ja-JP')
  }

  const mappedCount = devices.filter(d => d.mapping).length

  return (
    <div className="admin-container">
      <div className="admin-header">
        <div>
          <div className="admin-overline">Admin</div>
          <h1 className="admin-title">デバイス管理</h1>
        </div>
        <div className="admin-actions">
          <span className="admin-device-count">
            {devices.length} 台検出{mappedCount > 0 && ` / ${mappedCount} 台マッピング中`}
          </span>
          <button className="admin-discover-btn" onClick={handleDiscover}>
            ディスカバリー実行
          </button>
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="admin-card">
          <div className="admin-empty">
            デバイスが検出されていません。「ディスカバリー実行」を押してください。
          </div>
        </div>
      ) : (
        <div className="admin-device-list">
          {devices.map(device => {
            const m = device.mapping
            const activeHand = m?.hand || null

            return (
              <div key={device.id} className="admin-card device-card">
                <div className="device-info-row">
                  <span className="device-id">{device.id}</span>
                  <span className="device-ip">{device.ip}:{device.controlPort}</span>
                  <span className="device-time">{formatTime(device.lastSeen)}</span>
                </div>

                <div className="device-config">
                  <div className="config-section">
                    <div className="config-label">入力</div>
                    <div className="mapping-buttons">
                      {HAND_OPTIONS.map(opt => (
                        <button
                          key={opt.label}
                          className={`mapping-btn ${activeHand === opt.value ? 'active' : ''} ${opt.value ? 'mapping-' + opt.value : ''}`}
                          onClick={() => handleHandChange(device.id, opt.value, m)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {m && (
                    <>
                      <div className="config-section">
                        <div className="config-label">角度範囲</div>
                        <div className="angle-range">
                          <input
                            type="number"
                            className="angle-input"
                            min="0"
                            max="180"
                            value={m.angleMin}
                            onChange={e => handleAngleChange(device.id, 'angleMin', e.target.value, m)}
                          />
                          <span className="angle-sep">~</span>
                          <input
                            type="number"
                            className="angle-input"
                            min="0"
                            max="180"
                            value={m.angleMax}
                            onChange={e => handleAngleChange(device.id, 'angleMax', e.target.value, m)}
                          />
                          <span className="angle-unit">°</span>
                        </div>
                      </div>

                      <div className="config-section">
                        <div className="config-label">反転</div>
                        <button
                          className={`invert-toggle ${m.invert ? 'active' : ''}`}
                          onClick={() => handleInvertToggle(device.id, m)}
                        >
                          {m.invert ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Admin

// サーボ制御テストスクリプト
import dgram from 'dgram'

const DEVICE_IP = process.argv[2] || '192.168.1.100' // コマンドライン引数から取得
const CONTROL_PORT = 12345

const socket = dgram.createSocket('udp4')

socket.bind(() => {
  socket.setBroadcast(true)
})

function sendServoCommand(angle) {
  const command = {
    action: 'set_servo',
    params: {
      angle: angle
    }
  }

  const message = JSON.stringify(command)
  const buffer = Buffer.from(message)

  socket.send(buffer, 0, buffer.length, CONTROL_PORT, DEVICE_IP, (err) => {
    if (err) {
      console.error('❌ Send error:', err)
    } else {
      console.log(`✅ Sent to ${DEVICE_IP}:${CONTROL_PORT} - angle: ${angle}`)
    }
  })
}

console.log(`🤖 Servo Control Test`)
console.log(`Target: ${DEVICE_IP}:${CONTROL_PORT}`)
console.log('Sending test sequence...\n')

// テストシーケンス
const angles = [90, 0, 180, 90]
let index = 0

const interval = setInterval(() => {
  if (index < angles.length) {
    sendServoCommand(angles[index])
    index++
  } else {
    console.log('\n✅ Test sequence completed')
    clearInterval(interval)
    socket.close()
    process.exit(0)
  }
}, 1000)

socket.on('error', (err) => {
  console.error('Socket error:', err)
  socket.close()
  process.exit(1)
})

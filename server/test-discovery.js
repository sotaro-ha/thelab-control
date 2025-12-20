// QubiLink ディスカバリーテストスクリプト
import dgram from 'dgram'

const DISCOVERY_PORT = 12340
const socket = dgram.createSocket('udp4')

socket.on('message', (msg, rinfo) => {
  console.log(`\n📡 Received from ${rinfo.address}:${rinfo.port}`)
  try {
    const data = JSON.parse(msg.toString())
    console.log(JSON.stringify(data, null, 2))
  } catch (e) {
    console.log('Raw:', msg.toString())
  }
})

socket.on('error', (err) => {
  console.error('Socket error:', err)
  socket.close()
})

socket.bind(DISCOVERY_PORT, () => {
  console.log(`🔍 Listening for QubiLink messages on port ${DISCOVERY_PORT}`)
  console.log('Waiting for announcements from devices...\n')
})

// Ctrl+Cで終了
process.on('SIGINT', () => {
  console.log('\n👋 Closing listener...')
  socket.close()
  process.exit(0)
})

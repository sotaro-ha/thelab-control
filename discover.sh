#!/bin/bash

UDP_PORT=12340
TIMEOUT=3

echo "Sending discovery request to port $UDP_PORT..."

# discoveryリクエストを送信し、応答を待つ
response=$(echo -n '{"type":"discover","proto":"qubilink","ver":1}' | nc -u -w$TIMEOUT 255.255.255.255 $UDP_PORT 2>/dev/null)

if [ -z "$response" ]; then
    echo "No response received (timeout: ${TIMEOUT}s)"
    echo ""
    echo "考えられる原因:"
    echo "  - デバイスがネットワークに接続されていない"
    echo "  - ポート番号が異なる"
    echo "  - ファイアウォールでブロックされている"
else
    echo "Response received:"
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
fi
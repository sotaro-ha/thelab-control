#!/bin/bash

UDP_BROADCAST_IP="255.255.255.255"
UDP_PORT=12345

MODULE_TYPE="actuator"
MODULE_ID="actuator_02"
ACTION="set_servo"

send_angle() {
    local angle=$1
    local message="{\"module_type\":\"$MODULE_TYPE\",\"module_id\":\"$MODULE_ID\",\"action\":\"$ACTION\",\"params\":{\"angle\":$angle}}"
    
    echo -n "$message" | nc -u -w1 "$UDP_BROADCAST_IP" "$UDP_PORT" 2>/dev/null
    echo "Sent: angle = $angle"
}

echo "Enter servo angles (0–180). Press Ctrl+C to exit."

trap 'echo -e "\nStopped by user."; exit 0' INT

while true; do
    read -p "Angle: " angle_str
    
    # 数値チェック
    if ! [[ "$angle_str" =~ ^[0-9]+$ ]]; then
        echo "Invalid input. Please enter an integer."
        continue
    fi
    
    angle=$((angle_str))
    
    # 範囲チェック
    if [ "$angle" -lt 0 ] || [ "$angle" -gt 180 ]; then
        echo "Please enter a value between 0 and 180."
        continue
    fi
    
    send_angle "$angle"
done
import socket
import json
import random
import time

UDP_BROADCAST_IP = "255.255.255.255"
UDP_PORT = 12345

module_type = "actuator"
action = "set_servo"

# Create list of actuator IDs from 01 to 09
actuator_ids = [f"actuator_{i:02d}" for i in range(1, 10)]

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

print(f"Starting random angle control for actuators: {', '.join(actuator_ids)}")
print("Sending random angles (0-180) every 5 seconds. Press Ctrl+C to exit.")

try:
    while True:
        for module_id in actuator_ids:
            # Generate random angle between 0 and 180
            angle = random.randint(0, 180)
            
            message = {
                "module_type": module_type,
                "module_id": module_id,
                "action": action,
                "params": {
                    "angle": angle
                }
            }

            sock.sendto(json.dumps(message).encode(), (UDP_BROADCAST_IP, UDP_PORT))
            print(f"Sent to {module_id}: angle = {angle}")
        
        print("--- Waiting 5 seconds ---")
        time.sleep(5)

except KeyboardInterrupt:
    print("\nStopped by user.")
    sock.close()
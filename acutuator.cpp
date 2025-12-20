#include "qubi_core.h"
#include <s3servo.h>

const int SERVO_PIN = D10;
const uint16_t DISCOVERY_UDP_PORT = 12340;
const uint16_t CONTROL_PORT = 12345;
const unsigned long ANNOUNCE_INTERVAL_MS = 1500;
const char* MODULE_ID = "actuator_01";

s3servo servo;

static WiFiUDP discUdp;
static bool discUdpInited = false;
static unsigned long lastAnnounce = 0;

static void ensureDiscUdp() {
  if (!discUdpInited) {
    discUdp.begin(DISCOVERY_UDP_PORT);
    discUdpInited = true;
  }
}

static void handleDiscoveryUdp() {
  ensureDiscUdp();
  int packetSize = discUdp.parsePacket();
  if (packetSize <= 0) {
    return;
  }

  char buf[256];
  int len = discUdp.read((uint8_t*)buf, sizeof(buf) - 1);
  if (len <= 0) return;
  buf[len] = '\0';

  StaticJsonDocument<256> req;
  if (deserializeJson(req, buf) != DeserializationError::Ok) {
    return;
  }

  const char* type = req["type"] | "";
  const char* proto = req["proto"] | "";
  int ver = req["ver"] | 0;
  if (strcmp(proto, "qubilink") != 0 || ver != 1) {
    return;
  }

  if (strcmp(type, "discover") == 0) {
    StaticJsonDocument<256> res;
    res["type"] = "reply";
    res["device_id"] = MODULE_ID;
    res["ip"] = WiFi.localIP().toString();
    JsonObject caps = res.createNestedObject("caps");
    caps["control"] = true;
    caps["video_in"] = false;
    caps["video_out"] = false;
    JsonObject ports = res.createNestedObject("ports");
    ports["control"] = CONTROL_PORT;
    ports["video_in"] = 0;

    char out[256];
    size_t written = serializeJson(res, out, sizeof(out));
    discUdp.beginPacket(discUdp.remoteIP(), discUdp.remotePort());
    discUdp.write((const uint8_t*)out, written);
    discUdp.endPacket();
  }
}

static void sendDiscoveryAnnounce() {
  ensureDiscUdp();
  StaticJsonDocument<256> msg;
  msg["type"] = "announce";
  msg["proto"] = "qubilink";
  msg["ver"] = 1;
  msg["device_id"] = MODULE_ID;
  JsonObject caps = msg.createNestedObject("caps");
  caps["control"] = true;
  caps["video_in"] = false;
  caps["video_out"] = false;
  msg["ip"] = WiFi.localIP().toString();
  JsonObject ports = msg.createNestedObject("ports");
  ports["control"] = CONTROL_PORT;
  ports["video_in"] = 0;
  msg["nonce"] = (uint32_t)millis();

  char out[256];
  size_t written = serializeJson(msg, out, sizeof(out));
  discUdp.beginPacket("255.255.255.255", DISCOVERY_UDP_PORT);
  discUdp.write((const uint8_t*)out, written);
  discUdp.endPacket();
}

class QubiModuleActuator : public QubiModuleBase {
protected:
  virtual void onWakeup() override {
    servo.attach(SERVO_PIN);
    servo.write(60);
    delay(500);
    servo.write(120);
    delay(500);
    servo.write(90);
  }

  virtual void onReceivedCommand(const StaticJsonDocument<4096>& doc) override {
    const char* action = doc["action"];
    if (strcmp(action, "set_servo") == 0) {
      float requested = doc["params"]["angle"] | 90.0f;
      if (requested < 0.0f) requested = 0.0f;
      if (requested > 180.0f) requested = 180.0f;
      int angle = static_cast<int>(requested + 0.5f);
      servo.write(angle);
    }
  }
};

QubiModuleActuator module;

void setup() {
  module.setShakeDetectInterval(100);
  module.setModuleId(MODULE_ID);
  module.start("actuator", "TP-Link_8F45", "37503437");
  digitalWrite(LED_BUILTIN, LOW);
  ensureDiscUdp();
}

void loop() {
  handleDiscoveryUdp();

  if (millis() - lastAnnounce >= ANNOUNCE_INTERVAL_MS) {
    lastAnnounce = millis();
    sendDiscoveryAnnounce();
  }

  delay(10);
}
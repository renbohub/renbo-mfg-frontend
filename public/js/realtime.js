(function () {
  const config = window.REALTIME_CONFIG || {};
  if (config.socketUrl && window.io) {
    const socket = io(config.socketUrl, { transports: ["websocket", "polling"], autoConnect: true });
    ["master-data:changed", "product:created", "product:updated", "product:deleted"].forEach((event) => socket.on(event, (detail) => window.dispatchEvent(new CustomEvent("master-data:changed", { detail }))));
  }
  if (config.mqttUrl && window.mqtt) {
    const client = mqtt.connect(config.mqttUrl);
    client.on("connect", () => client.subscribe("renbo/master-data/#"));
    client.on("message", (topic, payload) => window.dispatchEvent(new CustomEvent("master-data:changed", { detail: { topic, payload: payload.toString() } })));
  }
})();

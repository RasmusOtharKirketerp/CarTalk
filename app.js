const SERVICE_UUID = "19b10010-e8f2-537e-4f6c-d104768a1214";
const CHAT_CHAR_UUID = "19b10011-e8f2-537e-4f6c-d104768a1214";
const LOCATION_CHAR_UUID = "19b10012-e8f2-537e-4f6c-d104768a1214";
const TELEMETRY_CHAR_UUID = "19b10013-e8f2-537e-4f6c-d104768a1214";
const MAX_DISTANCE_METERS = 300;

const connectBtn = document.querySelector("#connectBtn");
const locBtn = document.querySelector("#locBtn");
const form = document.querySelector("#messageForm");
const input = document.querySelector("#messageInput");
const feed = document.querySelector("#feed");
const itemTemplate = document.querySelector("#itemTemplate");
const speedInput = document.querySelector("#speedInput");
const accelInput = document.querySelector("#accelInput");
const brakeInput = document.querySelector("#brakeInput");

const bleState = document.querySelector("#bleState");
const geoState = document.querySelector("#geoState");
const distanceState = document.querySelector("#distanceState");
const myDriveTime = document.querySelector("#myDriveTime");
const myHoldTime = document.querySelector("#myHoldTime");
const remoteSpeed = document.querySelector("#remoteSpeed");
const remoteAccel = document.querySelector("#remoteAccel");
const remoteBrake = document.querySelector("#remoteBrake");
const remoteTimes = document.querySelector("#remoteTimes");

let chatChar;
let locationChar;
let telemetryChar;
let myCoords;
let remoteCoords;
let telemetryInterval;
let driveSeconds = 0;
let holdSeconds = 0;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function pushFeed(message, type = "in") {
  const node = itemTemplate.content.firstElementChild.cloneNode(true);
  const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  node.querySelector("time").textContent = `${stamp} / ${type}`;
  node.querySelector("span").textContent = message;
  feed.prepend(node);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineMeters(a, b) {
  const earth = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

function renderDistance() {
  if (!myCoords || !remoteCoords) {
    distanceState.textContent = "Unknown";
    return;
  }

  const meters = haversineMeters(myCoords, remoteCoords);
  const label = `${Math.round(meters)} m`;
  distanceState.textContent = meters <= MAX_DISTANCE_METERS ? `${label} (in range)` : `${label} (out of range)`;
}

function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function renderMyTimers() {
  myDriveTime.textContent = formatTime(driveSeconds);
  myHoldTime.textContent = formatTime(holdSeconds);
}

function buildTelemetryPacket() {
  const speed = Number(speedInput.value || 0);
  const accel = Number(accelInput.value || 0);
  const brake = brakeInput.value === "on";
  return {
    speed,
    acceleration: accel,
    brake,
    holdSeconds,
    driveSeconds,
    timestamp: Date.now(),
  };
}

function applyTimerTick() {
  const speed = Number(speedInput.value || 0);
  if (speed > 0) {
    driveSeconds += 1;
  } else {
    holdSeconds += 1;
  }
  renderMyTimers();
}

function renderRemoteTelemetry(packet) {
  remoteSpeed.textContent = `${packet.speed ?? 0} km/t`;
  remoteAccel.textContent = `${packet.acceleration ?? 0} m/s²`;
  remoteBrake.textContent = packet.brake ? "On" : "Off";
  remoteTimes.textContent = `${formatTime(packet.driveSeconds ?? 0)} / ${formatTime(packet.holdSeconds ?? 0)}`;
}

async function sendTelemetry() {
  if (!telemetryChar) {
    return;
  }
  const payload = JSON.stringify(buildTelemetryPacket());
  await telemetryChar.writeValue(encoder.encode(payload));
}

function startTelemetryLoop() {
  if (telemetryInterval) {
    clearInterval(telemetryInterval);
  }
  telemetryInterval = setInterval(async () => {
    applyTimerTick();
    try {
      await sendTelemetry();
    } catch (error) {
      pushFeed(`Telemetry sync failed: ${error.message}`, "err");
    }
  }, 1000);
}

async function connectBluetooth() {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth is not supported in this browser.");
  }

  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }],
    optionalServices: [SERVICE_UUID],
  });

  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  chatChar = await service.getCharacteristic(CHAT_CHAR_UUID);
  locationChar = await service.getCharacteristic(LOCATION_CHAR_UUID);
  telemetryChar = await service.getCharacteristic(TELEMETRY_CHAR_UUID);

  await chatChar.startNotifications();
  chatChar.addEventListener("characteristicvaluechanged", (event) => {
    const value = event.target.value;
    const text = decoder.decode(value);
    pushFeed(text, "rx");
  });

  await locationChar.startNotifications();
  locationChar.addEventListener("characteristicvaluechanged", (event) => {
    try {
      const packet = JSON.parse(decoder.decode(event.target.value));
      remoteCoords = { lat: packet.lat, lon: packet.lon };
      renderDistance();
    } catch {
      pushFeed("Received invalid location packet", "sys");
    }
  });

  await telemetryChar.startNotifications();
  telemetryChar.addEventListener("characteristicvaluechanged", (event) => {
    try {
      const packet = JSON.parse(decoder.decode(event.target.value));
      renderRemoteTelemetry(packet);
    } catch {
      pushFeed("Received invalid telemetry packet", "sys");
    }
  });

  startTelemetryLoop();
  bleState.textContent = `Connected: ${device.name || "BLE relay"}`;
  pushFeed("Bluetooth relay link active", "sys");
}

async function shareLocation() {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not supported in this browser.");
  }

  const pos = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });

  myCoords = {
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
  };

  geoState.textContent = `${myCoords.lat.toFixed(5)}, ${myCoords.lon.toFixed(5)}`;
  renderDistance();

  if (locationChar) {
    const payload = JSON.stringify(myCoords);
    await locationChar.writeValue(encoder.encode(payload));
    pushFeed("Location shared to relay", "tx");
  }
}

connectBtn.addEventListener("click", async () => {
  try {
    await connectBluetooth();
  } catch (error) {
    bleState.textContent = "Connection failed";
    pushFeed(error.message, "err");
  }
});

locBtn.addEventListener("click", async () => {
  try {
    await shareLocation();
  } catch (error) {
    pushFeed(error.message, "err");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!chatChar) {
    pushFeed("Connect Bluetooth relay first", "err");
    return;
  }

  const text = input.value.trim();
  if (!text) {
    return;
  }

  try {
    await chatChar.writeValue(encoder.encode(text));
    pushFeed(text, "tx");
    input.value = "";
  } catch (error) {
    pushFeed(error.message, "err");
  }
});

pushFeed("Ready. Connect to BLE relay to start car-grid chat.", "sys");
renderMyTimers();

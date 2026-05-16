# CarTalk BLE Grid (POC)

## What this is
A browser app for nearby car-to-car messaging using **Web Bluetooth** + optional location checks.

## Critical reality check
Web browsers cannot reliably do BLE **peripheral/advertiser** role for two-way peer chat between arbitrary phones/laptops.
This POC uses a **BLE relay node** (for example ESP32 firmware) that exposes one service and three characteristics:

- `SERVICE_UUID`: `19b10010-e8f2-537e-4f6c-d104768a1214`
- `CHAT_CHAR_UUID`: `19b10011-e8f2-537e-4f6c-d104768a1214`
- `LOCATION_CHAR_UUID`: `19b10012-e8f2-537e-4f6c-d104768a1214`
- `TELEMETRY_CHAR_UUID`: `19b10013-e8f2-537e-4f6c-d104768a1214`

Each car opens this web app and connects to the same relay device.

## Run
1. Open `index.html` in a secure context (`https://` or localhost).
2. Click `Connect Bluetooth Relay`.
3. Click `Share My Location`.
4. Set speed/acceleration/brake in the telemetry panel.
5. Send messages.

Telemetry is sent every second and includes:
- speed
- acceleration
- brake status
- drive time
- hold time

## Browser support
- Best support: Chromium-based browsers on Android/desktop.
- Safari/iOS support is limited and may not work for this flow.
- This project is intentionally BT-only. No QR, no cloud fallback.

## BT-only join test (GitHub Pages)
1. Open the same GitHub Pages URL on PC and mobile.
2. Confirm `Device Check` shows Bluetooth path ready on both.
3. On both devices, click `Join Via Bluetooth Relay`.
4. Select the same BLE relay node when prompted.
5. Verify both clients show `Connected` and that chat/telemetry updates appear in each other's feed.

If `Device Check` is red, that browser/device is blocked for BT-only mode.

## Next radical step
Put one BLE relay in each car + mesh firmware between relays.
Then this web UI stays unchanged while the firmware handles multi-car routing.

# Device testing (M4: vehicle scan)

M4 status: **awaiting real-device testing.**

Use a **debug build** for this round. It talks to Metro on your Mac, shows logs, and keeps the dev-only capture simulation so you can walk past the vehicle steps. Release builds turn that simulation off; tyre capture is M5.

## 0. Once, on the Mac

```sh
cd "/Users/apple/Desktop/Line Up Tyre Kit Bay"
npm install
cd ios && pod install && cd ..   # full pods, ML Kit OCR included. Do NOT set LINEUP_IOS_SIM here.
```

`ios/Podfile.lock` should list `RnMlkitOcr`. If you ever ran `LINEUP_IOS_SIM=1 pod install`, run plain `pod install` again before building for a phone.

Keep Metro running in its own terminal for both phones:

```sh
npm start
```

## 1. iPhone (iOS 16 or later)

Signing setup (once):
1. Connect the iPhone by cable and unlock it. Tap **Trust** on the phone.
2. iPhone: **Settings → Privacy & Security → Developer Mode → On**, restart, confirm.
3. `open ios/LineUpTyreKitBay.xcworkspace` (the **.xcworkspace**, not .xcodeproj).
4. Select the **LineUpTyreKitBay** target → **Signing & Capabilities** → tick **Automatically manage signing** → choose your **Team** (sign in under Xcode → Settings → Accounts if none is listed).
5. If Xcode says the bundle identifier `com.lineup.tyrekitbay` isn't available to your team (common with a free Apple ID), change it locally in that same field to something unique, e.g. `com.lineup.tyrekitbay.<yourname>`. Don't commit that change; the bundle ID stays a placeholder on the release checklist.

Build and run:

```sh
# list connected devices and their names
xcrun xctrace list devices

npx react-native run-ios --device "<Your iPhone name>"
```

Or in Xcode: pick your iPhone as the run destination and press **Run** (⌘R).

First launch only: if the phone says **Untrusted Developer**, go to **Settings → General → VPN & Device Management**, tap your developer profile, **Trust**. The phone and Mac must be on the same Wi-Fi for Metro.

Logs: Xcode's console while running from Xcode, or the Metro terminal for JS logs.

## 2. Android phone (Android 8.0 or later)

Setup (once):
1. Phone: **Settings → About phone → tap Build number 7 times** to enable Developer options.
2. **Settings → System → Developer options → USB debugging → On.**
3. Connect by cable, accept the **Allow USB debugging?** prompt (tick "Always allow").
4. Check it's visible: `~/Library/Android/sdk/platform-tools/adb devices` shows the phone as `device` (not `unauthorized`).

No signing setup is needed for debug: it uses the project's debug keystore.

Build and run:

```sh
~/Library/Android/sdk/platform-tools/adb reverse tcp:8081 tcp:8081
npm run android
```

If more than one device is connected, add `-- --deviceId <id from adb devices>`.

Logs: `~/Library/Android/sdk/platform-tools/adb logcat | grep -iE "ReactNativeJS|VisionCamera|CameraX|mlkit|FATAL"`

Release signing (an upload keystore) isn't set up yet and isn't needed for this round.

## 3. Resetting between tests

To see first launch and the permission prompts again:
- **iPhone:** delete the app (long-press → Remove App), then run again. To reset only camera permission: Settings → General → Transfer or Reset iPhone → Reset → Reset Location & Privacy (resets all apps).
- **Android:** `adb shell pm clear com.lineup.tyrekitbay` (clears data and permissions), or Settings → Apps → Line Up → Storage → Clear storage.

## 4. Test checklist

Start each test from Home → **Start scan**, unless it says otherwise. Have ready: a real number plate (on a car, or a removed plate), and a chassis/VIN plate or the VIN printed in a door frame or on registration papers.

| # | Area | Steps | Expected result |
|---|---|---|---|
| P1 | Permission, first ask | Fresh install. Get through the walkthrough. On **Allow camera access** tap **Not now**. Then **Start scan**. | Start scan shows **Allow camera access** again (not yet asked). |
| P2 | Permission, allow | Continue from P1: **Allow camera** → system prompt → **Allow** (Android: *While using the app*). | Scan number plate opens with a **live camera preview** inside the rounded box and the blue guide box over it. |
| P3 | Permission, deny | Reset. **Start scan** → **Allow camera** → **Don't Allow / Deny**. | Scan number plate opens. iPhone: viewfinder says **Camera access is off** with **Open Settings**. Android: first shows **Allow camera access / Allow camera**; tapping it and denying again shows **Camera access is off**. Capture is greyed out. **Type it** and **Skip** still work. |
| P4 | Permission, fix in Settings | From P3 tap **Open Settings**, turn Camera on, return to the app. | The app's Settings page opens. On return the live preview starts without restarting the app. (iOS may restart the app when the permission changes; then you land on Home with **Continue inspection** — that's fine.) |
| P5 | Flash | With the preview live, tap **Flash off**. | Torch turns on, label reads **Flash on**. Tap again → off. On a phone with no torch the control reads **No flash** and is disabled. |
| S1 | Plate scan, auto | Hold the phone so the whole plate fills most of the guide box. Hold still 1–3 s. | Phone vibrates once and **Plate found** opens showing the plate **exactly as printed** (spaces/hyphens may differ). No made-up characters. |
| S2 | Plate confirm | On Plate found tap **Confirm plate**. | **Scan chassis number** opens. |
| S3 | Plate, Scan again / Edit | Repeat S1. Tap **Scan again** → returns to the live scan. Repeat, tap **Edit**. | Edit opens **Check vehicle details** with the plate pre-filled and editable. |
| S4 | Plate, Capture button | Point at a plate and tap the capture button once. | Either **Plate found** opens, or the hint says **Couldn't read the plate. Try again, or type it.** and you stay on the scan. |
| C1 | Chassis scan, auto | On Scan chassis number, fit the whole VIN inside the box, hold still. | Vibrates, **Check vehicle details** opens with the chassis number filled in **exactly as printed**, not padded or "corrected". |
| C2 | Chassis, too far | Hold the phone far enough that the VIN is small in the box. | White **Move closer** pill appears; nothing is accepted until you move closer. |
| C3 | Chassis shorter than 17 | If you have an older/import vehicle with a shorter chassis number, scan it. | Accepted as read (5–17 characters). Vehicle details shows the helper *Some vehicles have fewer than 17 characters.* |
| L1 | Poor light | In a dim workshop corner or at dusk, try S1 and C1 with flash off, then on. | With flash off it may not read: you stay on the scan with the hint visible, no wrong value is filled in. With flash on it should read. Note how long each took. |
| L2 | Glare / angle | Try a shiny or angled plate. | Either a correct read or no read. **A wrong read accepted automatically is a failure** — report it. |
| F1 | Failed scan | Point at something with no text (wall, tyre tread) for 10 s. Tap capture. | Nothing is accepted automatically. Capture shows the *Couldn't read…* message. The app doesn't freeze or crash. |
| F2 | Interruption | With the preview live: lock the phone, unlock; then switch to another app and back; then take a phone call if you can. | Preview comes back by itself. If the system pauses the camera you may briefly see **Camera paused**. |
| F3 | Back out | On the scan, press Back (button, Android back, or iOS edge-swipe). | **Leave this inspection?** with **Keep scanning** / **Save and leave**. |
| M1 | Manual correction | After a scan opens Vehicle details, change a character in each field. Type in lower case. | Text turns upper case. Plate allows letters, numbers, spaces and hyphens only. Chassis allows letters and numbers only. **Continue** goes to Select tyres. Reopen via Back: your edits are kept. |
| M2 | Unusual chassis | Type a chassis of 3 characters, then one of 18. | A warning appears under the field but **Continue still works**. |
| M3 | Empty fields | Clear both fields and tap **Continue**. | Select tyres opens; nothing blocks you. The final report later shows **No plate**. |
| K1 | Skip both | On Scan number plate tap **Skip**, then **Skip** on Scan chassis number. | Select tyres opens. No plate/chassis saved. |
| K2 | Type it | On either scan tap **Type it**. | Check vehicle details opens with empty fields (or what was already read). |
| K3 | Resume | Scan a plate, confirm it, then force-quit the app on the chassis screen. Reopen. | Home shows **Unfinished inspection** with the plate. **Continue inspection** works. |
| R1 | Repeated scans | Do S1 → Scan again ten times in a row. | No slowdown, no crash, phone doesn't get noticeably hot. |

## 5. If something fails, send me

1. **Test number** (e.g. S1) and **phone model + OS version** (Settings → General → About / About phone).
2. **What you expected vs what happened**, in one or two lines.
3. **Screenshot or short screen recording** of the screen when it went wrong.
4. **The value read vs the value printed** for any wrong OCR read. A photo of the plate/VIN helps; blur anything you don't want to share.
5. **Light conditions** (daylight, workshop, dim, flash on/off) and roughly how far the phone was.
6. **Logs** if it crashed or froze:
   - iPhone: the Xcode console output from the moment you started the scan (copy/paste), or the Metro terminal output.
   - Android: run `adb logcat -d > logcat.txt` right after the problem and send the file.
7. Whether it happens **every time** or only sometimes.

Plates and chassis numbers are personal data: crop or blur them in anything you send if needed. The app itself doesn't log them.

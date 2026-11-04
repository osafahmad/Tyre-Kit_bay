# Tyre Kit Bay

React Native app that checks tyre health with the phone camera. Models run on the phone.

- Source of truth: [`docs/TYRE_KIT_BAY_SPEC.md`](docs/TYRE_KIT_BAY_SPEC.md)
- Decisions and deviations: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Rules for contributors and coding assistants: [`CLAUDE.md`](CLAUDE.md)
- Running on real phones and the current test checklist: [`docs/DEVICE_TESTING.md`](docs/DEVICE_TESTING.md)
- Release blockers: [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md)

## Status

| Milestone | State |
|---|---|
| M0 Setup – M3 Inspection state | Done (emulator/simulator tested) |
| M4 Vehicle scan | **Awaiting real-device testing** (deferred by the owner) |
| M5 Tyre capture | **Awaiting real-device testing** |
| M6 – M8 | Not started |

## Run

```sh
npm install
npm start            # Metro

# Android (emulator or device)
npm run android

# iOS device / release: full pods, including ML Kit OCR
cd ios && pod install && cd ..
npm run ios

# iOS simulator on Apple Silicon without Rosetta: leave ML Kit out (OCR becomes manual entry)
cd ios && TYREKITBAY_IOS_SIM=1 pod install && cd ..
```

Requires Node 22.11+, Xcode with the Metal toolchain component, JDK 17, Android SDK 37.

## Checks

```sh
npm run typecheck
npm run lint
npm test
```

## Development builds

Development builds use `DemoTyreAnalyzer`, and every result it produces is labelled `Demo data`. Release builds only use the real TFLite analyzer, which fails clearly until trained models and their manifest values are added (`src/ml/manifest.ts`).

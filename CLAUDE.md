# Tyre Kit Bay

React Native app for checking tyre health with the phone camera. Models run on the phone.

Read `docs/TYRE_KIT_BAY_SPEC.md` before making changes. It is the source of truth. Screen images are in `docs/design/screens/`, and exact design markup and artwork are in `docs/design/source/`.

## Rules
- Build the 21 screens and flow exactly as specified. Follow the screen images for layout and the spec for behaviour.
- Use theme tokens only: black `#0A0A0A`, navy `#12357A`, camera blue `#4DA3FF`, white `#FFFFFF`, border `#E3E6EB`. Green, amber, and red are for tyre status only and always need a text label.
- Keep inference and inspection data on the phone. Don't add a server, analytics, crash reporting, or other network calls without approval.
- Plate and chassis are optional. Don't force a plate format or 17-character chassis number.
- Show Welcome and Walkthrough on first launch only, using `hasSeenWalkthrough`.
- Screens call the `TyreAnalyzer` interface, not TFLite directly.
- `DemoTyreAnalyzer` runs only in development and must show `Demo data`. Never show made-up results as real in a release build.
- Never guess OCR values. Leave missing values empty and let the user correct them.
- If `treadDepthMm` is null, show the status and hide mm.
- Don't invent model input, output, or threshold values. Use the manifest and ask the owner if they're missing.
- Use VisionCamera v5 APIs, dispose every frame, and don't copy v4 examples.
- Check library compatibility before installing. Pin versions and record substitutions in `docs/DECISIONS.md`.
- Don't copy Anyline branding, artwork, or screens.

## Work order
Follow milestones M0 to M8 in the spec, one at a time. After each milestone:
1. Run type checking, lint, and tests where available.
2. Report what was finished, what was tested, and what still needs a real device.
3. Don't claim camera or model work is finished until it has been tested on a real phone.

Don't commit or push unless the owner asks.

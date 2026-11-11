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
  - Exception (owner decision 2026-11-06): a staging Release build may use it while the tread and damage models are missing, only with `diagnosticsConfig.allowDemoAnalyzerInRelease` on, and still labelled `Demo data` everywhere. That flag must be off for store builds.
- Never guess OCR values. Leave missing values empty and let the user correct them.
  - Narrow exceptions (owner decisions 2026-11-06), nothing else:
    - Make, inside a detector `Brand` crop only: may be matched to a name in `src/config/tyreBrands.ts` (contained name; Levenshtein ≤ 1 for brands of 6+ letters with one unique closest brand; or a logo fragment whose letters are ≥ 80% an in-order subsequence of one brand, covering ≥ 40% of it, where that is the only brand passing both and it leads every other brand). A read that matches no listed brand is left empty.
    - DOT/TIN: a letter `O` as the first character of the final 4-character date code is read as `0`, only if the result is a valid week/year. No other character in a DOT/TIN is ever changed.
    - Size, width hundreds digit only: when OCR read just the last two width digits (`95/55`), it may be completed to 175–225 (`1` before 75/85/95, `2` before 05/15/25) only if a rim R13–R17 was read on the same or adjacent line. Aspect ratio and rim are never changed or inferred.
    - Owner decisions 2026-11-10 (iPhone 13 logs), whole frame, no detector:
      - Make: if no listed brand is read whole, a token containing a root in `BRAND_ROOTS` (`src/ml/sidewallTextFilter.ts`: `TINENTAL`, `ICHELIN`, `BRIDGEST`, `GOODYEAR`) gives that brand. New roots need owner approval.
      - DOT/TIN: the misread markers listed in `DOT_MARKER` (`parsers.ts`) are accepted (they only locate the TIN; TIN characters are kept as read). A single valid marked read with no competing read may be suggested whole. A TIN with no marker needs the strict shape in `markerlessTinCandidate` and 2 agreeing frames.
      - Size: a full width/aspect may be joined with an `R` (or `B`, written as `R`) rim token up to two lines away, including a rim with the load/speed glued on (`R1585V`). The width-digit inference above still needs the same or an adjacent line.
      - Make: Continental roots also include `NENTAL` and `TINEN`; if no brand name or root is read, a token containing a word in `MODEL_FAMILY_BRANDS` (`CONTACT` → Continental) gives that brand.
      - Size and make may be suggested from a single frame when no two frames agree.
      - Size: a slash-less width+aspect directly before the rim (`19555 R15` → `195/55 R15`; `COMPACT_SIZE_PATTERN` in `parsers.ts`). A 4-digit read (`9555 R15`) is completed only by the width-digit inference above. `8` counts as the rim marker only as described in `RIM_TOKEN_8` (`sidewallFields.ts`). `RL5`/`RI5` count as R15 before a load/speed, a lone speed symbol, whitespace or the end of the token (`RIM_TOKEN_L1`). `55 R15` may be joined with a width read alone on the adjacent line (`joinAspectRimWithWidth`); a width is never taken from the brand or model. `195/55 R` may be joined with rim digits starting the next line (`joinMarkerWithRimDigits`). A width with no digits read (`o3/55 R15`) is never filled in. A slash-less width/aspect (`19555` alone, `195 55`) may be joined with a marked rim within two lines, or with a rim+load (`1585V`) starting the next line. A bare number (`15`, `158`) is never a rim. If no frame read a whole size, the most-read full width/aspect and the most-read rim with a load/speed index (`R15 85V`) from different frames of one scan may be joined (`sizeParts`); a tie joins nothing. Owner decisions 2026-11-11 (round 11): `3815`, `$815` count as an `8` rim marker (`RIM_TOKEN_8`); a whole line that is an unmarked rim + load/speed (`1545V)`, `RIM_LOAD_UNMARKED_LINE`) is a rim for the line after a full width/aspect and for the cross-frame join; and if no frame read a 3-digit width, the most-read two-digit width/aspect may be completed with the most-read cross-frame rim under the same rim gate (R13–R17, 175–225; `completeShortWidthAspect`). A width with a letter where a digit should be (`AO5/35`) is never repaired.
    - Model (owner decision 2026-11-11, Redmi 13 logs): only a family name listed in `src/config/tyreModels.ts`, read whole as a word (any case; spaces allowed at its camel-case joins, `Comfort Contact`), suggested in its listed spelling; plus one of that family's listed variant codes read as a whole token (`CC7`), in the same frame or another frame of the scan (`fullFrameModelCandidate`, `fullFrameModelCode`). Bare numbers (`Primacy 4`) are never added, fragments never match, and no other text is ever suggested as a model. New families or codes go in that list. Noise (owner decision 2026-11-11, Redmi 13 `Comfortontact`, `ComiortContae`): with no exact match, 1–3 consecutive letter tokens on a line, spaces removed, within `MODEL_FAMILY_FUZZY` edits of one listed family (2 edits for 10+ letters, 1 for 6–9, exact under 6; 3 for 12+ letters when that family's code was read in the same frame), unique closest family only, give the listed spelling. A matched family also gives its brand as make when no other make rule fired.
    - Never for plate or chassis.
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

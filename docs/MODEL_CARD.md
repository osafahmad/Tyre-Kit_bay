# Sidewall detector model card
- File: sidewall_detector.tflite (sha256 b887b3601cc1c588...)
- Architecture: YOLOX-Nano, code license Apache-2.0 (https://github.com/Megvii-BaseDetection/YOLOX, commit 6ddff48243)
- Not built with Ultralytics (AGPL-3.0).
- Classes: 0=Brand, 1=DOT, 2=Model, 3=Size
- Input: [1, 3, 640, 640] float32 RGB 0..1, letterbox 640x640 (pad 114)
- Output: [1, 8, 8400] cx,cy,w,h (pixels) + 4 class scores; apply score>=0.25 and NMS IoU 0.45
- Training data: tyre-to-text v3 by Hetvi EWW (Roboflow Universe), CC BY 4.0. Add this credit in the app.
- Technical record only, not legal advice.

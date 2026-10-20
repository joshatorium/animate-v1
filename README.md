# ANIMATE — Version 1

A web app to teach kids 3D animation.

The app works like Maya in a simple way.
The app has animation tools only.
The app has simple rig tools only.
The app has no model tools.

## Lessons

- Lesson 1: a plain ball. Timing. Squash and stretch.
- Lesson 2: a ball with a tail. Follow through. Overlap.
- Lesson 3: a ball with legs. A jump. A simple walk.

## Main parts

- 3D view with Maya mouse and Maya keys (Q, W, E, R, S).
- Timeline with keys and play.
- Graph Editor in a separate window. All channels. Keys and tangents.
- Rig templates with sliders. One-click Build Rig.
- Playblast. The app makes an MP4 movie file of the scene.
- Maya link. Get FBX from Maya. Send FBX to Maya.

## Status

Test app v0.1 is built (2026-10-20). Screen drawings are in `docs/design/`.

Works: the full layout, the ball rig templates, keys and the timeline,
the Graph Editor window, Save/Open as JSON, playblast to a movie file,
FBX load for playback, and GLB + JSON send (the fallback Maya route).

Not yet done: a click test in a real browser, the Chromebook playblast
time test, tangent handle drag in the Graph Editor, and the server
Blender step that makes a true FBX for Maya.

## Run

The app is a static web app. No build step.

```
python3 -m http.server 8000
```

Then open `http://localhost:8000` in Chrome.

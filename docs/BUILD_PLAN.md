# Build plan — Version 1

## Done

- Idea and scope: animation and simple rigs only.
- Main screen design v3 (Playblast button added).
- Graph Editor design v1 (separate window, Maya-like).
- Platform pick: web app.

## Steps in order

1. Tech base pick: static web app, Three.js for the 3D view.
2. Maya link test: FBX round trip, Maya to app to Maya.
   Keys, tangents, and joint names must stay the same.
   See `docs/fbx-maya-link.md` when the research lands.
3. Data core: channels, keys, tangents. One data set for
   the 3D view, the timeline, and the Graph Editor.
4. First test app: one ball, Move/Rotate/Scale, Alt camera,
   Set Key, Play, timeline scrub.
5. Graph Editor link: drag keys and tangents, ball updates at once.
6. Rig builder: 3 templates, sliders, Build Rig.
7. Playblast: frame-by-frame capture to a movie file.
   See `docs/playblast-plan.md` when the research lands.
8. Lesson 1: the bounce. Test with real kids.
   Pass mark: a good bounce in ten minutes.

## Out of Version 1

- Full modeling tools.
- Paint weights.
- Full render.
- Sound in playblast.
- Accounts.

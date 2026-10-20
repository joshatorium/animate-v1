# FBX and Maya Link — Research Report

Date: 2026-10-20

App: ANIMATE, Version 1.

This app is a web app.

Kids use it in a browser.

The app must send work to Maya.

The app must get work from Maya.

Keys must stay.

Joint names must stay.

Tangents must stay if we can do it.

This report checks each claim from a source.

## Short Verdict

Import from Maya works in the browser.

Export to Maya does not work in the browser alone.

Three.js has no FBX exporter.

The best Version 1 route is a small server.

The app sends a GLB file to the server.

The app also sends a small JSON file.

The JSON file holds the exact keys.

The JSON file holds the exact tangents.

A free Blender script on the server builds an FBX file.

The kid then downloads the FBX file.

The kid opens the FBX file in Maya.

Motion will stay true.

Joint names will stay true.

Most tangent types will not stay true.

The FBX file will have many baked keys.

That is the honest trade.

## Part 1 — Get Work from Maya

Maya can export an FBX file.

Three.js has a tool with the name FBXLoader.

FBXLoader runs in the browser.

FBXLoader can load an FBX file.

FBXLoader can load skin.

FBXLoader can load bones.

FBXLoader can load animation clips.

Code can play the clips with AnimationMixer.

Mixamo dance files are a common test.

Those files play well in Three.js.

So basic import is real.

### Limits of FBXLoader

The file must be new enough.

ASCII FBX must be version 7000 or up.

Binary FBX must be version 6400 or up.

Old files can load with errors.

Old files can also fail.

FBX has many versions.

FBX has a text form and a binary form.

This makes a full parser hard.

Three.js staff say FBX support is a bit limited.

FBXLoader gives Phong materials only.

PBR data from Maya will not come in full.

Morph normal data has gaps.

The big limit is tangents.

FBX stores each key with a tangent type.

FBX stores in and out slopes.

FBXLoader turns curves into plain key tracks.

Three.js tracks have no Maya tangent types.

So the app can play the motion.

The app can not get the true tangent data back from FBXLoader.

Import is good for play and for pose.

Import is weak for fine curve edit work.

### Fix for the Tangent Limit

The app will keep its own project file.

The project file is JSON.

The project file is the source of truth.

Each channel in JSON holds its keys.

Each key holds a frame and a value.

Each key holds a tangent type.

Each key holds in and out slopes.

We never ask FBX to store our edit data.

We use FBX only as a door to Maya.

## Part 2 — Send Work to Maya

Three.js has GLTFExporter.

Three.js has OBJExporter.

Three.js has no FBXExporter.

A Three.js lead said this in the forum.

He said FBX is complex.

He said FBX has no real open spec.

So we must pick a bridge.

### Route A — GLB File and Then Convert

The app can export a GLB file in the browser.

GLB is the binary form of glTF.

glTF is an open spec from Khronos.

glTF animation has three modes.

The modes are LINEAR, STEP, and CUBICSPLINE.

CUBICSPLINE stores an in tangent per key.

CUBICSPLINE stores an out tangent per key.

So the GLB file can hold tangent data.

But Maya can not open GLB files on its own.

Maya needs a paid plug-in for GLB import.

SimLab sells one such plug-in.

Free plug-ins also exist.

Each teacher PC would need the plug-in.

That is bad for kids.

That is bad for a class.

A tool on the PC can convert GLB to FBX.

Blender can do that job.

FBX2glTF goes the wrong way for us.

It makes GLB from FBX.

It does not make FBX from GLB.

Verdict: GLB alone is not the full route.

GLB is a good first leg of the route.

### Route B — Server Conversion

A server can run Blender with no screen.

The command is `blender --background --python script.py`.

Blender is free.

Blender can import GLB files.

Blender can export FBX files.

The export call is `bpy.ops.export_scene.fbx`.

That call has bake settings.

It has a bake step setting.

It has a simplify setting.

It has an add leaf bones setting.

We will turn leaf bones off.

Leaf bones add fake end bones.

Fake end bones change joint names.

We will set simplify to zero.

Zero simplify keeps the motion shape.

Cost is one small server.

Cost is a few seconds of wait per file.

The kid sees one button.

The kid sees a progress bar.

The kid gets one FBX file.

No plug-in is needed on any PC.

Maya opens the FBX file in the normal way.

### Route B2 — Server With the FBX SDK

Autodesk gives a free FBX SDK.

The SDK can read animation curves.

The SDK can write animation curves.

It works with FbxAnimCurve data.

That data is the same type Maya uses.

So this route can keep tangent modes.

It can keep weighted tangents too.

But the SDK is C++ work.

Python binds for the SDK are hard to set up.

Version match is a pain.

Build cost is high.

Risk is high.

Verdict: best data, worst cost.

Save this route for a later version.

### Route C — Write FBX ASCII by Hand

FBX has a text form.

A text form looks easy to write.

But FBX has no full open spec.

Node IDs must link in exact ways.

Curve nodes must link to the right nodes.

Maya is strict with bad files.

One bad link can kill the file.

We would own all bugs in that writer.

Verdict: no for Version 1.

Use it only as a last resort test.

### Route D — Assimp in the Browser

Assimp is a free convert lib.

Assimp can run in the browser as Wasm.

The Threepipe project shows FBX export this way.

But Assimp lists its FBX export as experimental.

Old Assimp docs list FBX export in part only.

Animation quality is not proven.

Tangent quality is not proven.

Verdict: real, but not safe for Version 1.

Watch it.

Do not build on it yet.

### Route E — USD

Maya now works with USD.

But Three.js has no good USD exporter.

So USD is not a Version 1 route.

## Part 3 — What Survives Each Step

This part is the honest part.

### Joint Names

Joint names survive Route B well.

GLB stores node names.

Blender keeps node names.

FBX stores node names.

Maya reads the same names back.

Risk one is name clash.

Blender adds a suffix on a clash.

Our app must use one name per joint.

Risk two is leaf bones.

We turn leaf bones off.

Then no fake names appear.

### Keys and Times

Key times survive Route B well.

GLB stores key times in seconds.

Our JSON stores keys in frames.

The server uses the JSON keys.

The server places keys at the same frames.

Motion shape survives well.

### Tangents — Where They Will Not Survive

Read this part with care.

Maya has many tangent types.

Maya types are spline, clamped, linear, stepped, flat, and fixed.

Maya also has weighted tangents.

glTF has just three modes.

The modes are LINEAR, STEP, and CUBICSPLINE.

So Maya types must map down.

Clamped has no glTF twin.

Fixed has no glTF twin.

Weighted has no glTF twin.

CUBICSPLINE can hold a slope pair per key.

That pair is close to a spline tangent.

It is not the same as a Maya tangent.

Next, Blender maps glTF curves to Bezier curves.

That map is close, not exact.

Next, Blender FBX export can bake the curves.

Bake step 1.0 means a key on each frame.

Bake turns few keys into many keys.

Many keys keep the motion shape.

Many keys lose the first edit shape.

In Maya, the curve will look right.

In Maya, the curve will be hard to edit.

The teacher gets true motion.

The teacher does not get our few clean keys back.

That is the true cost of Route B.

### The JSON Sidecar Fix

Our app sends JSON with the GLB file.

JSON holds our exact keys.

JSON holds our exact tangent types.

JSON holds our exact slopes.

The server script reads the JSON first.

The script builds curves from the JSON.

The script uses GLB for mesh and skin only.

This keeps our keys exact up to Blender.

Loss starts at the Blender FBX bake step.

Loss does not start in our app.

If we later pay for Route B2, loss can drop more.

The FBX SDK writes curve data in Maya form.

That is the only route with near full tangent keep.

## Part 4 — Recommendation

### Version 1 Route — Pick This One

Step 1: The kid clicks Send to Maya.

Step 2: The app makes a GLB file in the browser.

Step 3: The app sends the GLB file to our server.

Step 3 also sends the JSON project file.

Step 4: The server runs Blender in background mode.

Step 5: A Python script reads the JSON keys.

Step 6: The script builds the rig and curves in Blender.

Step 7: The script exports an FBX file.

Step 8: The kid downloads the FBX file.

Step 9: The kid opens the file in Maya.

For import, the app uses FBXLoader in the browser.

For bad FBX files, the server can convert them to GLB first.

Why pick this route?

It costs the least.

It needs no plug-in on kid PCs.

It keeps joint names.

It keeps key times.

It keeps motion shape.

The UX is one button and one wait bar.

### Fallback Route — If the Server Is Down

The app gives a plain GLB download.

The teacher opens the GLB file in Blender.

The teacher exports FBX from Blender by hand.

Or the teacher uses a Maya GLB plug-in.

This path is free.

This path has more steps.

This path is for one teacher, not for each kid.

### Not Picked

Hand FBX ASCII is not picked.

Assimp FBX export is not picked.

The FBX SDK route is not picked for Version 1.

Each one has too much risk or cost now.

## Test Plan Before We Build All of It

Test 1: Make a ball rig in Maya.

Test 1: Export FBX from Maya.

Test 1: Load it with FBXLoader.

Pass if the bounce plays true.

Test 2: Make a bounce in our app.

Test 2: Send GLB and JSON to the server.

Test 2: Build FBX with the Blender script.

Test 2: Open the FBX file in Maya.

Pass if joint names match.

Pass if key frames match.

Pass if the bounce height is true.

Test 3: Check the Maya curve.

Write down the key count in Maya.

Write down the tangent type in Maya.

Do not hide the loss.

Put the loss in the test log.

Test 4: Time the full send.

Pass if the wait is under ten seconds.

Kids will not wait more than that.

## Sources

- Three.js forum — no FBXExporter, FBX is complex, no real spec: https://discourse.threejs.org/t/3d-models-interconversions/52290
- Three.js tutorial — FBX animation with FBXLoader and AnimationMixer: https://sbcode.net/threejs/fbx-animation/
- FBXLoader class doc — FBX 7000 ASCII and 6400 binary minimum: https://pub.dev/documentation/three_js_advanced_loaders/latest/fbx_loader/FBXLoader-class.html
- Three.js forum — old FBX 6100 files not fully supported: https://discourse.threejs.org/t/load-fbx-file-with-textures-including-images/2566
- Khronos glTF 2.0 spec — LINEAR, STEP, CUBICSPLINE with in and out tangents: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- Autodesk Maya help — Graph Editor tangent types: http://help.autodesk.com/cloudhelp/2020/ENU/Maya-Animation/files/GUID-43A4FE2C-4863-4EA6-B6AE-6D2B6757F6C7.htm
- Autodesk FBX SDK help — get animation curves from an FBX file: https://help.autodesk.com/cloudhelp/2018/ENU/FBX-Developer-Help/animation/extracting_animation_data.html
- Blender manual — FBX import and export, bake animation settings: https://docs.blender.org/manual/de/4.3/addons/import_export/scene_fbx.html
- Blender Python API — bpy.ops.export_scene.fbx full parameter list: https://upbge.org/docs/latest/api/bpy.ops.export_scene.html
- Blender Python API tips — run Blender without its user interface: https://docs.blender.org/api/dev/info_tips_and_tricks.html
- Autodesk Maya forum — Maya has no native glTF import, plug-ins are the workaround: https://forums.autodesk.com/t5/maya-forum/will-maya-ever-support-glb-gltf-import/m-p/12350854
- SimLab — paid Maya glTF exporter and importer plug-ins: https://www.simlab-soft.com/3d-plugins/gltf-from-maya-main.aspx
- Assimp format support — FBX export listed, quality notes: https://deepwiki.com/assimp/assimp/4-file-format-support
- Threepipe — FBX export in the browser via the Assimp plug-in: https://threepipe.org/guide/exporting-files.html

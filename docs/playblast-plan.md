# Playblast Plan — How a Kid Saves a Movie in the Browser

Date: 2026-10-20
App: ANIMATE, Version 1 (web app)

## Verdict in one line

Use `MediaRecorder` with `canvas.captureStream(0)`.
Ask the browser for MP4 first.
Save WebM if MP4 is not possible.
Do not use ffmpeg.wasm in Version 1.

---

## 1. Which browsers can record MP4?

No browser set is the same.
So the app must never guess.
The app must ask the browser.
The test call is `MediaRecorder.isTypeSupported("video/mp4")`.

### Chrome and Edge

- Chrome added MP4 to MediaRecorder in Chrome 126.
- Edge uses the same engine as Chrome.
- Edge got the same skill at the same time.
- But MP4 needs a video encoder from the computer.
- Some machines do not have that encoder.
- On those machines the test call says no.
- This can happen on some ChromeOS and Linux machines.
- So a school Chromebook must be tested in real life.
- It is not safe to trust the browser name alone.

### Safari

- Safari has recorded MP4 since Safari 14.1.
- The video codec is H.264.
- The audio codec is AAC.
- Apple said this in its own WebKit post.
- Safari is the easy case.
- Ask for MP4 and Safari says yes.
- Safari 18.4 can also record WebM.
- We still pick MP4 first in Safari.

### Firefox

- Firefox can not record MP4.
- Firefox has no MP4 muxer.
- Mozilla staff said this in the Firefox bug list.
- The bug is still open.
- Firefox records WebM only.
- The video codec is VP8 or VP9.

### The rule

Pick the file type in this order:

1. `video/mp4` — if the test call says yes.
2. `video/webm;codecs=vp9` — if the test call says yes.
3. `video/webm;codecs=vp8` — if the test call says yes.
4. `video/webm` — last choice.

---

## 2. Frame-by-frame capture

### The pattern is real

The web standard has this pattern.
The MDN docs show it too.

The steps are:

1. Call `canvas.captureStream(0)`.
2. The zero means no auto frame rate.
3. Draw one frame of the scene.
4. Call `track.requestFrame()`.
5. That call sends the drawn frame to the stream.
6. Do it again for the next frame.

So the app can step the scene one frame at a time.
The scene does not need to play live on screen.

### The honest limit

MediaRecorder stamps each frame with the real clock.
It does not stamp frames with our frame numbers.
This is a known open problem in the W3C group.
A user there tried fast offline capture in 2022.
The output film was choppy.
The film took its timing from the wall clock, not from the frames.

So this claim is false:

> "Step fast, and a slow PC still gets a true 24 fps film."

That is not how MediaRecorder works.

### What this means for Version 1

We pace the capture in real time.
We hold each frame for 1/24 of a second.
Then we call `requestFrame()`.
A 48-frame clip takes 2 seconds to capture.
That wait is fine for a kid.
The progress bar can count frames: 12 of 48, and so on.

### The slow PC risk

If one frame takes too long to draw, timing can slip.
The film can run a bit long or a bit short.
We reduce the risk in three ways:

- Lesson scenes are simple. A ball is cheap to draw.
- The capture size is capped at 1280 by 720.
- We test on a low-end school Chromebook before we ship.

### Test gate for timing

Record the 48-frame test scene on the Chromebook.
The file must report a length near 2.0 seconds.
If the length is wrong, we do not ship Playblast.
We fix timing first.

### The true fix, saved for later

WebCodecs can stamp each frame with an exact time.
The code sets `timestamp` to frame number times 1,000,000, divided by 24.
Then render speed does not change film timing at all.
But WebCodecs needs a muxer library too.
Support is still uneven across browsers.
It is more code to write and test.
It is a Version 2 candidate, not a Version 1 need.

---

## 3. ffmpeg.wasm as a WebM-to-MP4 converter

### The costs

- The core file is big.
- Sources put it at about 25 to 33 MB.
- The first load takes about 5 to 8 seconds on a normal link.
- Later loads can be fast if the file is cached.
- The encode runs in software.
- It can not use the fast video chip in the computer.
- One test took 7.7 seconds to export a 10-second 720p clip.
- Our 48-frame clip is 2 seconds long.
- The encode of our clip may take only about 2 seconds.
- But the load cost comes first, on the first use.
- The fast multi-thread build needs special server headers.
- The headers are `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`.
- A plain static host may not let us set those headers.
- With no headers, it falls back to one thread, and it is slower.

### The gain

The only gain is one thing.
Firefox kids would get an MP4 file, not a WebM file.
Firefox is the small case for a school app.
Most school kids use Chromebooks with Chrome.
Chrome and Safari kids get MP4 with no converter at all.

### Verdict on ffmpeg.wasm

No. Not for Version 1.
We do not make every kid wait for a 30 MB load.
We do not pay that cost to fix one browser case.
If Firefox use turns out to be big, we can add it later.
It can load only when a Firefox user presses Playblast.
That keeps the cost off all other kids.

---

## 4. The Version 1 pipeline — the one we build

1. The kid presses the Playblast button.
2. The app makes a hidden canvas at 1280 by 720.
3. The app asks for a file type, in the order in Part 1.
4. The app opens a `MediaRecorder` on `canvas.captureStream(0)`.
5. The app sets the video bit rate to about 5,000,000 bits per second.
6. The app hides all controls and handles in the capture view.
7. The app steps the scene from frame 1 to the last frame.
8. The app holds each frame for 1/24 of a second.
9. The app calls `requestFrame()` for each frame.
10. The progress bar counts the frames.
11. A Cancel button stops the run and throws the film away.
12. At the end, the app joins the chunks into one Blob.
13. The app saves the Blob as a file download.
14. The file name comes from the scene name.
15. The file end matches the real type: `.mp4` or `.webm`.
16. The Done box shows the file type in plain words.
17. There is no sound track in Version 1.

### The fallback, in plain words

**If the browser can not record MP4, the movie file is a WebM file (`.webm`).**

This is the case in Firefox.
This can also be the case on some Chromebooks.
A WebM file plays in Chrome, Edge, Firefox, and current Safari.
A WebM file may not play in some phone gallery apps.
A WebM file may not play in some old video players.
We never rename a WebM file to `.mp4`.
A false name would break trust and break playback.
The Done box must say: "Your movie is a WebM file."

---

## 5. Test list before ship

Test on each one:

- Chrome on a Windows or Mac PC.
- Chrome on a low-end school Chromebook.
- Safari on a Mac.
- Safari on an iPad.
- Firefox on a PC.

For each test, check three things:

- The file type is the type we said it would be.
- The file length is near 2.0 seconds for the 48-frame scene.
- The file plays from start to end with no freeze.

---

## Sources

- Chrome 126 release notes — MP4 container support for MediaRecorder:
  https://developer.chrome.com/release-notes/126?hl=en
- WebKit blog — MediaRecorder API, Safari records MP4 with H.264 and AAC:
  https://webkit.org/blog/11353/mediarecorder-api/
- MDN — MediaRecorder, and `isTypeSupported()`:
  https://developer.mozilla.org/en-us/docs/web/api/mediarecorder
- MDN — CanvasCaptureMediaStreamTrack and `requestFrame()`:
  https://Developer.Mozilla.org/en-US/docs/Web/API/CanvasCaptureMediaStreamTrack
- W3C — Media Capture from DOM Elements spec, `captureStream(0)` rules:
  https://w3c.github.io/mediacapture-fromelement/
- W3C mail list — open problem: no non-real-time frame-by-frame recording in MediaRecorder:
  https://lists.w3.org/Archives/Public/public-webrtc-logs/2022Jun/0138.html
- Mozilla Bugzilla 1631143 — Firefox: "We don't support an mp4 muxer":
  https://bugzilla.mozilla.org/show_bug.cgi?id=1631143
- TestMu guide — MediaRecorder browser support, codecs, and platform limits:
  https://www.testmuai.com/learning-hub/mediarecorder-browser-support/
- Chromium blink-dev — H.26x MediaRecorder support is limited by platform encoders:
  https://groups.google.com/a/chromium.org/g/blink-dev/c/YJ1QijNiHeM/m/Vq7jttOVAQAJ
- Dev.to — screen recording on every browser, the MIME pick order in real code:
  https://dev.to/alexneamtu/how-we-made-screen-recording-work-on-every-browser-g72
- Shotstack — ffmpeg.wasm: core `.wasm` file is around 30 MB, load it only on use:
  https://shotstack.io/learn/ffmpeg-wasm/
- Bright Coding guide 2026 — ffmpeg.wasm first load 5–8 s, 25 MB re-download if not cached:
  https://www.blog.brightcoding.dev/2026/01/09/build-a-viral-video-editor-in-your-browser-next-js-+-ffmpeg-wasm-complete-guide-2026
- Medium — the 33 MB ffmpeg.wasm core download and software-encode cost:
  https://medium.com/@sharksevenluo/processing-video-in-the-browser-without-ffmpeg-wasm-webcodecs-mediabunny-95s-9s-e1b521c0aea9
- Dev.to — benchmark: ffmpeg.wasm took 7.7 s for a 10 s 720p export; WebCodecs took 2.0 s:
  https://dev.to/whiztools_app/replacing-ffmpegwasm-with-webcodecs-a-1080p-export-from-103s-to-26s-40b8
- MDN — WebCodecs API, `VideoFrame` with an explicit timestamp per frame:
  https://developer.mozilla.org/docs/Web/API/WebCodecs_API

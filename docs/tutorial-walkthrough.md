# ANIMATE Tutorial Walkthrough

## Goal

A new user makes a short bouncing-ball animation in about 10 minutes.
The user learns by doing each step in the app.
The walkthrough does not block the app.
The user can exit at any time.
The user can reopen it with the Tutorial button.

## Main path: First Bounce

1. **Welcome**
   - Text: Make a bouncing ball.
   - Task: Press Next when ready.

2. **Pick the Ball rig**
   - Target: Rig panel.
   - Task: Click `1 Ball`, then click `BUILD RIG`.
   - Done signal: Template 1 is active.

3. **Look around**
   - Target: View buttons.
   - Task: Click Front. Click Side. Click Perspective.
   - Teaching point: Front and Side help judge height and contact.
   - Done signal: The user returns to Perspective.

4. **Pick the Move tool**
   - Target: Move tool.
   - Task: Press W or click Move.
   - Teaching point: Move changes place. Rotate turns. Scale changes size.
   - Done signal: Move is the active tool.

5. **Make the first pose**
   - Target: 3D view.
   - Task: Go to frame 1. Drag the ball up.
   - Teaching point: A pose is the ball position at one frame.
   - Done signal: The playhead is at frame 1 and Move Y is not zero.

6. **Set the first key**
   - Target: Set Key button.
   - Task: Press S or click Set Key.
   - Teaching point: A key saves the pose at that frame.
   - Done signal: Move Y has a key at frame 1.

7. **Make the hit pose**
   - Target: Timeline ruler.
   - Task: Click frame 13. Drag the ball down to the floor. Squash it a little with Scale if ready.
   - Teaching point: The low pose is the contact pose.
   - Done signal: The playhead is at frame 13.

8. **Set the hit key**
   - Target: Set Key button.
   - Task: Press S or click Set Key.
   - Done signal: Move Y has a key at frame 13.

9. **Make the end pose**
   - Target: Timeline ruler.
   - Task: Click frame 24. Drag the ball up and to the side.
   - Done signal: The playhead is at frame 24.

10. **Set the end key and play**
    - Target: Play button.
    - Task: Press S. Press Play.
    - Teaching point: The app fills the frames between keys.
    - Done signal: Playback is running or has run.

11. **Save the work**
    - Target: Save button.
    - Task: Click Save.
    - Teaching point: Save early. Open brings the work back.
    - Done signal: The user clicks Next after saving.

## Next lesson: Tail Control

1. Pick `2 Ball + Tail`.
2. Click BUILD RIG.
3. Click the cyan ring at the tail base.
4. Use Rotate.
5. Pose Tail 1 at frame 1 and set a key.
6. Move to frame 8.
7. Pose Tail 2 and set a key.
8. Move to frame 16.
9. Pose Tail 3 and set a key.
10. Play the shot.

Teaching point: Later keys down the tail make overlap.
Teaching point: Same-way bends make a C shape.
Teaching point: Mixed bends make an S shape.

## Next lesson: Graph Editor

1. Make at least two Move Y keys.
2. Click OPEN GRAPH EDITOR.
3. Click the Move Y name.
4. Click one key dot.
5. Drag the key dot up or down.
6. Try Flat on the low key.
7. Try Auto on the high key.
8. Close the editor and play.

Teaching point: The graph shows height over time.
Teaching point: A steep line means fast motion.
Teaching point: A flat line means slow motion or a hold.

## Teacher notes

- Keep each step to one action.
- Use the words pose, key, contact, and overlap often.
- Let the student fix mistakes with Ctrl+Z.
- Do not start with the Graph Editor.
- Do not start with Maya file transfer.
- End the first session with a saved file or a playblast.

## Version 2 ideas

- Short video clips for each lesson.
- A printable one-page guide.
- A check mark inside the app for each finished task.
- A sample scene button for students who get stuck.
- Separate paths for Ball, Ball + Tail, and Ball + Legs.

# OpenVid Creator Studio

<p align="center">
  <img src="https://www.openvid.dev/openvid.svg" alt="OpenVid logo" width="150" />
</p>

<p align="center">
  A local-first video and image editor for creating polished demos, social videos, device mockups, and animated compositions directly in the browser.
</p>

<p align="center">
  <a href="https://github.com/youyoumu/openvid">Based on the original OpenVid project</a>
  ·
  <a href="https://github.com/RajAgamSinghKalra/openvid-creator-studio">This fork</a>
</p>

This fork expands OpenVid from a screen-recording editor into a more complete, non-linear creator studio. The main workflow can run entirely on `localhost`: source media, projects, previews, and exports stay on your computer, and uploaded originals are never modified.

## What this fork adds

The list below covers the feature-level changes made in this fork.

### Local-first editing and media storage

- Added a fully local editor mode that works without Supabase, hosted authentication, or online media services.
- Development builds and `localhost` use local-only mode automatically; production builds can opt in with `NEXT_PUBLIC_LOCAL_ONLY=true`.
- Added a visible **Local only** state in the editor so it is clear when no hosted backend is being used.
- Removed the old 500 MB upload rejection from the editing path.
- Large videos open immediately through browser object URLs instead of waiting for a full upload or database copy before editing begins.
- Source files remain read-only. Editing, proxy creation, and export never overwrite the original videos.
- Added a local video library for using multiple source files in one project.
- Added ordered multi-file import from the picker or drag and drop, appending every selected clip directly to one timeline as a single undoable edit.
- Persisted project media, uploaded audio, recorded media, images, and background videos in browser storage where required.
- Added local fallbacks for features that previously expected cloud authentication or online photo providers.

### Video clips and backgrounds

- Added a multi-clip video track instead of limiting the editor to one source video.
- Added video backgrounds alongside wallpapers, uploaded images, solid colors, and gradients.
- Background videos can loop for the entire composition.
- Added a local background-video library with recent uploads and browser persistence.
- Added independent background-video position and scale controls.
- Added direct canvas manipulation for foreground video: drag it to reposition it and grab its handles to resize it.
- Added video rotation, translation, and scale transforms.
- Applied the existing padding, rounded-corner, shadow, blur, crop, mask, and framing workflow consistently to video-based compositions.
- Improved landscape and portrait source fitting so vertical media can be placed cleanly inside wider frames.

### Frame and aspect-ratio controls

- Added whole-frame `16:9` and `9:16` controls throughout normal, 2D mockup, and 3D mockup workflows.
- Kept the composition/export ratio independent from the selected phone or device frame.
- Fixed 2D mockups stretching or scaling incorrectly when the whole canvas changes between landscape and portrait.
- Added `1:1`, `4:3`, `3:4`, automatic, and custom output dimensions in addition to `16:9` and `9:16`.
- Preserved independent background, media, and mockup transforms when the frame ratio changes.

### Text and canvas elements

- Added timeline-aware text layers that appear only during their configured start time and duration.
- Added drag, select, move, and resize handles for text boxes directly on the canvas.
- Added editable text-box width and height instead of treating text as a fixed label.
- Added font family, size, weight, italic style, color, alignment, line height, and letter spacing controls.
- Added uppercase/lowercase text transformation.
- Added text backgrounds with color, opacity, padding, and corner radius.
- Added text outline/stroke and drop-shadow controls.
- Added title, heading, subheading, body, and caption presets.
- Added ready-made templates including Clean title, Lower third, Subtitle, Neon glow, Impact, Minimal, Typewriter, and Social pop.
- Added text animations: fade, slide from four directions, scale, pop, and typewriter.
- Added animation duration, delay, and intensity controls.
- Added a practical local font set including Inter, Roboto, Poppins, Montserrat, DM Sans, Arial, Georgia, Times New Roman, Trebuchet MS, Verdana, Courier New, and Impact.
- Added canvas-element timeline clips with start/end trimming.
- Rendered text and element styling consistently in both preview and final export.
- Improved canvas element selection, layering, locking, visibility, grouping, duplication, and deletion workflows.

### Timeline and clip editing

- Made the timeline scrubbable even when the project has no video or other content yet.
- Added a vertically resizable timeline so text, mockup, zoom, audio, and element tracks remain accessible.
- Added dedicated timeline rows for video clips, zoom effects, mockups, and canvas elements.
- Added draggable/clickable zoom focal points so a zoom can center on different areas of the frame while keeping center zoom as the default.
- Bounded zoom focal points and movement paths so preview and export never reveal empty space beyond the composition edges.
- Stopped new clips and restored local media from automatically creating two unrequested zoom effects.
- Added visible text-layer clips to the timeline.
- Fixed text and mockups being visible outside their timeline ranges.
- Added clip splitting/cutting at the playhead.
- Added per-clip speed controls from `0.25x` to `4x`.
- Updated clip duration and downstream timeline placement when playback speed changes.
- Added trim handles that respect each clip's playback rate.
- Added multi-clip source switching during playback, scrubbing, and export.
- Extended `Ctrl+Z` / `Ctrl+Y` undo and redo to clip operations, including cuts, trims, movement, and speed changes.
- Improved playhead, seeking, clip boundary, and empty-project duration behavior.
- Improved scrub thumbnail generation for long and multi-clip timelines.

### 2D device mockups

- Made 2D mockups movable anywhere inside the composition.
- Added edge and corner handles for resizing 2D mockups visually.
- Kept device scale independent from the whole-frame aspect ratio.
- Added independent 2D mockup position, rotation, and scale.
- Preserved dark/light frame styles, frame colors, header scale, and header opacity controls.
- Added a device status-bar toggle for phone mockups, hiding the simulated time, signal, Wi-Fi, and battery without shifting the framed media.
- Improved portrait-video fitting inside phone frames.
- Made 2D mockup behavior consistent between preview and export.

### 3D device mockups and animation

- Expanded 3D device options for phones, dual-phone layouts, laptops, and tablets.
- Added drag and resize interaction for 3D mockups in the composition.
- Added editable 3D position, scale, perspective, and X/Y/Z rotation.
- Added intro presets: fade, slide up/down/left/right, scale, and pop.
- Added continuous motion presets: turntable, float, orbit, showcase, and wobble.
- Added animation duration, delay, intensity, motion speed, and looping controls.
- Added timeline keyframes for X/Y position, scale, and X/Y/Z rotation.
- Added linear, ease-in-out, and ease-out keyframe interpolation.
- Added a mockup timeline track for timing and editing animations like other video-editor layers.
- Added controls for auto-rotation, rotation speed, glow, and 3D environment.
- Kept 3D mockup timing and transforms synchronized during play, scrub, project restore, and export.
- Improved full-resolution 3D capture and state restoration after export.

### Local project save and restore

- Added named local video projects with **Save**, **Load**, **Delete**, and **New project** workflows.
- Added project thumbnails and last-updated ordering in the local project browser.
- Added automatic restoration of the last active local project.
- Added autosave for an existing project after editor changes.
- Saved the current playhead position and complete editor state.
- Restored clips, trims, speed changes, backgrounds, frame settings, media transforms, zooms, masks, mockups, animation/keyframes, text/elements, audio, and volume settings.
- Persisted referenced video and audio assets so a saved project can reopen after closing the tab or browser.
- Kept shared source media when deleting only a project.
- Stored projects locally with IndexedDB and remembered the current project with local storage.

### Preview quality and smooth playback

- Added **Auto**, **Full**, **1/2**, and **1/4** preview-quality modes.
- Made half- and quarter-resolution preview modes affect both the normal 2D canvas and the 3D renderer.
- Added an adaptive Auto mode: full quality while paused, half quality during playback, and quarter quality while scrubbing.
- Kept the export canvas separate from preview resolution so lower preview quality never lowers final output quality.
- Added decoded-frame scheduling with `requestVideoFrameCallback` where supported.
- Coalesced rapid scrub seeks to avoid decoding work for obsolete playhead positions.
- Reduced unnecessary audio micro-seeks while maintaining clip synchronization.
- Prioritized playback frames over lower-priority React timeline updates.
- Bounded and batched thumbnail generation for long videos.
- Paused background thumbnail generation during playback and deferred work to browser idle time where possible.
- Changed paused 3D scenes to render on demand while retaining continuous rendering for playback and active motion.
- Added adaptive 3D pixel density for Full, 1/2, 1/4, and Auto preview modes.
- Reduced preview jitter around clip transitions and exact seeks.

### Temporary editing proxies

- Added one-click creation of temporary editing proxies for smoother playback on high-resolution or difficult source files.
- Added browser-side WebCodecs transcoding with hardware acceleration when available.
- Proxy media is limited to a 960-pixel long edge, 30 fps, and frequent keyframes for responsive seeking.
- Added MP4/AVC/AAC output with WebM/VP9/Opus fallback based on browser encoder support.
- Added proxy progress, ready, error/retry, and removal states.
- Added a **Cancel** action that stops an in-progress proxy conversion and removes partial results.
- Kept proxies in memory only: they are not written into projects or IndexedDB.
- Revoked temporary proxy URLs when proxies are removed, the page unloads, or the editor is closed.
- Automatically switched back to original media for export and restored proxy playback afterward.

### Export and render reliability

- Added export support for multi-clip timelines and clip-specific playback rates.
- Added per-clip original-audio handling alongside uploaded audio tracks.
- Kept masks, crops, backgrounds, text, mockups, transforms, and animations in the rendered result.
- Ensured exports always use original full-resolution source media rather than proxies or reduced preview canvases.
- Improved seek-aware frame waiting to prevent stale decoded frames from appearing in exports.
- Fixed common flicker, jitter, and frame-repetition issues during browser rendering.
- Improved output stability for 2D and animated 3D mockups.
- Preserved the selected whole-frame aspect ratio and custom dimensions in export.
- Made every video quality preset ratio-aware: for example, 1080p exports as `1920 × 1080` in 16:9 and `1080 × 1920` in 9:16.
- Added frame-ratio controls, including custom width-to-height ratios, directly inside the export menu.
- Made export resolution labels update live to show the actual output dimensions for the selected frame ratio.
- Retained MP4, transparent WebM, GIF, and image export workflows.
- Retained output presets from 480p through 4K (`3840 × 2160`).
- Kept local exports independent from cloud services and left all original media untouched.

## Core editor features

In addition to the fork changes above, OpenVid Creator Studio retains the original OpenVid editing workflow:

- Screen recording and local file upload
- Wallpaper, image, color, and gradient backgrounds
- Zoom effects with configurable focus points and duration
- Crop and mask controls
- Video and image positioning, rotation, sizing, padding, corners, and shadows
- SVG, shape, image, and text elements
- Layer ordering, visibility, locking, grouping, and multi-selection
- Uploaded audio tracks, original-audio controls, and master volume
- Animated 2D and 3D device frames
- MP4, WebM, GIF, and still-image export

## Local quick start

### Requirements

- Node.js 20 or newer
- npm
- A current Chromium-based browser is recommended for the smoothest preview and WebCodecs proxy support

### Run the local-only editor

```bash
git clone https://github.com/RajAgamSinghKalra/openvid-creator-studio.git
cd openvid-creator-studio
npm install
```

Copy the environment template:

```powershell
Copy-Item .env.example .env.local
```

The template already contains:

```env
NEXT_PUBLIC_LOCAL_ONLY=true
```

Start the editor:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To use the port shown in the development screenshots instead:

```bash
npm run dev -- --port 4009
```

Then open [http://localhost:4009/en/editor](http://localhost:4009/en/editor).

No Supabase credentials are required for the local-only workflow. Online photo-provider keys are optional and are not needed for local uploads, editing, project save/load, proxies, or export.

## Local data behavior

| Data | Storage | Lifetime |
|---|---|---|
| Saved projects and editor state | Browser IndexedDB | Until the project/site data is deleted |
| Referenced source video and audio | Browser IndexedDB/local media library | Until the media/site data is deleted |
| Current project selection | Browser local storage | Until site data is cleared |
| Editing proxies | In-memory Blob URLs | Current editor session only |
| Exported files | Your chosen download location | Managed by you |

Browser storage belongs to the browser profile and origin that created it. Clearing site data, switching browsers, or changing the local origin/port can make saved projects unavailable, so keep original media and exported deliverables backed up normally.

## Technology

- Next.js 16 and React 19
- TypeScript
- Tailwind CSS 4
- HTML Canvas
- Three.js and React Three Fiber
- Framer Motion and GSAP
- MediaBunny and WebCodecs
- FFmpeg.wasm
- IndexedDB and local storage
- Supabase support inherited from upstream for non-local deployments

## Verification

```bash
npm run lint
npm run build
```

## Credits

OpenVid Creator Studio is a fork of [OpenVid](https://github.com/youyoumu/openvid), originally created by [@youyoumu](https://github.com/youyoumu). The upstream project and contributors provided the foundation for the recorder, editor, mockups, and export workflow expanded here.

See the upstream [contribution guide](https://github.com/youyoumu/openvid/blob/main/CONTRIBUTING.md), [security policy](https://github.com/youyoumu/openvid/blob/main/SECURITY.md), and [community links](https://github.com/youyoumu/openvid#community) for the original project.

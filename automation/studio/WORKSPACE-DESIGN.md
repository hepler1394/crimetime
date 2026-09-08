# Production desk

## Full release workspace reference lock

Reopened the Descript editing canvas and ChatGPT document/conversation split
before the 20-upgrade build. Preserve the existing CrimeTime type pairing,
black/red/yellow roles and 8/12/20/32/48 spacing scale. Use a project switcher
above navigation, one broad editing surface, contextual controls beside it and
a timeline below audio. Put stage readiness in a compact actionable list.
Keep assistant changes beside the material being edited. No decorative motion.
Approved Canva artwork remains the default source for covers and social slides.

## September 8 production upgrades

Re-inspected the Descript editor and ChatGPT split-document references before
building the provider/settings and script/chat surfaces. Continue the existing
Bebas Neue, Segoe UI and IBM Plex Mono pairing, black/red/yellow palette, 8/12/20/
32/48px spacing and restrained motion. Long script reading uses Georgia with a
larger line height. Settings use a provider list and one editing surface; chat
uses an episode conversation with a narrower production control panel.

Reviewed the real Electron script editor, production conversation and provider
settings views with temporary test content. Fixed an async button that remained
disabled, refreshed readiness after script saves, preserved unsaved work before
reload/replacement and removed the irrelevant default-chat checkbox for speech
providers. Provider settings screenshots encountered an intermittent Electron
capture timeout; the follow-up capture rendered correctly and was reviewed.

Validation: 54 Studio checks, 9 existing shell/audio checks, 4 new provider/model
checks and 1 new Electron production workflow pass (68 total). The new workflow
checks actual script persistence/revisions, stale-save rejection, review-before-
save proposals, job payloads, key-field clearing and voice selection. Paid model,
speech and media output are mocked in these tests. Live read-only connection
checks succeeded for ElevenLabs and Deepgram; no selected ElevenLabs voice was
available, so the user must choose one through settings. No paid generation,
episode publishing or public deployment was performed.

References inspected: Descript editor (Refero a04993d5-ba8b-4f1c-a5b1-3517491c8fca) and ChatGPT document/chat split (61c3085f-c45f-4fb0-bf90-d4d54bb3e945).

Keep CrimeTime's Bebas Neue display face, readable Segoe UI body, and IBM Plex Mono metadata. Black #080809 canvas, #121214 working surfaces, #f7f7f8 text, #b4b4bd secondary text. Red #e50914 is for primary actions and selected navigation; yellow #f4c20d for focus and timeline selection. Spacing: 8, 12, 20, 32, 48px. No decorative motion.

Use a narrow navigation rail and one large task surface. Documents and grounded chat share a selected research folder. Audio editing is non-destructive: trim, gain and fades export a new WAV; originals remain untouched. Image generation and trailer jobs use the existing local pipeline. Jobs, validation failures, empty folders and unsaved edits must be visible. Existing publishing gates remain intact.

## Review and verification

Reviewed Electron screenshots of all four views. Fixed the loaded-audio help text, cached waveform peaks so long recordings are not rescanned on every field edit, and kept the Production desk button from reloading an already open editor. Checked a 1100px viewport for horizontal overflow. Keyboard focus and Escape exit are present; notes save with Ctrl+S, and changing research folders first saves dirty notes.

54 existing Studio checks passed. Nine shell/audio checks passed across the full run and targeted reruns. The real Electron workflow creates a temporary research folder, saves notes and separate documents, uploads a source, exports a four-second WAV and verifies its PCM length, checks chat failure/retry and answer-to-notes saving, and dispatches image/trailer/audiogram requests. Provider replies and media-job requests are mocked in that workflow; no paid generation or real episode render was run. Temporary projects and Electron profiles are removed afterward.

Opening the user's normal Electron window was rejected by automatic approval review with "blocked by policy". The source is updated; the normal app has not been launched with these changes by this session.

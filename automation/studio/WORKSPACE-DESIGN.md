# Production desk

References inspected: Descript editor (Refero a04993d5-ba8b-4f1c-a5b1-3517491c8fca) and ChatGPT document/chat split (61c3085f-c45f-4fb0-bf90-d4d54bb3e945).

Keep CrimeTime's Bebas Neue display face, readable Segoe UI body, and IBM Plex Mono metadata. Black #080809 canvas, #121214 working surfaces, #f7f7f8 text, #b4b4bd secondary text. Red #e50914 is for primary actions and selected navigation; yellow #f4c20d for focus and timeline selection. Spacing: 8, 12, 20, 32, 48px. No decorative motion.

Use a narrow navigation rail and one large task surface. Documents and grounded chat share a selected research folder. Audio editing is non-destructive: trim, gain and fades export a new WAV; originals remain untouched. Image generation and trailer jobs use the existing local pipeline. Jobs, validation failures, empty folders and unsaved edits must be visible. Existing publishing gates remain intact.

## Review and verification

Reviewed Electron screenshots of all four views. Fixed the loaded-audio help text, cached waveform peaks so long recordings are not rescanned on every field edit, and kept the Production desk button from reloading an already open editor. Checked a 1100px viewport for horizontal overflow. Keyboard focus and Escape exit are present; notes save with Ctrl+S, and changing research folders first saves dirty notes.

54 existing Studio checks passed. Nine shell/audio checks passed across the full run and targeted reruns. The real Electron workflow creates a temporary research folder, saves notes and separate documents, uploads a source, exports a four-second WAV and verifies its PCM length, checks chat failure/retry and answer-to-notes saving, and dispatches image/trailer/audiogram requests. Provider replies and media-job requests are mocked in that workflow; no paid generation or real episode render was run. Temporary projects and Electron profiles are removed afterward.

Opening the user's normal Electron window was rejected by automatic approval review with "blocked by policy". The source is updated; the normal app has not been launched with these changes by this session.

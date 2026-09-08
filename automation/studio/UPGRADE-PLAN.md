# CrimeTime Studio: next 20 upgrades

Status: planned, not implemented by this document.

Goal: complete a podcast episode and its Instagram campaign inside the existing
CrimeTime Studio Electron app. This builds on the production desk, provider
settings, script revisions, audio trim/export, documents and production chat
already added. It does not create another application.

Use Cory's own Canva covers and approved artwork for CrimeTimeSnacks. Preserve
original recordings and source files. Keep external publishing as an explicit
reviewed action. Serialize Gemini episode drafting. Coordinate with Claude
before editing shared episode, social-template or publishing code.

## Foundation and workspace

1. **One project for the whole release.** Link the episode, research folder,
   scripts, recordings, artwork, trailer and Instagram posts through one project
   record. Switching projects updates every tool's destination together.
   Acceptance: an asset saved from any tool appears under the same project, and
   every generation control names its destination before it runs.

2. **A guided production checklist.** Present Research, Script, Record, Edit,
   Artwork, Social and Release as stages with prerequisites and next actions.
   Acceptance: readiness comes from actual files and checks, and a missing
   prerequisite opens the tool that resolves it.

3. **A durable production queue.** Persist jobs, logs, progress and results to
   disk; detect interrupted work and support safe retry. Serialize episode
   drafting and prevent jobs from colliding on the same media.
   Acceptance: restarting Studio retains completed outputs and clearly labels
   interrupted jobs without automatically repeating a paid request.

4. **Protected credentials and useful connection diagnostics.** Move newly
   stored keys to an OS-protected store, migrate existing keys without exposing
   them, and distinguish invalid credentials, unavailable models, missing voice
   selection and exhausted credits.
   Acceptance: secrets stay out of renderer responses and logs; connection errors
   identify a concrete fix, and removing a key has an explicit outcome.

5. **A model and voice catalog.** Retrieve available models and voices where
   supported, retain manual IDs, and let Cory choose defaults for writing,
   checking, production chat, images and narration independently.
   Acceptance: unavailable selections are explained, and a fallback never
   silently changes provider or spends on a different service.

## Writing and assistant

6. **Streaming production conversations.** Add streaming text, Stop, retry,
   separate saved conversations, editable titles and a visible context selector.
   Acceptance: partial output is labeled incomplete and can never replace a
   script automatically; failed requests retain the question.

7. **Reliable chat actions.** Give the assistant typed actions for creating
   drafts, proposing edits, selecting assets and starting production jobs. Show
   the target, proposed change and result in the conversation.
   Acceptance: edits have a preview and recovery path; unsupported commands and
   arbitrary shell execution are unavailable; publishing remains separate.

8. **A full chapter editor.** Add a chapter outline, drag reordering, word and
   duration targets per chapter, search/replace, autosaved recovery drafts and
   selected-passage AI edits with a before/after comparison.
   Acceptance: a targeted rewrite cannot replace unrelated chapters; recovery
   survives a window close; restoring a revision remains reviewable.

9. **Research tied to claims.** Attach source links, quotations and verification
   notes to script passages and carousel claims. Carry unresolved claims into
   the release checklist.
   Acceptance: an edited claim loses its previous verified status, and each
   approved factual claim can be traced to its source material.

10. **A recording and teleprompter workspace.** Combine adjustable text size,
    scroll speed, microphone selection, input meters, countdown, recording and
    named takes with the current script.
    Acceptance: recording shows elapsed time and device state, saves a usable
    take on completion, and recovers gracefully from microphone loss.

## Audio production

11. **A multitrack timeline.** Arrange narration, intro/outro music, archival
    audio and effects on separate tracks with volume, mute, solo, fades and
    music ducking.
    Acceptance: the mix can be reproduced from a saved project without changing
    any source recording.

12. **Precise waveform editing.** Add zoom, playhead scrubbing, range selection,
    split, remove, move and undo/redo to the current trim editor.
    Acceptance: edits are reversible, keyboard accessible, and export timing
    matches the selected timeline at sample boundaries.

13. **Audio cleanup with an A/B preview.** Offer noise reduction, silence
    handling, EQ, compression, de-essing and loudness mastering with bypass and
    measured output levels.
    Acceptance: Cory can hear a short before/after preview, originals remain
    available, and loudness/clipping results come from measurements.

14. **An ElevenLabs voice booth.** Select and remember Cory's voice, audition
    a short passage, adjust supported voice controls, generate chapter by
    chapter and retry only failed sections.
    Acceptance: show character count and the selected voice before generation;
    retain reusable results so a failed later section does not require paying
    to regenerate earlier sections.

15. **An editable Deepgram transcript.** Show words and speakers with timestamps,
    click-to-seek playback, corrections and caption export. Keep transcript
    alignment synchronized with edits to the timeline.
    Acceptance: exported captions match playback; stale alignment is labeled
    after an audio edit instead of appearing ready.

## Instagram, assets and release

16. **A reusable CrimeTime brand kit.** Import Cory's Canva covers, logos, fonts
    and approved artwork; save templates with safe crop areas for covers,
    portrait posts, stories and reels.
    Acceptance: original artwork is preserved, and no generated background
    replaces an approved CrimeTimeSnacks cover automatically.

17. **A visual carousel composer.** Add slide reordering, text and image editing,
    live portrait previews, overflow detection and saved template variants.
    Acceptance: slide order matches export, text remains inside safe bounds,
    and destination account and caption are visible throughout review.

18. **A trailer storyboard.** Choose the cold open, exact audio excerpts,
    approved footage or stills, captions, music and end card before rendering.
    Preview short sections before committing to the full export.
    Acceptance: every scene has a visible duration and source; portrait and
    landscape variants retain readable captions and deliberate framing.

19. **A searchable media and document library.** Add folders, tags, thumbnails,
    source/rights notes, duplicate detection, asset versions and links to where
    each file is used in the project.
    Acceptance: a search finds both uploaded and generated assets; replacing an
    asset preserves its previous version and identifies affected outputs.

20. **A release desk and export package.** Assemble episode audio, cover,
    transcript, show notes, captions, carousels and trailers in one review.
    Validate duration, audio levels, dimensions, facts, account and required
    files, then export a package or use the existing reviewed publishing flow.
    Acceptance: validation opens the exact problem, export includes a manifest,
    and no incomplete package is represented as published.

## Build order and verification

Start with 1, 3, 4 and 8: shared project identity, durable jobs, credential
storage and script recovery protect everything built afterward. Then complete
2, 5, 6, 7, 9 and 10 for the writing/recording workflow. Build 11–15 as the
audio production layer, followed by 16–20 for campaign creation and release.

For each slice, deliver working behavior, applicable API/unit checks and a real
Electron flow. Review visual changes against the existing design constraints
and anti-ai-slop acceptance bar, including constrained window sizes and keyboard
use. Verify with temporary projects; label mocked provider responses clearly.

The final acceptance exercise is one temporary project: import approved artwork
and research, write and revise a script, record or generate narration, edit and
transcribe it, assemble a trailer and carousel, restart during queued work,
recover the project, and export a complete review package. External publishing
is tested only when Cory explicitly authorizes that release.

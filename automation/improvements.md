# The 1000 — CrimeTimeSnacks Improvement Ledger

Every entry is one reviewable change or one authored content unit, numbered and
auditable. Counting rules: a template/code change counts ONCE (even when it
upgrades every page); unique content units (a topic, a quiz question, a merch
design, an icon) count individually. Auto-published drops append themselves
with an [auto] tag — the counter on Mission Control reads this file.

## Batch 0 · The 2026 Relaunch (2026-07-15)


## Design System

1. Rebuilt css/style.css as a token-driven design system (colors, radii, shadows, motion curves)
2. Cinematic atmosphere layer: drifting smoke plumes (pure CSS, GPU-friendly)
3. Film grain overlay (inline SVG noise, animated)
4. Fixed red ember-glow backdrop replacing flat black
5. Bebas Neue display typeface for headlines
6. Inter body typeface replacing Roboto
7. Fluid type scale with clamp() on every heading
8. Glassmorphism sticky header with blur + saturation
9. Razor-thin red gradient edge under the header
10. Scroll-aware header (compresses + deepens shadow after 24px)
11. Logo lockup: cover art thumbnail + wordmark + tagline in the header
12. Red underline sweep animation on nav links
13. Nav active-state treatment
14. Full-screen mobile overlay menu with blur
15. Rotating red headline word (Snack-Sized / Examined / Unfiltered / Obsessive)
16. Count-up hero stats (cases, episodes, rating, cadence)
17. Platform pill row (Apple / Spotify / YouTube / RSS) with brand hover colors
18. Refined caution-tape divider: angled, bordered, Bebas type, slow marquee
19. Reverse-angle tape variant for rhythm
20. Case-file section headers (FILE 01 chip + display title + hairline rule)
21. Giant outlined background words with scroll parallax
22. Episode/blog/merch cards: gradient panels, hairline borders, hover lift + red glow
23. 3D tilt on cards following the cursor
24. Image zoom + saturation on card hover
25. LATEST DROP corner ribbon on the episode spotlight
26. Two-column episode spotlight with cinematic image fade
27. Custom audio player skin: red play orb, glowing progress rail, seek handle
28. 15s/30s skip buttons on every player
29. Playback speed cycling on every player
30. Keyboard-seekable player rail (arrow keys + space)
31. Listener-proof marquee strip (pause on hover)
32. Newsletter block rebranded as The Case File with a named hook
33. Mega footer: watermark wordmark, 4 columns, crisis-resources line
34. Footer social tiles with hover lift
35. Suggest a Case mailto in the footer
36. Custom red-gradient scrollbar
37. Button shine-sweep animation + pressed states
38. Focus-visible outlines on all interactive elements
39. prefers-reduced-motion support across every animation
40. Print stylesheet (clean article printing)
41. Scroll-reveal system with stagger delays
42. Bulletproof reveal failsafe (sweep + 2.5s total-reveal guarantee)

## Pages

43. index.html rebuilt (hero, marquee, categories, spotlight, live teaser, quiz teaser, newsletter)
44. episodes.html rebuilt as The Case Files
45. Six episode detail pages rebuilt with prev/next + related cases
46. blog.html rebuilt with featured spotlight + reading times
47. Eight blog post pages rebuilt with related-posts rail
48. videos.html rebuilt (shorts-first with filter)
49. merch.html rebuilt with Logo Collection hero
50. about.html rebuilt (mission, host, FAQ grid)
51. contact.html rebuilt with working mailto form
52. listen.html rebuilt as platform picker
53. 404 rebuilt as Cold Case page
54. live.html NEW: FBI live case board (filters, search, auto-refresh, disclaimers)
55. quiz.html NEW: interactive quiz engine (scoring, explanations, share result)
56. dashboard.html NEW: Mission Control (vitals, schedule, queue, commands)
57. offline-safe editor.html redirect to Mission Control

## Automation

58. automation/shell.mjs NEW: single shared header/footer/head for every generator
59. build-episodes.mjs rebuilt on the shared shell
60. build-blog.mjs rebuilt on the shared shell
61. build-videos.mjs rebuilt on the shared shell
62. build-merch.mjs rebuilt on the shared shell
63. build-quiz.mjs NEW: quiz page generator
64. build-status.mjs NEW: bakes status.json for Mission Control
65. import-fbi.mjs NEW: FBI Wanted API importer (150 cases baked)
66. curl fallback in the FBI importer (beats Akamai TLS fingerprinting)
67. gen-quiz.mjs NEW: AI quiz writer in Cory's voice
68. voice.md NEW: the Cory voice profile driving every AI word
69. ai-write.mjs now loads the voice profile
70. weekly-update.mjs upgraded: FBI + quiz steps, twice-weekly framing
71. build-all.mjs runs quiz + status builders
72. normalize-shell.mjs rewritten for the 2026 header
73. Homepage HOME-STATS auto-fill region (episode count stays true forever)

## Schedule & Deploy

74. Windows task: CTS Content Tue 9:00 AM
75. Windows task: CTS Content Fri 9:00 AM
76. Windows task: CTS Feed Sync daily 8:00 AM
77. Removed stale weekly/daily tasks
78. GitHub Actions: content workflow rescheduled Tue+Fri
79. GitHub Actions: NEW 6-hour feed+FBI sync workflow
80. Deployed relaunch to production (main → Vercel)

## Merch

81. Logo tee print (print-ready PNG, red frame + wordmark bar)
82. Die-cut logo sticker file (white border, rounded)
83. Cover-art poster print file
84. Web-optimized previews for all three (79-387 KB)
85. merch.json collection schema + Logo Collection section

## Security & Hygiene

86. Scrubbed exposed Gemini key from FILE_STRUCTURE.md
87. Scrubbed exposed Brave key from todo.md (2 spots)
88. Rotation warning surfaced on Mission Control

## Content

89. 3 launch quizzes hand-written (Watts, JonBenet, Cold Case IQ)
90. 15 launch quiz questions, each fact-checked
91. Docs rewritten: AUTOMATION.md, NEXT-STEPS.md, cron/README.md
92. package.json scripts: content, fbi, quiz, status

## Batch 1 · Editorial Arsenal

93. Editorial calendar: queued "The Long Island Serial Killer: where the case stands" (investigation)
94. Editorial calendar: queued "The anatomy of a ransom note: what linguists look for" (analysis)
95. Editorial calendar: queued "Luminol and its limits: what crime shows get wrong" (analysis)
96. Editorial calendar: queued "The 911 call: how investigators analyze the first minutes" (investigation)
97. Editorial calendar: queued "False confessions: why innocent people say they did it" (analysis)
98. Editorial calendar: queued "The Golden State Killer arrest, and what changed after" (court)
99. Editorial calendar: queued "DNA phenotyping: building a face from a sample" (analysis)
100. Editorial calendar: queued "Cadaver dogs: how reliable are they really" (analysis)
101. Editorial calendar: queued "The polygraph problem: why it isn't admissible" (analysis)
102. Editorial calendar: queued "Cell tower pings: what location data can and can't prove" (analysis)
103. Editorial calendar: queued "Geofence warrants: the courtroom fight over your phone" (court)
104. Editorial calendar: queued "How the FBI's ViCAP links crimes across state lines" (investigation)
105. Editorial calendar: queued "The first 48 hours: why speed decides cases" (investigation)
106. Editorial calendar: queued "Touch DNA: breakthrough or contamination machine" (analysis)
107. Editorial calendar: queued "Blood spatter analysis on trial" (court)
108. Editorial calendar: queued "Bite mark evidence: the forensic method that fell apart" (analysis)
109. Editorial calendar: queued "The rise and fall of hair microscopy in court" (court)
110. Editorial calendar: queued "How unidentified remains finally get names" (investigation)
111. Editorial calendar: queued "Doe Network and the volunteers who solve cold cases" (investigation)
112. Editorial calendar: queued "What a medical examiner actually does" (analysis)
113. Editorial calendar: queued "Cause, manner, mechanism: reading a death certificate" (analysis)
114. Editorial calendar: queued "Staged crime scenes: the tells investigators look for" (investigation)
115. Editorial calendar: queued "Insurance money as motive: the paper trail" (investigation)
116. Editorial calendar: queued "The missing white woman syndrome problem" (analysis)
117. Editorial calendar: queued "Why some missing persons cases never make the news" (analysis)
118. Editorial calendar: queued "AMBER Alerts: what triggers one and what doesn't" (analysis)
119. Editorial calendar: queued "How NamUs matches the missing with the unidentified" (analysis)
120. Editorial calendar: queued "Serial killers and the long-haul trucking corridor theory" (investigation)
121. Editorial calendar: queued "The highway of tears: decades of unanswered cases" (investigation)
122. Editorial calendar: queued "Profiling: useful tool or courtroom theater" (analysis)
123. Editorial calendar: queued "BTK and the floppy disk that ended a 30-year hunt" (investigation)
124. Editorial calendar: queued "The Unabomber manifesto and forensic linguistics" (analysis)
125. Editorial calendar: queued "Zodiac's ciphers: which were solved and how" (analysis)
126. Editorial calendar: queued "Cold case playing cards in prisons: do they work" (analysis)
127. Editorial calendar: queued "Jailhouse informants: the incentive problem" (court)
128. Editorial calendar: queued "Wrongful convictions: the most common causes" (court)
129. Editorial calendar: queued "The Innocence Project's playbook, case by case" (court)
130. Editorial calendar: queued "Compensation after exoneration: state by state" (court)
131. Editorial calendar: queued "Double jeopardy: what it actually protects" (court)
132. Editorial calendar: queued "Statutes of limitations on murder: the exceptions" (court)
133. Editorial calendar: queued "Extradition: why some suspects never come back" (court)
134. Editorial calendar: queued "Interpol red notices explained" (analysis)
135. Editorial calendar: queued "How fugitives actually get caught decades later" (investigation)
136. Editorial calendar: queued "The US Marshals' 15 Most Wanted vs the FBI's Ten" (analysis)
137. Editorial calendar: queued "What a grand jury really does" (court)
138. Editorial calendar: queued "Plea deals: why most cases never see trial" (court)
139. Editorial calendar: queued "The Alford plea: guilty but not admitting it" (court)
140. Editorial calendar: queued "Competency vs insanity: two different questions" (court)
141. Editorial calendar: queued "The M'Naghten rule: how insanity defenses work" (court)
142. Editorial calendar: queued "Life without parole vs the death penalty: the real numbers" (analysis)
143. Editorial calendar: queued "Parole hearings: what boards actually weigh" (court)
144. Editorial calendar: queued "Victim impact statements: the day the family speaks" (court)
145. Editorial calendar: queued "Son of Sam laws: profiting from crime" (court)
146. Editorial calendar: queued "True crime and ethics: where's the line" (analysis)
147. Editorial calendar: queued "How podcasts have actually helped solve cases" (analysis)
148. Editorial calendar: queued "Websleuths and armchair detectives: help or harm" (analysis)
149. Editorial calendar: queued "The Delphi case: how a phone recording changed everything" (investigation)
150. Editorial calendar: queued "The Idaho four: the timeline that mattered" (investigation)
151. Editorial calendar: queued "The Watts case: what the discovery documents showed" (investigation)
152. Editorial calendar: queued "JonBenet Ramsey: the DNA testing timeline" (investigation)
153. Editorial calendar: queued "The Menendez brothers: three decades of legal turns" (court)
154. Editorial calendar: queued "D.B. Cooper: the hijacking that stays unsolved" (investigation)
155. Editorial calendar: queued "The Somerton Man: solved after 74 years" (investigation)
156. Editorial calendar: queued "The Isdal Woman: Norway's coldest case" (investigation)
157. Editorial calendar: queued "Jack the Ripper: why every 'solution' falls apart" (analysis)
158. Editorial calendar: queued "The Black Dahlia: the file that never closes" (investigation)
159. Editorial calendar: queued "The Boy in the Box: Philadelphia's 65-year mystery" (investigation)
160. Editorial calendar: queued "America's unidentified: 40,000 sets of remains" (analysis)
161. Editorial calendar: queued "The Green River Task Force: 20 years of grind" (investigation)
162. Editorial calendar: queued "The Grim Sleeper and the DNA family search that found him" (investigation)
163. Editorial calendar: queued "Familial DNA searches: the rules state by state" (court)
164. Editorial calendar: queued "The Ramsey ransom note vs the Lindbergh note" (analysis)
165. Editorial calendar: queued "Lindbergh: the trial of the century, re-examined" (court)
166. Editorial calendar: queued "Alcatraz escapees: the evidence either way" (analysis)
167. Editorial calendar: queued "The Gardner Museum heist: the empty frames" (investigation)
168. Editorial calendar: queued "Art theft: why masterpieces are useless to thieves" (analysis)
169. Editorial calendar: queued "Cryptocurrency and modern ransom cases" (analysis)
170. Editorial calendar: queued "Romance scams that turned violent" (investigation)
171. Editorial calendar: queued "Catfishing cases that reached the courts" (court)
172. Editorial calendar: queued "The dark side of true crime tourism" (analysis)
173. Editorial calendar: queued "Murder houses: what happens to the address" (analysis)
174. Editorial calendar: queued "Crime scene cleanup: the industry nobody talks about" (analysis)
175. Editorial calendar: queued "Cold case DNA backlogs: the rape kit problem" (analysis)
176. Editorial calendar: queued "Genetic privacy vs solving murders: the debate" (analysis)
177. Editorial calendar: queued "GEDmatch opt-ins: how the rules changed" (analysis)
178. Editorial calendar: queued "Forensic entomology: what insects tell investigators" (analysis)
179. Editorial calendar: queued "Forensic botany: the seeds that convicted a killer" (analysis)
180. Editorial calendar: queued "Isotope analysis: reading a life from bones" (analysis)
181. Editorial calendar: queued "Facial reconstruction: art meets anatomy" (analysis)
182. Editorial calendar: queued "Age progression images: how they're made" (analysis)
183. Editorial calendar: queued "Handwriting analysis: science or skill" (analysis)
184. Editorial calendar: queued "Ballistics matching under the microscope" (analysis)
185. Editorial calendar: queued "Shaken baby syndrome: the contested diagnosis" (court)
186. Editorial calendar: queued "Arson science: the fires that weren't crimes" (court)
187. Editorial calendar: queued "The Cameron Todd Willingham case" (court)
188. Editorial calendar: queued "What 'reasonable doubt' actually means" (analysis)

## Batch 1 · Quiz Vault

189. New quiz authored: "The Menendez File" (Episode Case)
190.   Question written & fact-checked: The Menendez File Q1 — "Where were Jose and Kitty Menendez killed in August 1989?"
191.   Question written & fact-checked: The Menendez File Q2 — "How did investigators first tie the brothers to a confession?"
192.   Question written & fact-checked: The Menendez File Q3 — "What happened at the brothers' first trials in 1993-94?"
193.   Question written & fact-checked: The Menendez File Q4 — "The 1996 retrial ended with what sentence?"
194.   Question written & fact-checked: The Menendez File Q5 — "Where did the brothers buy the shotguns?"
195. New quiz authored: "Delphi: The Evidence" (Episode Case)
196.   Question written & fact-checked: Delphi: The Evidence Q1 — "What did Libby German capture on her phone that investigators called u"
197.   Question written & fact-checked: Delphi: The Evidence Q2 — "What physical evidence at the scene was linked to Richard Allen?"
198.   Question written & fact-checked: Delphi: The Evidence Q3 — "When was Richard Allen arrested?"
199.   Question written & fact-checked: Delphi: The Evidence Q4 — "Where did Allen work in Delphi?"
200.   Question written & fact-checked: Delphi: The Evidence Q5 — "What was the outcome of Allen's 2024 trial?"
201. New quiz authored: "Infamous & Unsolved" (Cold Cases)
202.   Question written & fact-checked: Infamous & Unsolved Q1 — "D.B. Cooper hijacked a Boeing 727 in 1971 and vanished with how much?"
203.   Question written & fact-checked: Infamous & Unsolved Q2 — "Which Zodiac cipher was finally cracked in 2020?"
204.   Question written & fact-checked: Infamous & Unsolved Q3 — "The Black Dahlia was the press name for which victim?"
205.   Question written & fact-checked: Infamous & Unsolved Q4 — "What was stolen in the 1990 Isabella Stewart Gardner Museum heist?"
206.   Question written & fact-checked: Infamous & Unsolved Q5 — "Jack the Ripper's murders took place in which London district?"
207. New quiz authored: "Forensics 101" (Detective Skills)
208.   Question written & fact-checked: Forensics 101 Q1 — "CODIS, the FBI's DNA system, stands for what?"
209.   Question written & fact-checked: Forensics 101 Q2 — "Which fingerprint pattern is the most common?"
210.   Question written & fact-checked: Forensics 101 Q3 — "Rigor mortis is typically fully developed about how long after death?"
211.   Question written & fact-checked: Forensics 101 Q4 — "Mitochondrial DNA traces which line of inheritance?"
212.   Question written & fact-checked: Forensics 101 Q5 — "'Chain of custody' refers to what?"
213. New quiz authored: "Caught by Technology" (Detective Skills)
214.   Question written & fact-checked: Caught by Technology Q1 — "What finally identified BTK in 2005?"
215.   Question written & fact-checked: Caught by Technology Q2 — "The Golden State Killer was identified in 2018 using what?"
216.   Question written & fact-checked: Caught by Technology Q3 — "The 'Grim Sleeper' case in LA broke open thanks to what technique?"
217.   Question written & fact-checked: Caught by Technology Q4 — "Silk Road founder Ross Ulbricht was arrested in a library because..."
218.   Question written & fact-checked: Caught by Technology Q5 — "Before his arrest, the Golden State Killer was known by which combined"
219. New quiz authored: "True Crime History" (The Archives)
220.   Question written & fact-checked: True Crime History Q1 — "Bruno Hauptmann was convicted in the Lindbergh kidnapping partly throu"
221.   Question written & fact-checked: True Crime History Q2 — "What finally convicted Al Capone in 1931?"
222.   Question written & fact-checked: True Crime History Q3 — "The 1962 Alcatraz escapees left the island on..."
223.   Question written & fact-checked: True Crime History Q4 — "Who saved Leopold and Loeb from the death penalty in 1924?"
224.   Question written & fact-checked: True Crime History Q5 — "H.H. Holmes operated during which Chicago event?"

## Batch 1 · Merch Reserve

225. Merch drop queued: "Allegedly" design (auto-generates on schedule)
226. Merch drop queued: "Exhibit A" design (auto-generates on schedule)
227. Merch drop queued: "Cold Case Energy" design (auto-generates on schedule)
228. Merch drop queued: "Burden Of Proof" design (auto-generates on schedule)
229. Merch drop queued: "Armchair Detective" design (auto-generates on schedule)
230. Merch drop queued: "Due Process" design (auto-generates on schedule)
231. Merch drop queued: "Person Of Interest" design (auto-generates on schedule)
232. Merch drop queued: "Beyond Reasonable Doubt" design (auto-generates on schedule)
233. Merch drop queued: "The Jury's Out" design (auto-generates on schedule)
234. Merch drop queued: "Verdict Pending" design (auto-generates on schedule)
235. Merch drop queued: "Plead The Fifth" design (auto-generates on schedule)
236. Merch drop queued: "Under Oath" design (auto-generates on schedule)
237. Merch drop queued: "Open Investigation" design (auto-generates on schedule)
238. Merch drop queued: "Active Case" design (auto-generates on schedule)
239. Merch drop queued: "Check The Timeline" design (auto-generates on schedule)
240. Merch drop queued: "Follow The Money" design (auto-generates on schedule)
241. Merch drop queued: "Means And Motive" design (auto-generates on schedule)
242. Merch drop queued: "The Details Matter" design (auto-generates on schedule)
243. Merch drop queued: "Read The Affidavit" design (auto-generates on schedule)
244. Merch drop queued: "Paper Trail" design (auto-generates on schedule)
245. Merch drop queued: "Public Record" design (auto-generates on schedule)
246. Merch drop queued: "Snacks And Suspects" design (auto-generates on schedule)
247. Merch drop queued: "Cookies And Cold Cases" design (auto-generates on schedule)
248. Merch drop queued: "Popcorn And Case Files" design (auto-generates on schedule)
249. Merch drop queued: "Court Is In Session" design (auto-generates on schedule)
250. Merch drop queued: "Objection Sustained" design (auto-generates on schedule)
251. Merch drop queued: "Sworn Testimony" design (auto-generates on schedule)
252. Merch drop queued: "Circumstantial" design (auto-generates on schedule)
253. Merch drop queued: "Case Notes" design (auto-generates on schedule)
254. Merch drop queued: "Do Your Research" design (auto-generates on schedule)
255. Merch drop queued: "Solve It Yourself" design (auto-generates on schedule)
256. Merch drop queued: "The Timeline Doesn't Lie" design (auto-generates on schedule)
257. Merch drop queued: "Corroborate Everything" design (auto-generates on schedule)
258. Merch drop queued: "Witness Statement" design (auto-generates on schedule)
259. Merch drop queued: "Unsealed Records" design (auto-generates on schedule)
260. Merch drop queued: "Forensics First" design (auto-generates on schedule)
261. Merch drop queued: "Trust The Evidence" design (auto-generates on schedule)
262. Merch drop queued: "Snack Sized Justice" design (auto-generates on schedule)
263. Merch drop queued: "True Crime Tuesday" design (auto-generates on schedule)
264. Merch drop queued: "Friday Night Case File" design (auto-generates on schedule)
265. gen-merch falls back to the curated reserve when the LLM is offline — scheduled drops never stall

## Batch 1 · PWA & Resilience

266. Full PWA manifest (name, id, display, categories, orientation)
267. App shortcut: Latest Episodes
268. App shortcut: Live Case Board
269. App shortcut: Quizzes
270. icon-192.png generated from the logo
271. icon-512.png generated
272. Maskable icon 192 (safe-zone padded)
273. Maskable icon 512
274. Service worker: network-first pages, stale-while-revalidate assets
275. Offline fallback page (Connection Cold Case)
276. SW auto-registration on every page via effects.js
277. SW version-key cache invalidation
278. SW never touches cross-origin audio/YouTube/FBI requests

## Batch 1 · Delivery & Headers

279. HSTS header (2-year, includeSubDomains)
280. X-DNS-Prefetch-Control header
281. Permissions-Policy extended (payment, usb)
282. automation/*.json served with correct content-type
283. automation/*.json 5-min CDN cache + stale-while-revalidate
284. CORS header on public JSON data
285. Merch images: 30-day immutable cache
286. Site images: 1-day cache + 7-day SWR
287. CSS/JS: 7-day cache + SWR
288. sw.js no-cache rule (instant SW updates)
289. Audio files: immutable cache + byte-range serving
290. preconnect to cdnjs on every page
291. dns-prefetch to cdnjs on every page
292. format-detection meta (no fake phone links on iOS)

## Batch 1 · UX Features

293. Back-to-top button (appears after 900px, smooth, reduced-motion aware)
294. Reading progress bar on every episode & blog page
295. Media Session API: lock-screen artwork + play/pause/skip on phones
296. "/" keyboard shortcut focuses search on any page with a search box
297. External-link safety net (auto rel=noopener)
298. Episodes page: live search box
299. Episodes page: sort control (newest/oldest/longest/shortest)
300. Episodes page: no-results empty state
301. Episode cards carry data-date + data-seconds for instant client sorting
302. Share row on every episode page (copy link, X, Facebook, email)
303. Share row on every blog post
304. Copy-link buttons with Copied confirmation
305. Quiz keyboard play: A-D and 1-4 answer, Enter advances
306. Quiz personal-best scores saved locally
307. Best-score trophy chips on the quiz picker
308. New personal best banner on the score screen
309. Live board: sort control (recent / reward first / A-Z)
310. Live board: live case counter in the toolbar
311. Search placeholders advertise the / shortcut

## Batch 1 · SEO & Structured Data

312. BreadcrumbList JSON-LD on every episode page
313. BreadcrumbList JSON-LD on every blog post
314. timeRequired (ISO 8601 duration) on PodcastEpisode schema
315. Quiz ItemList JSON-LD on the quiz page
316. FAQPage JSON-LD on the About page (3 Q&As)
317. aria-current=page on active nav items (generators)
318. aria-current=page on static-page navs
319. Descriptive alt text pattern for episode cover art
320. width/height on episode card images (CLS fix)
321. width/height on blog card images (CLS fix)
322. humans.txt rewritten (team, stack, doctrine)
323. security.txt with Expires + Canonical (RFC 9116 complete)

## Batch 1 · The Ledger System

324. automation/improvements.md — this auditable numbered ledger
325. ledger.mjs helper: one call appends a numbered entry
326. ai-write logs every published post to the ledger
327. gen-quiz logs every published quiz
328. gen-merch logs every design drop
329. build-status counts ledger entries into status.json
330. Mission Control shows Improvements Shipped tile

## Batch 2 · The Glossary

331. glossary.json NEW: structured term database (3 sections)
332. build-glossary.mjs NEW: glossary page generator with live search
333. glossary.html NEW: The Case File Glossary page
334. DefinedTermSet JSON-LD (every term is a search-indexable definition)
335. Glossary live-filter search with section auto-hide
336. Glossary linked from the footer on every page
337. Glossary wired into build-all (survives every auto-rebuild)
338. Glossary term written: "Locard's Exchange Principle" (Forensics & Evidence)
339. Glossary term written: "Chain of Custody" (Forensics & Evidence)
340. Glossary term written: "Touch DNA" (Forensics & Evidence)
341. Glossary term written: "CODIS" (Forensics & Evidence)
342. Glossary term written: "Forensic Genetic Genealogy" (Forensics & Evidence)
343. Glossary term written: "Mitochondrial DNA" (Forensics & Evidence)
344. Glossary term written: "DNA Phenotyping" (Forensics & Evidence)
345. Glossary term written: "Latent Print" (Forensics & Evidence)
346. Glossary term written: "Ballistics" (Forensics & Evidence)
347. Glossary term written: "Gunshot Residue (GSR)" (Forensics & Evidence)
348. Glossary term written: "Luminol" (Forensics & Evidence)
349. Glossary term written: "Bloodstain Pattern Analysis" (Forensics & Evidence)
350. Glossary term written: "Autopsy" (Forensics & Evidence)
351. Glossary term written: "Cause of Death" (Forensics & Evidence)
352. Glossary term written: "Manner of Death" (Forensics & Evidence)
353. Glossary term written: "Rigor Mortis" (Forensics & Evidence)
354. Glossary term written: "Livor Mortis" (Forensics & Evidence)
355. Glossary term written: "Forensic Entomology" (Forensics & Evidence)
356. Glossary term written: "Forensic Odontology" (Forensics & Evidence)
357. Glossary term written: "Isotope Analysis" (Forensics & Evidence)
358. Glossary term written: "Trace Evidence" (Forensics & Evidence)
359. Glossary term written: "Exemplar" (Forensics & Evidence)
360. Glossary term written: "Cold Hit" (Forensics & Evidence)
361. Glossary term written: "Person of Interest" (Investigation)
362. Glossary term written: "Suspect" (Investigation)
363. Glossary term written: "Modus Operandi (M.O.)" (Investigation)
364. Glossary term written: "Signature" (Investigation)
365. Glossary term written: "Staging" (Investigation)
366. Glossary term written: "Victimology" (Investigation)
367. Glossary term written: "Canvass" (Investigation)
368. Glossary term written: "BOLO" (Investigation)
369. Glossary term written: "AMBER Alert" (Investigation)
370. Glossary term written: "NamUs" (Investigation)
371. Glossary term written: "ViCAP" (Investigation)
372. Glossary term written: "Profiling" (Investigation)
373. Glossary term written: "The First 48" (Investigation)
374. Glossary term written: "Cold Case" (Investigation)
375. Glossary term written: "Exhumation" (Investigation)
376. Glossary term written: "Jurisdiction" (Investigation)
377. Glossary term written: "Task Force" (Investigation)
378. Glossary term written: "Tip Line" (Investigation)
379. Glossary term written: "Geofence Warrant" (Investigation)
380. Glossary term written: "Cell Tower Ping" (Investigation)
381. Glossary term written: "Probable Cause" (Courts & Law)
382. Glossary term written: "Miranda Rights" (Courts & Law)
383. Glossary term written: "Indictment" (Courts & Law)
384. Glossary term written: "Grand Jury" (Courts & Law)
385. Glossary term written: "Arraignment" (Courts & Law)
386. Glossary term written: "Plea Bargain" (Courts & Law)
387. Glossary term written: "Alford Plea" (Courts & Law)
388. Glossary term written: "No Contest (Nolo Contendere)" (Courts & Law)
389. Glossary term written: "Beyond a Reasonable Doubt" (Courts & Law)
390. Glossary term written: "Circumstantial Evidence" (Courts & Law)
391. Glossary term written: "Direct Evidence" (Courts & Law)
392. Glossary term written: "Hearsay" (Courts & Law)
393. Glossary term written: "Exculpatory Evidence" (Courts & Law)
394. Glossary term written: "Brady Violation" (Courts & Law)
395. Glossary term written: "Double Jeopardy" (Courts & Law)
396. Glossary term written: "Statute of Limitations" (Courts & Law)
397. Glossary term written: "Change of Venue" (Courts & Law)
398. Glossary term written: "Voir Dire" (Courts & Law)
399. Glossary term written: "Sequestration" (Courts & Law)
400. Glossary term written: "Hung Jury" (Courts & Law)
401. Glossary term written: "Mistrial" (Courts & Law)
402. Glossary term written: "Acquittal" (Courts & Law)
403. Glossary term written: "Exoneration" (Courts & Law)
404. Glossary term written: "Habeas Corpus" (Courts & Law)
405. Glossary term written: "Life Without Parole (LWOP)" (Courts & Law)
406. Glossary term written: "Insanity Defense" (Courts & Law)
407. Glossary term written: "Competency to Stand Trial" (Courts & Law)
408. Glossary term written: "Extradition" (Courts & Law)
409. Glossary term written: "Jailhouse Informant" (Courts & Law)
410. Glossary term written: "Wrongful Conviction" (Courts & Law)
411. Glossary term written: "False Confession" (Courts & Law)

## Batch 2b · Sitemap Repair

412. Sitemap bug fixed: live.html, quiz.html and glossary.html were invisible to search engines (allowlist gap)
413. Live board sitemap hint: changefreq daily
414. Quiz page sitemap hint: weekly / 0.8 priority
415. Glossary sitemap hint added
416. Sitemap grew from 22 to 25 indexed URLs

## Batch 3 · Transcripts & The Search Archive

417. transcribe.py NEW: local Whisper transcriber (reads the feed, downloads audio, $0, no API)
418. faster-whisper installed and running on the studio PC
419. build-search.mjs NEW: site-wide search index builder
420. search.html NEW: full-archive search page with type badges and highlighting
421. Search deep links: transcript hits jump the player to the exact second (?t=)
422. Transcript sections on episode pages (tap any line to seek the player)
423. Transcript paragraphs auto-grouped by silence gaps
424. Now-playing highlight follows transcript clicks
425. Search icon added to the header on every page
426. Transcript styling (timestamps, hover states, playing state)
427. Search index covers episodes, transcripts, posts, quizzes, glossary
428. Episode transcribed: "CrimeTimeSnacks: The Delphi Murder Case 2017" (98 segments, 565s)
429. Episode transcribed: "ERIK AND LYLE: The Menendez Brothers" (505 segments, 1178s)
430. Episode transcribed: "JonBenét Ramsey Americas Child Beauty Queen" (9 segments, 57s)
431. Episode transcribed: "JonBenét Ramsey | The Facts 96-22 |Part 1" (157 segments, 944s)
432. Episode transcribed: "Murders in Moscow" (118 segments, 701s)
433. Episode transcribed: "Watts Family Murders" (437 segments, 1302s)

<!-- running total: 433 shipped -->
434. [auto 2026-07-17] Published blog post in Cory's voice: "How Forensic Genealogy Is Reopening Cases the System Had Written Off"
435. [auto 2026-07-17] Dropped 1 new merch design into the vault
436. [auto 2026-07-17] Published new quiz: "The Moscow Student Murders" (5 questions)
437. [auto 2026-07-28] Published blog post in Cory's voice: "Why Solid Evidence Gets Thrown Out of Court"
438. [auto 2026-07-28] Published new quiz: "The Watts Case: What You Really Know" (5 questions)
439. [auto 2026-08-04] Published blog post in Cory's voice: "What You Saw and What Happened Are Not the Same Thing"
440. [auto 2026-08-04] Dropped 1 new merch design into the vault
441. [auto 2026-08-04] Published new quiz: "The Menendez Brothers: Know the Case" (5 questions)
442. [auto 2026-08-14] Published blog post in Cory's voice: "What Actually Gets a Cold Case Reopened"
443. [auto 2026-08-14] Dropped 1 new merch design into the vault
444. [auto 2026-08-14] Published new quiz: "JonBenét Ramsey: The Case File" (5 questions)
445. [auto 2026-08-18] Published blog post in Cory's voice: "How Familial DNA Searching Actually Works"
446. [auto 2026-08-18] Dropped 1 new merch design into the vault
447. [auto 2026-08-18] Published new quiz: "The JonBenét Ramsey Case File" (5 questions)
448. [auto 2026-08-25] Published blog post in Cory's voice: "When the Case File Gets It Wrong"
449. [auto 2026-08-25] Published new quiz: "The Delphi Murders: What You Know" (5 questions)

#!/usr/bin/env node
// Generates quiz.html from quizzes.json — interactive true-crime quizzes with
// scoring, explanations, and a shareable result. Uses the shared 2026 shell.
// Run: node automation/build-quiz.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SITE, esc, head, header, footer, tape, scripts } from "./shell.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const data = JSON.parse(await readFile(join(__dirname, "quizzes.json"), "utf8"));
const quizzes = data.quizzes || [];

function pickerCard(q, i) {
  return `            <button class="quiz-pick episode-card" data-quiz="${i}" data-slug="${esc(q.slug)}" style="text-align:left;cursor:pointer;border:1px solid var(--cts-line);background:linear-gradient(180deg,var(--cts-panel),var(--cts-ink));">
                <div class="episode-content">
                    <div class="episode-badges"><span class="episode-badge">${esc(q.tag)}</span><span class="episode-badge">${q.questions.length} Questions</span></div>
                    <h3 class="episode-title">${esc(q.title)}</h3>
                    <p class="episode-description">${esc(q.description)}</p>
                    <div class="episode-actions"><span class="btn btn-primary btn-sm">Start <i class="fas fa-arrow-right" aria-hidden="true"></i></span><span class="best-score" data-best="${esc(q.slug)}" style="display:none;"></span></div>
                </div>
            </button>`;
}

const quizLd = `\n    <script type="application/ld+json">\n${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "CrimeTimeSnacks True Crime Quizzes",
  itemListElement: quizzes.map((q, i) => ({
    "@type": "ListItem",
    position: i + 1,
    item: { "@type": "Quiz", name: q.title, about: q.description, url: `${SITE}/quiz.html` },
  })),
}, null, 2)}\n    </script>`;

const page = `${head({
  title: "True Crime Quizzes | CrimeTimeSnacks",
  description: "Interactive true crime quizzes from CrimeTimeSnacks — case timelines, evidence, and detective skills. Think you know your cases?",
  canonicalPath: "/quiz.html",
  extraHead: quizLd,
})}
<body>
${header("quiz")}
    <main id="main-content">
    <section class="page-hero">
        <div class="container">
            <p class="eyebrow" style="justify-content:center;">Interrogation Room</p>
            <h1 class="page-title">Think You Know <span class="text-red">Your Cases?</span></h1>
            <p>${esc(data.meta?.intro || "Quizzes built from the cases covered on the show.")}</p>
        </div>
    </section>

${tape()}

    <section class="container" style="max-width:1000px;">
        <div id="quiz-picker" class="quiz-picker">
${quizzes.map(pickerCard).join("\n")}
        </div>

        <div id="quiz-stage" class="quiz-shell" style="display:none;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <button id="quiz-back" class="btn btn-secondary btn-sm"><i class="fas fa-arrow-left" aria-hidden="true"></i> All Quizzes</button>
                <span id="quiz-counter" class="live-updated"></span>
            </div>
            <div class="quiz-progress"><div id="quiz-progress-fill" class="quiz-progress-fill"></div></div>
            <div id="quiz-card" class="quiz-card"></div>
        </div>
    </section>
    </main>

${footer()}

${scripts()}
    <script id="quiz-data" type="application/json">${JSON.stringify(quizzes)}</script>
    <script>
    (function () {
        'use strict';
        var quizzes = JSON.parse(document.getElementById('quiz-data').textContent);
        var picker = document.getElementById('quiz-picker');
        var stage = document.getElementById('quiz-stage');
        var card = document.getElementById('quiz-card');
        var counter = document.getElementById('quiz-counter');
        var fill = document.getElementById('quiz-progress-fill');
        var current = null, qi = 0, score = 0, locked = false;

        function esc(s) {
            return String(s || '').replace(/[&<>"]/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
            });
        }

        function show(el) { el.style.display = ''; }
        function hide(el) { el.style.display = 'none'; }

        function start(i) {
            current = quizzes[i];
            qi = 0; score = 0;
            hide(picker); show(stage);
            stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
            renderQ();
        }

        function renderQ() {
            locked = false;
            var q = current.questions[qi];
            counter.textContent = 'Question ' + (qi + 1) + ' of ' + current.questions.length;
            fill.style.width = ((qi) / current.questions.length * 100) + '%';
            var keys = ['A', 'B', 'C', 'D', 'E'];
            card.innerHTML =
                '<div class="quiz-q">' + esc(q.q) + '</div>' +
                '<div class="quiz-opts">' + q.options.map(function (opt, oi) {
                    return '<button class="quiz-opt" data-oi="' + oi + '"><span class="key">' + keys[oi] + '</span> ' + esc(opt) + '</button>';
                }).join('') + '</div>' +
                '<div id="quiz-next-row" style="margin-top:1.4rem;display:none;text-align:right;">' +
                '<button id="quiz-next" class="btn btn-primary btn-sm">' + (qi + 1 === current.questions.length ? 'See My Score' : 'Next Question') + ' <i class="fas fa-arrow-right" aria-hidden="true"></i></button></div>';

            card.querySelectorAll('.quiz-opt').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    if (locked) return;
                    locked = true;
                    var oi = parseInt(btn.getAttribute('data-oi'), 10);
                    var right = current.questions[qi].answer;
                    card.querySelectorAll('.quiz-opt').forEach(function (b, bi) {
                        b.disabled = true;
                        if (bi === right) b.classList.add('correct');
                    });
                    if (oi === right) { score++; } else { btn.classList.add('wrong'); }
                    var ex = document.createElement('div');
                    ex.className = 'quiz-explain';
                    ex.innerHTML = '<strong>' + (oi === right ? 'Correct. ' : 'Not quite. ') + '</strong>' + esc(current.questions[qi].explain);
                    card.appendChild(ex);
                    document.getElementById('quiz-next-row').style.display = '';
                    document.getElementById('quiz-next').addEventListener('click', nextQ);
                });
            });
        }

        // Keyboard: A-D or 1-4 answers, Enter/Space advances.
        document.addEventListener('keydown', function (e) {
            if (!current || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
            var k = e.key.toLowerCase();
            var idx = ['a','b','c','d'].indexOf(k);
            if (idx === -1 && /^[1-4]$/.test(k)) idx = parseInt(k, 10) - 1;
            if (idx > -1 && !locked) {
                var btn = card.querySelectorAll('.quiz-opt')[idx];
                if (btn) { btn.click(); e.preventDefault(); }
                return;
            }
            if ((e.key === 'Enter' || e.key === ' ') && locked) {
                var next = document.getElementById('quiz-next');
                if (next) { next.click(); e.preventDefault(); }
            }
        });

        function bestKey() { try { return JSON.parse(localStorage.getItem('ctsQuizBest') || '{}'); } catch (e) { return {}; } }
        function saveBest(slug, pct) {
            try {
                var b = bestKey();
                if (!(slug in b) || pct > b[slug]) { b[slug] = pct; localStorage.setItem('ctsQuizBest', JSON.stringify(b)); return true; }
            } catch (e) { /* private mode */ }
            return false;
        }
        function paintBest() {
            var b = bestKey();
            document.querySelectorAll('[data-best]').forEach(function (chip) {
                var slug = chip.getAttribute('data-best');
                if (slug in b) { chip.style.display = ''; chip.innerHTML = '<i class="fas fa-trophy" aria-hidden="true"></i> Best ' + b[slug] + '%'; }
            });
        }
        paintBest();

        function verdict(pct) {
            if (pct === 100) return 'Lead Detective. You RUN this case board.';
            if (pct >= 80) return 'Detective. The details don\\'t get past you.';
            if (pct >= 60) return 'Investigator. Solid instincts — re-listen and go again.';
            if (pct >= 40) return 'Beat Cop. You know the headlines, not the case file.';
            return 'Civilian. Perfect excuse to binge the back catalog.';
        }

        function nextQ() {
            qi++;
            if (qi < current.questions.length) { renderQ(); return; }
            fill.style.width = '100%';
            var pct = Math.round(score / current.questions.length * 100);
            var newBest = saveBest(current.slug, pct);
            paintBest();
            var shareText = 'I scored ' + score + '/' + current.questions.length + ' on the ' + current.title + ' quiz from @CrimeTimeSnacks — think you can beat me? ' + '${SITE}/quiz.html';
            counter.textContent = 'Case closed';
            card.innerHTML =
                '<div class="quiz-score">' +
                '<p class="eyebrow" style="justify-content:center;">' + esc(current.title) + '</p>' +
                '<div class="big">' + score + '/' + current.questions.length + '</div>' +
                '<p style="margin-top:0.8rem;font-weight:700;font-size:1.15rem;">' + verdict(pct) + '</p>' +
                (newBest ? '<p style="margin-top:0.5rem;"><span class="best-score"><i class="fas fa-trophy" aria-hidden="true"></i> New personal best</span></p>' : '') +
                '<div style="display:flex;gap:0.8rem;justify-content:center;flex-wrap:wrap;margin-top:1.6rem;">' +
                '<button id="quiz-share" class="btn btn-primary btn-sm"><i class="fas fa-share-nodes" aria-hidden="true"></i> Copy My Result</button>' +
                '<button id="quiz-retry" class="btn btn-secondary btn-sm"><i class="fas fa-rotate-right" aria-hidden="true"></i> Retry</button>' +
                '<a href="/episodes.html" class="btn btn-secondary btn-sm"><i class="fas fa-headphones" aria-hidden="true"></i> Binge the Cases</a>' +
                '</div></div>';
            document.getElementById('quiz-retry').addEventListener('click', function () { qi = 0; score = 0; renderQ(); });
            document.getElementById('quiz-share').addEventListener('click', function () {
                var btn = this;
                var done = function () { btn.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Copied'; };
                if (navigator.clipboard) { navigator.clipboard.writeText(shareText).then(done, done); } else { done(); }
            });
        }

        picker.querySelectorAll('.quiz-pick').forEach(function (btn) {
            btn.addEventListener('click', function () { start(parseInt(btn.getAttribute('data-quiz'), 10)); });
        });
        document.getElementById('quiz-back').addEventListener('click', function () {
            hide(stage); show(picker);
            picker.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    })();
    </script>
</body>
</html>
`;

await writeFile(join(ROOT, "quiz.html"), page, "utf8");
console.log(`quiz.html generated: ${quizzes.length} quizzes, ${quizzes.reduce((n, q) => n + q.questions.length, 0)} questions.`);

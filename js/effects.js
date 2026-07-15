/* ============================================================================
   CRIMETIMESNACKS — effects.js (2026)
   The cinematic layer: atmosphere, reveals, rotating headline word, count-up
   stats, 3D tilt, hero parallax, marquee, and the custom audio player skin.
   Progressive enhancement only — the site works fully without it.
   ========================================================================== */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------------------------------------------------- atmosphere layers */
    function initAtmosphere() {
        if (!document.querySelector('.cts-atmosphere')) {
            var atmo = document.createElement('div');
            atmo.className = 'cts-atmosphere';
            atmo.setAttribute('aria-hidden', 'true');
            document.body.prepend(atmo);
        }
        if (!reduceMotion && !document.querySelector('.cts-grain')) {
            var grain = document.createElement('div');
            grain.className = 'cts-grain';
            grain.setAttribute('aria-hidden', 'true');
            document.body.appendChild(grain);
        }
    }

    /* ------------------------------------------------------- sticky header */
    function initHeader() {
        var header = document.querySelector('header');
        if (!header) return;
        var onScroll = function () {
            header.classList.toggle('scrolled', window.scrollY > 24);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    /* -------------------------------------------------- auto scroll reveals */
    // Tags common blocks with .animate-on-scroll (staggered), so even the
    // auto-generated pages get reveals with zero template changes.
    function initReveals() {
        var selectors = [
            '.episode-card', '.blog-card', '.merch-item', '.video-card',
            '.wanted-card', '.ai-feature-card', '.dash-panel', '.section-head',
            '.newsletter-block', '.quiz-card'
        ];
        var nodes = document.querySelectorAll(selectors.join(','));
        var stagger = {};
        nodes.forEach(function (el) {
            if (el.classList.contains('animate-on-scroll')) return;
            var key = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
            el.classList.add('animate-on-scroll');
            el.style.setProperty('--reveal-delay', Math.min((key % 6) * 0.07, 0.42) + 's');
        });

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animated');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.05, rootMargin: '0px 0px -4% 0px' });

        document.querySelectorAll('.animate-on-scroll').forEach(function (el) {
            observer.observe(el);
        });

        // Bulletproof fallback: a cheap manual sweep on scroll/resize (throttled)
        // reveals anything the observer missed — nothing can ever stay hidden.
        var sweeping = false;
        function sweep() {
            if (sweeping) return;
            sweeping = true;
            requestAnimationFrame(function () {
                var vh = window.innerHeight || document.documentElement.clientHeight;
                document.querySelectorAll('.animate-on-scroll:not(.animated)').forEach(function (el) {
                    var r = el.getBoundingClientRect();
                    if (r.top < vh * 0.96 && r.bottom > 0) el.classList.add('animated');
                });
                sweeping = false;
            });
        }
        window.addEventListener('scroll', sweep, { passive: true });
        window.addEventListener('resize', sweep, { passive: true });
        sweep();
        setTimeout(sweep, 400);
        setTimeout(sweep, 1200);

        // Final failsafe: 2.5s after load, everything is revealed no matter what.
        // The entrance effect only ever applies to what the visitor actually
        // reaches early — content can never be stuck invisible.
        setTimeout(function () {
            document.querySelectorAll('.animate-on-scroll:not(.animated)').forEach(function (el, i) {
                setTimeout(function () { el.classList.add('animated'); }, Math.min(i * 40, 600));
            });
        }, 2500);
    }

    /* ------------------------------------------------- rotating headline word */
    function initRotator() {
        document.querySelectorAll('[data-rotate]').forEach(function (el) {
            var words;
            try { words = JSON.parse(el.getAttribute('data-rotate')); } catch (e) { return; }
            if (!words || words.length < 2) return;
            var i = 0;
            el.innerHTML = '<span class="word">' + words[0] + '</span>';
            if (reduceMotion) return;
            setInterval(function () {
                i = (i + 1) % words.length;
                var span = document.createElement('span');
                span.className = 'word';
                span.textContent = words[i];
                el.innerHTML = '';
                el.appendChild(span);
            }, 2600);
        });
    }

    /* --------------------------------------------------------- count-up stats */
    function initCounters() {
        var els = document.querySelectorAll('[data-count]');
        if (!els.length) return;
        var animate = function (el) {
            var target = parseFloat(el.getAttribute('data-count')) || 0;
            var suffix = el.getAttribute('data-suffix') || '';
            var dur = 1400;
            if (reduceMotion) { el.textContent = target.toLocaleString() + suffix; return; }
            var start = null;
            var step = function (ts) {
                if (!start) start = ts;
                var p = Math.min((ts - start) / dur, 1);
                var eased = 1 - Math.pow(1 - p, 3);
                el.textContent = Math.round(target * eased).toLocaleString() + suffix;
                if (p < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        };
        var seen = new WeakSet();
        var obs = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting && !seen.has(entry.target)) {
                    seen.add(entry.target);
                    animate(entry.target);
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.4 });
        els.forEach(function (el) { obs.observe(el); });
    }

    /* ------------------------------------------------------------- 3D tilt */
    function initTilt() {
        if (reduceMotion || !window.matchMedia('(hover: hover)').matches) return;
        document.querySelectorAll('.episode-card, .blog-card, .merch-item, .wanted-card').forEach(function (card) {
            var raf = null;
            card.addEventListener('mousemove', function (e) {
                if (raf) return;
                raf = requestAnimationFrame(function () {
                    var r = card.getBoundingClientRect();
                    var x = (e.clientX - r.left) / r.width - 0.5;
                    var y = (e.clientY - r.top) / r.height - 0.5;
                    card.style.transform = 'translateY(-7px) perspective(900px) rotateX(' + (-y * 4).toFixed(2) + 'deg) rotateY(' + (x * 5).toFixed(2) + 'deg)';
                    raf = null;
                });
            });
            card.addEventListener('mouseleave', function () {
                card.style.transform = '';
            });
        });
    }

    /* --------------------------------------------- hero parallax (the renders) */
    function initHeroParallax() {
        if (reduceMotion) return;
        var visual = document.querySelector('.hero-visual');
        var phones = document.querySelector('.hero-phones');
        if (!visual || !phones) return;

        if (window.matchMedia('(hover: hover)').matches) {
            var raf = null;
            visual.addEventListener('mousemove', function (e) {
                if (raf) return;
                raf = requestAnimationFrame(function () {
                    var r = visual.getBoundingClientRect();
                    var x = (e.clientX - r.left) / r.width - 0.5;
                    var y = (e.clientY - r.top) / r.height - 0.5;
                    phones.style.transform = 'rotateY(' + (x * 7).toFixed(2) + 'deg) rotateX(' + (-y * 5).toFixed(2) + 'deg)';
                    raf = null;
                });
            });
            visual.addEventListener('mouseleave', function () { phones.style.transform = ''; });
        }

        // background words drift on scroll
        var words = document.querySelectorAll('.bgword');
        if (words.length) {
            window.addEventListener('scroll', function () {
                var sy = window.scrollY;
                words.forEach(function (w, i) {
                    var speed = 0.06 + (i % 3) * 0.03;
                    w.style.transform = 'translateX(-50%) translateY(' + (sy * -speed).toFixed(1) + 'px)';
                });
            }, { passive: true });
        }
    }

    /* ------------------------------------------------------------- marquee */
    function initMarquee() {
        document.querySelectorAll('.marquee-track').forEach(function (track) {
            // duplicate content once for the seamless loop
            track.innerHTML = track.innerHTML + track.innerHTML;
        });
    }

    /* ----------------------------------------------- custom audio player skin */
    // Upgrades every plain <audio controls> into the branded .player UI.
    // The original element keeps playing the audio (mini-player sync intact).
    function fmt(t) {
        if (!isFinite(t) || t < 0) t = 0;
        var m = Math.floor(t / 60), s = Math.floor(t % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function upgradeAudio(audio) {
        if (audio.closest('.custom-audio-player') || audio.dataset.upgraded) return;
        audio.dataset.upgraded = '1';

        var wrap = document.createElement('div');
        wrap.className = 'player';
        wrap.innerHTML =
            '<button class="player-play" aria-label="Play"><i class="fas fa-play" aria-hidden="true"></i></button>' +
            '<button class="player-skip" aria-label="Back 15 seconds"><i class="fas fa-rotate-left" aria-hidden="true"></i><span>15</span></button>' +
            '<div class="player-rail" role="slider" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><div class="player-fill"></div></div>' +
            '<span class="player-time">0:00 / --:--</span>' +
            '<button class="player-skip" aria-label="Forward 30 seconds"><i class="fas fa-rotate-right" aria-hidden="true"></i><span>30</span></button>' +
            '<button class="player-speed" aria-label="Playback speed">1&times;</button>';

        audio.parentNode.insertBefore(wrap, audio);
        audio.removeAttribute('controls');
        audio.style.display = 'none';

        var playBtn = wrap.querySelector('.player-play');
        var icon = playBtn.querySelector('i');
        var skips = wrap.querySelectorAll('.player-skip');
        var rail = wrap.querySelector('.player-rail');
        var fill = wrap.querySelector('.player-fill');
        var time = wrap.querySelector('.player-time');
        var speedBtn = wrap.querySelector('.player-speed');
        var speeds = [1, 1.25, 1.5, 1.75, 2, 0.75];
        var si = 0;

        playBtn.addEventListener('click', function () {
            if (audio.paused) { audio.play(); } else { audio.pause(); }
        });
        audio.addEventListener('play', function () {
            icon.className = 'fas fa-pause';
            playBtn.setAttribute('aria-label', 'Pause');
        });
        audio.addEventListener('pause', function () {
            icon.className = 'fas fa-play';
            playBtn.setAttribute('aria-label', 'Play');
        });
        skips[0].addEventListener('click', function () { audio.currentTime = Math.max(0, audio.currentTime - 15); });
        skips[1].addEventListener('click', function () { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 30); });
        speedBtn.addEventListener('click', function () {
            si = (si + 1) % speeds.length;
            audio.playbackRate = speeds[si];
            speedBtn.innerHTML = String(speeds[si]).replace('.', '.') + '&times;';
        });

        function seekFromEvent(e) {
            var r = rail.getBoundingClientRect();
            var cx = (e.touches ? e.touches[0].clientX : e.clientX);
            var p = Math.min(Math.max((cx - r.left) / r.width, 0), 1);
            if (isFinite(audio.duration)) audio.currentTime = p * audio.duration;
        }
        rail.addEventListener('click', seekFromEvent);
        rail.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowRight') { audio.currentTime += 5; e.preventDefault(); }
            if (e.key === 'ArrowLeft') { audio.currentTime -= 5; e.preventDefault(); }
            if (e.key === ' ' || e.key === 'Enter') { audio.paused ? audio.play() : audio.pause(); e.preventDefault(); }
        });

        function paint() {
            var d = audio.duration;
            var p = (isFinite(d) && d > 0) ? (audio.currentTime / d) * 100 : 0;
            fill.style.width = p.toFixed(2) + '%';
            rail.setAttribute('aria-valuenow', Math.round(p));
            time.textContent = fmt(audio.currentTime) + ' / ' + (isFinite(d) ? fmt(d) : '--:--');
        }
        audio.addEventListener('timeupdate', paint);
        audio.addEventListener('loadedmetadata', paint);
        audio.addEventListener('durationchange', paint);
    }

    function initPlayers() {
        document.querySelectorAll('audio').forEach(upgradeAudio);
    }

    /* --------------------------------------------------------- copy buttons */
    function initCopy() {
        document.querySelectorAll('[data-copy]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var text = btn.getAttribute('data-copy');
                var done = function () {
                    var old = btn.textContent;
                    btn.textContent = 'Copied';
                    setTimeout(function () { btn.textContent = old; }, 1400);
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(done, done);
                } else { done(); }
            });
        });
    }

    /* ------------------------------------------------------ service worker */
    function initSW() {
        if (!('serviceWorker' in navigator)) return;
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/sw.js').catch(function () { /* non-fatal */ });
        });
    }

    /* -------------------------------------------------------- back to top */
    function initBackToTop() {
        var btn = document.createElement('button');
        btn.className = 'back-to-top';
        btn.setAttribute('aria-label', 'Back to top');
        btn.innerHTML = '<i class="fas fa-arrow-up" aria-hidden="true"></i>';
        document.body.appendChild(btn);
        btn.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
        });
        var ticking = false;
        window.addEventListener('scroll', function () {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(function () {
                btn.classList.toggle('visible', window.scrollY > 900);
                ticking = false;
            });
        }, { passive: true });
    }

    /* --------------------------------------- reading progress (detail pages) */
    function initReadingProgress() {
        var path = location.pathname;
        if (path.indexOf('/blog-posts/') === -1 && path.indexOf('/episodes/') === -1) return;
        var bar = document.createElement('div');
        bar.className = 'read-progress';
        bar.setAttribute('aria-hidden', 'true');
        document.body.appendChild(bar);
        var ticking = false;
        var paint = function () {
            var doc = document.documentElement;
            var max = doc.scrollHeight - window.innerHeight;
            bar.style.width = (max > 0 ? Math.min(window.scrollY / max, 1) * 100 : 0) + '%';
            ticking = false;
        };
        window.addEventListener('scroll', function () {
            if (!ticking) { ticking = true; requestAnimationFrame(paint); }
        }, { passive: true });
        paint();
    }

    /* ----------------------------- Media Session (lock-screen player controls) */
    function initMediaSession() {
        if (!('mediaSession' in navigator)) return;
        document.querySelectorAll('audio').forEach(function (audio) {
            audio.addEventListener('play', function () {
                var title = document.querySelector('.episode-header h1, .spotlight-body h3, h1');
                var img = document.querySelector('.episode-header ~ * img, .spotlight-media img');
                try {
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: (title ? title.textContent.trim() : 'CrimeTimeSnacks'),
                        artist: 'CrimeTimeSnacks — A True Crime Podcast',
                        artwork: [{ src: (img ? img.src : '/images/logo.png'), sizes: '512x512', type: 'image/png' }]
                    });
                    navigator.mediaSession.setActionHandler('play', function () { audio.play(); });
                    navigator.mediaSession.setActionHandler('pause', function () { audio.pause(); });
                    navigator.mediaSession.setActionHandler('seekbackward', function () { audio.currentTime = Math.max(0, audio.currentTime - 15); });
                    navigator.mediaSession.setActionHandler('seekforward', function () { audio.currentTime += 30; });
                } catch (e) { /* older browsers */ }
            });
        });
    }

    /* ------------------------------------------- "/" focuses the page search */
    function initSlashSearch() {
        var box = document.getElementById('live-search') || document.getElementById('episode-search') || document.getElementById('search-input');
        if (!box) return;
        document.addEventListener('keydown', function (e) {
            if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
                e.preventDefault();
                box.focus();
            }
        });
    }

    /* ------------------------- safety net: external links get rel protection */
    function initExternalLinks() {
        document.querySelectorAll('a[target="_blank"]').forEach(function (a) {
            var rel = (a.getAttribute('rel') || '').split(/\s+/);
            if (rel.indexOf('noopener') === -1) rel.push('noopener');
            a.setAttribute('rel', rel.join(' ').trim());
        });
    }

    /* --------------------------- transcript seek + ?t= deep links */
    function initTranscript() {
        var audio = document.querySelector('audio');
        document.querySelectorAll('.transcript-para[data-t]').forEach(function (p) {
            p.addEventListener('click', function () {
                if (!audio) return;
                audio.currentTime = parseInt(p.getAttribute('data-t'), 10) || 0;
                audio.play();
                document.querySelectorAll('.transcript-para.playing').forEach(function (x) { x.classList.remove('playing'); });
                p.classList.add('playing');
            });
        });
        // ?t=SECONDS deep link (from search results) — open transcript, seek, play
        var t = new URLSearchParams(location.search).get('t');
        if (t !== null && audio) {
            var secs = parseInt(t, 10) || 0;
            var details = document.getElementById('transcript');
            if (details) details.open = true;
            var target = null;
            document.querySelectorAll('.transcript-para[data-t]').forEach(function (p) {
                if (parseInt(p.getAttribute('data-t'), 10) <= secs) target = p;
            });
            var seek = function () { audio.currentTime = secs; };
            audio.addEventListener('loadedmetadata', seek, { once: true });
            seek();
            audio.play().catch(function () { /* autoplay blocked — user presses play, position is set */ });
            if (target) {
                target.classList.add('playing');
                setTimeout(function () { target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); }, 400);
            }
        }
    }

    /* -------------------------------------------------------------- kickoff */
    function init() {
        initAtmosphere();
        initHeader();
        initReveals();
        initRotator();
        initCounters();
        initTilt();
        initHeroParallax();
        initMarquee();
        initPlayers();
        initCopy();
        initSW();
        initBackToTop();
        initReadingProgress();
        initMediaSession();
        initSlashSearch();
        initExternalLinks();
        initTranscript();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// Main JavaScript for CrimeTimeSnacks Website

// Mark JS as available ASAP so CSS can safely hide pre-animation content.
document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', function() {
    // Mobile Navigation Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');
    
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            mobileMenuBtn.classList.toggle('active');
        });
    }
    
    // Enhanced Audio Player
    initializeCustomAudioPlayers();
    initializeNativeAudioExperience();
    
    // Animate elements on scroll
    const animatedElements = document.querySelectorAll('.animate-on-scroll');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');
            }
        });
    }, { threshold: 0.1 });
    
    animatedElements.forEach(element => {
        observer.observe(element);
    });
    
    // Dark mode toggle (keeping dark as default)
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', function() {
            document.body.classList.toggle('light-mode');
            const isDarkMode = !document.body.classList.contains('light-mode');
            localStorage.setItem('darkMode', isDarkMode);
            updateDarkModeIcon(isDarkMode);
        });
        
        // Check user preference
        const savedDarkMode = localStorage.getItem('darkMode');
        if (savedDarkMode === 'false') {
            document.body.classList.add('light-mode');
            updateDarkModeIcon(false);
        }
    }
});

// Custom Audio Player Functions
function initializeCustomAudioPlayers() {
    const audioContainers = document.querySelectorAll('.custom-audio-player');
    
    audioContainers.forEach(container => {
        const audio = container.querySelector('audio');
        const playBtn = container.querySelector('.play-btn');
        const pauseBtn = container.querySelector('.pause-btn');
        const progress = container.querySelector('.progress');
        const progressBar = container.querySelector('.progress-bar');
        const currentTime = container.querySelector('.current-time');
        const duration = container.querySelector('.duration');
        const speedBtn = container.querySelector('.speed-btn');
        
        if (!audio) return;
        
        // Set up event listeners
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                audio.play();
                playBtn.style.display = 'none';
                pauseBtn.style.display = 'inline-block';
                
                // Save episode progress
                saveEpisodeProgress(audio.src, 'playing', audio.currentTime);
            });
        }
        
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                audio.pause();
                pauseBtn.style.display = 'none';
                playBtn.style.display = 'inline-block';
                
                // Save episode progress
                saveEpisodeProgress(audio.src, 'paused', audio.currentTime);
            });
        }
        
        if (progress) {
            progress.addEventListener('click', (e) => {
                const rect = progress.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                audio.currentTime = pos * audio.duration;
                
                // Save episode progress
                saveEpisodeProgress(audio.src, audio.paused ? 'paused' : 'playing', audio.currentTime);
            });
        }
        
        if (speedBtn) {
            speedBtn.addEventListener('click', () => {
                const speeds = [1, 1.25, 1.5, 1.75, 2];
                const currentSpeed = audio.playbackRate;
                const nextSpeedIndex = (speeds.indexOf(currentSpeed) + 1) % speeds.length;
                audio.playbackRate = speeds[nextSpeedIndex];
                speedBtn.textContent = `${speeds[nextSpeedIndex]}x`;
            });
        }
        
        // Update progress bar and time
        audio.addEventListener('timeupdate', () => {
            if (progressBar) {
                const percent = (audio.currentTime / audio.duration) * 100;
                progressBar.style.width = `${percent}%`;
            }
            
            if (currentTime) {
                currentTime.textContent = formatTime(audio.currentTime);
            }
            
            // Save progress periodically
            if (audio.currentTime % 5 < 0.1) { // Save every 5 seconds
                saveEpisodeProgress(audio.src, audio.paused ? 'paused' : 'playing', audio.currentTime);
            }
        });
        
        // Set duration when metadata is loaded
        audio.addEventListener('loadedmetadata', () => {
            if (duration) {
                duration.textContent = formatTime(audio.duration);
            }
            
            // Check for saved progress
            const progress = getEpisodeProgress(audio.src);
            if (progress && progress.time) {
                audio.currentTime = progress.time;
                
                if (progress.status === 'playing') {
                    audio.play();
                    if (playBtn) playBtn.style.display = 'none';
                    if (pauseBtn) pauseBtn.style.display = 'inline-block';
                }
            }
        });
        
        // Handle audio end
        audio.addEventListener('ended', () => {
            if (playBtn) playBtn.style.display = 'inline-block';
            if (pauseBtn) pauseBtn.style.display = 'none';
            
            // Clear progress when episode ends
            clearEpisodeProgress(audio.src);
        });
    });
}

// Helper function to format time
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}

// Save episode progress to localStorage
function saveEpisodeProgress(src, status, time) {
    const episodes = JSON.parse(localStorage.getItem('episodeProgress') || '{}');
    const episodeKey = src.split('/').pop();
    
    episodes[episodeKey] = {
        status: status,
        time: time,
        timestamp: Date.now()
    };
    
    localStorage.setItem('episodeProgress', JSON.stringify(episodes));
}

// Get episode progress from localStorage
function getEpisodeProgress(src) {
    const episodes = JSON.parse(localStorage.getItem('episodeProgress') || '{}');
    const episodeKey = src.split('/').pop();
    return episodes[episodeKey];
}

// Clear episode progress
function clearEpisodeProgress(src) {
    const episodes = JSON.parse(localStorage.getItem('episodeProgress') || '{}');
    const episodeKey = src.split('/').pop();
    
    if (episodes[episodeKey]) {
        delete episodes[episodeKey];
        localStorage.setItem('episodeProgress', JSON.stringify(episodes));
    }
}

// Update dark mode icon
function updateDarkModeIcon(isDarkMode) {
    const icon = document.querySelector('#dark-mode-toggle i');
    if (icon) {
        if (isDarkMode) {
            icon.className = 'fas fa-sun';
        } else {
            icon.className = 'fas fa-moon';
        }
    }
}

// Search functionality
function searchEpisodes() {
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput.value.toLowerCase();
    const episodeCards = document.querySelectorAll('.episode-card');
    
    episodeCards.forEach(card => {
        const title = card.querySelector('.episode-title').textContent.toLowerCase();
        const description = card.querySelector('.episode-description').textContent.toLowerCase();
        
        if (title.includes(searchTerm) || description.includes(searchTerm)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

// Native podcast audio: one active episode, accurate progress, and a persistent mini player.
function initializeNativeAudioExperience() {
    const audios = Array.from(document.querySelectorAll('audio'));
    if (!audios.length) {
        renderContinueListening();
        return;
    }

    const player = document.getElementById('mini-player');
    const playerImage = document.getElementById('mini-player-image');
    const playerTitle = document.getElementById('mini-player-title');
    const playerTime = document.getElementById('mini-player-time');
    const playerProgress = player && player.querySelector('.mini-player-progress');
    const playButton = document.getElementById('mini-player-play');
    const pauseButton = document.getElementById('mini-player-pause');
    const rewindButton = document.getElementById('mini-player-prev');
    const forwardButton = document.getElementById('mini-player-next');
    const speedButton = document.getElementById('mini-player-speed');
    const closeButton = document.getElementById('mini-player-close');
    let activeAudio = null;
    let lastSavedSecond = -1;

    function sourceFor(audio) {
        return audio.currentSrc || audio.querySelector('source')?.src || audio.src;
    }

    function metadataFor(audio) {
        const card = audio.closest('.episode-card, article, .episode-detail, main');
        const title = card?.querySelector('.episode-title, h1, h2, h3')?.textContent?.trim() || document.title.split('•')[0].trim();
        const image = card?.querySelector('img')?.src || new URL('images/logo.png', window.location.href).href;
        const episodeLink = card?.querySelector('a[href*="episodes/"]')?.href || window.location.href;
        return { title, image, href: episodeLink, src: sourceFor(audio) };
    }

    function readProgress() {
        try { return JSON.parse(localStorage.getItem('episodeProgressV2') || '{}'); }
        catch { return {}; }
    }

    function writeProgress(audio, completed) {
        const src = sourceFor(audio);
        if (!src || !Number.isFinite(audio.duration)) return;
        const records = readProgress();
        if (completed) {
            delete records[src];
        } else {
            records[src] = {
                ...metadataFor(audio),
                time: audio.currentTime,
                duration: audio.duration,
                timestamp: Date.now(),
            };
        }
        localStorage.setItem('episodeProgressV2', JSON.stringify(records));
        renderContinueListening();
    }

    function syncPlayer(audio) {
        if (!player) return;
        const meta = metadataFor(audio);
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        const percent = duration ? Math.min(100, (audio.currentTime / duration) * 100) : 0;
        player.classList.add('active');
        player.setAttribute('aria-hidden', 'false');
        if (playerImage) playerImage.src = meta.image;
        if (playerTitle) playerTitle.textContent = meta.title;
        if (playerTime) playerTime.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
        if (playerProgress) playerProgress.style.width = `${percent}%`;
        if (playButton) playButton.style.display = audio.paused ? 'inline-flex' : 'none';
        if (pauseButton) pauseButton.style.display = audio.paused ? 'none' : 'inline-flex';
        if (speedButton) speedButton.textContent = `${audio.playbackRate}×`;
    }

    audios.forEach(audio => {
        audio.addEventListener('loadedmetadata', () => {
            const saved = readProgress()[sourceFor(audio)];
            if (saved && saved.time > 5 && saved.time < audio.duration - 10) audio.currentTime = saved.time;
        });
        audio.addEventListener('play', () => {
            audios.forEach(other => { if (other !== audio && !other.paused) other.pause(); });
            activeAudio = audio;
            syncPlayer(audio);
        });
        audio.addEventListener('pause', () => {
            if (audio.currentTime > 1 && audio.currentTime < audio.duration - 2) writeProgress(audio, false);
            if (activeAudio === audio) syncPlayer(audio);
        });
        audio.addEventListener('timeupdate', () => {
            if (activeAudio === audio) syncPlayer(audio);
            const second = Math.floor(audio.currentTime);
            if (second !== lastSavedSecond && second > 0 && second % 5 === 0) {
                lastSavedSecond = second;
                writeProgress(audio, false);
            }
        });
        audio.addEventListener('ended', () => {
            writeProgress(audio, true);
            if (player) player.classList.remove('active');
        });
    });

    playButton?.addEventListener('click', () => activeAudio?.play());
    pauseButton?.addEventListener('click', () => activeAudio?.pause());
    rewindButton?.addEventListener('click', () => {
        if (!activeAudio) return;
        activeAudio.currentTime = Math.max(0, activeAudio.currentTime - 15);
        syncPlayer(activeAudio);
    });
    forwardButton?.addEventListener('click', () => {
        if (!activeAudio) return;
        activeAudio.currentTime = Math.min(activeAudio.duration || Infinity, activeAudio.currentTime + 30);
        syncPlayer(activeAudio);
    });
    speedButton?.addEventListener('click', () => {
        if (!activeAudio) return;
        const speeds = [1, 1.25, 1.5, 1.75, 2];
        const current = speeds.indexOf(activeAudio.playbackRate);
        activeAudio.playbackRate = speeds[(current + 1) % speeds.length];
        syncPlayer(activeAudio);
    });
    closeButton?.addEventListener('click', () => {
        activeAudio?.pause();
        player?.classList.remove('active');
        player?.setAttribute('aria-hidden', 'true');
    });

    renderContinueListening();
}

function renderContinueListening() {
    const section = document.getElementById('continue-listening');
    const content = document.getElementById('continue-listening-content');
    if (!section || !content) return;
    let records = {};
    try { records = JSON.parse(localStorage.getItem('episodeProgressV2') || '{}'); } catch {}
    const latest = Object.values(records)
        .filter(item => item && item.duration > 0 && item.time > 5 && item.time < item.duration - 10)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
    if (!latest) {
        section.style.display = 'none';
        content.replaceChildren();
        return;
    }

    section.style.display = 'block';
    const card = document.createElement('div');
    card.className = 'continue-card';
    const image = document.createElement('img');
    image.className = 'continue-image';
    image.src = latest.image || 'images/logo.png';
    image.alt = '';
    const info = document.createElement('div');
    info.className = 'continue-info';
    const title = document.createElement('h3');
    title.className = 'continue-title';
    title.textContent = latest.title || 'Continue episode';
    const progress = document.createElement('div');
    progress.className = 'continue-progress';
    progress.setAttribute('role', 'progressbar');
    const percent = Math.round((latest.time / latest.duration) * 100);
    progress.setAttribute('aria-valuenow', String(percent));
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    const bar = document.createElement('div');
    bar.className = 'continue-progress-bar';
    bar.style.width = `${percent}%`;
    progress.appendChild(bar);
    const actions = document.createElement('div');
    actions.className = 'continue-actions';
    const time = document.createElement('span');
    time.className = 'continue-time';
    time.textContent = `${formatTime(latest.time)} of ${formatTime(latest.duration)} listened`;
    const resume = document.createElement('a');
    resume.className = 'btn btn-primary btn-sm';
    resume.href = latest.href || 'episodes.html';
    resume.textContent = 'Resume episode';
    actions.append(time, resume);
    info.append(title, progress, actions);
    card.append(image, info);
    content.replaceChildren(card);
}

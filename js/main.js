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

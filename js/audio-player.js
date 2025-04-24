// Enhanced Audio Player for CrimeTimeSnacks Podcast
// This script provides an advanced audio player experience with features like
// playback speed control, timestamps, and audio visualization

class EnhancedAudioPlayer {
    constructor(audioElement, options = {}) {
        this.audio = audioElement;
        this.isPlaying = false;
        this.volume = options.initialVolume || 0.8;
        this.playbackRate = options.initialPlaybackRate || 1.0;
        
        // Create audio context for visualization
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.animationId = null;
        
        // Initialize player
        this.initPlayer();
        
        // Track episode progress for resume functionality
        this.episodeId = options.episodeId || this.audio.getAttribute('data-episode-id') || 'unknown';
        this.loadProgress();
        
        // Set up event listeners
        this.setupEventListeners();
    }
    
    initPlayer() {
        // Set initial volume
        this.audio.volume = this.volume;
        this.audio.playbackRate = this.playbackRate;
        
        // Create player UI if it doesn't exist
        this.createPlayerUI();
    }
    
    createPlayerUI() {
        // Find or create player container
        let playerContainer = document.querySelector('.audio-player-container');
        if (!playerContainer) {
            playerContainer = document.createElement('div');
            playerContainer.className = 'audio-player-container';
            this.audio.parentNode.insertBefore(playerContainer, this.audio);
            playerContainer.appendChild(this.audio);
        }
        
        // Create player controls
        const controlsHTML = `
            <div class="player-controls">
                <div class="player-progress">
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                        <div class="progress-handle"></div>
                    </div>
                    <div class="time-display">
                        <span class="current-time">0:00</span>
                        <span class="duration">0:00</span>
                    </div>
                </div>
                
                <div class="main-controls">
                    <button class="rewind-btn" title="Rewind 15 seconds">
                        <i class="fas fa-undo-alt"></i> 15
                    </button>
                    
                    <button class="play-pause-btn" title="Play/Pause">
                        <i class="fas fa-play"></i>
                    </button>
                    
                    <button class="forward-btn" title="Forward 15 seconds">
                        <i class="fas fa-redo-alt"></i> 15
                    </button>
                </div>
                
                <div class="secondary-controls">
                    <div class="volume-control">
                        <button class="mute-btn" title="Mute/Unmute">
                            <i class="fas fa-volume-up"></i>
                        </button>
                        <div class="volume-slider">
                            <div class="volume-fill"></div>
                            <div class="volume-handle"></div>
                        </div>
                    </div>
                    
                    <div class="playback-speed">
                        <button class="speed-btn" title="Playback Speed">
                            1.0x
                        </button>
                        <div class="speed-options">
                            <button data-speed="0.5">0.5x</button>
                            <button data-speed="0.75">0.75x</button>
                            <button data-speed="1.0" class="active">1.0x</button>
                            <button data-speed="1.25">1.25x</button>
                            <button data-speed="1.5">1.5x</button>
                            <button data-speed="2.0">2.0x</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="audio-visualization">
                <canvas class="visualizer"></canvas>
            </div>
        `;
        
        // Create controls element
        const controlsElement = document.createElement('div');
        controlsElement.className = 'player-ui';
        controlsElement.innerHTML = controlsHTML;
        playerContainer.appendChild(controlsElement);
        
        // Store references to UI elements
        this.playPauseBtn = controlsElement.querySelector('.play-pause-btn');
        this.rewindBtn = controlsElement.querySelector('.rewind-btn');
        this.forwardBtn = controlsElement.querySelector('.forward-btn');
        this.muteBtn = controlsElement.querySelector('.mute-btn');
        this.speedBtn = controlsElement.querySelector('.speed-btn');
        this.speedOptions = controlsElement.querySelector('.speed-options');
        this.progressBar = controlsElement.querySelector('.progress-bar');
        this.progressFill = controlsElement.querySelector('.progress-fill');
        this.progressHandle = controlsElement.querySelector('.progress-handle');
        this.currentTimeDisplay = controlsElement.querySelector('.current-time');
        this.durationDisplay = controlsElement.querySelector('.duration');
        this.volumeSlider = controlsElement.querySelector('.volume-slider');
        this.volumeFill = controlsElement.querySelector('.volume-fill');
        this.volumeHandle = controlsElement.querySelector('.volume-handle');
        this.visualizer = controlsElement.querySelector('.visualizer');
    }
    
    setupEventListeners() {
        // Play/Pause button
        this.playPauseBtn.addEventListener('click', () => this.togglePlay());
        
        // Rewind and Forward buttons
        this.rewindBtn.addEventListener('click', () => this.skipTime(-15));
        this.forwardBtn.addEventListener('click', () => this.skipTime(15));
        
        // Mute button
        this.muteBtn.addEventListener('click', () => this.toggleMute());
        
        // Speed button
        this.speedBtn.addEventListener('click', () => {
            this.speedOptions.classList.toggle('active');
        });
        
        // Speed options
        const speedButtons = this.speedOptions.querySelectorAll('button');
        speedButtons.forEach(button => {
            button.addEventListener('click', () => {
                const speed = parseFloat(button.getAttribute('data-speed'));
                this.setPlaybackRate(speed);
                
                // Update active class
                speedButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Hide speed options
                this.speedOptions.classList.remove('active');
            });
        });
        
        // Progress bar
        this.progressBar.addEventListener('click', (e) => {
            const rect = this.progressBar.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            this.setProgress(pos);
        });
        
        // Volume slider
        this.volumeSlider.addEventListener('click', (e) => {
            const rect = this.volumeSlider.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            this.setVolume(pos);
        });
        
        // Drag functionality for progress handle
        this.setupDragHandling(this.progressHandle, this.progressBar, (pos) => {
            this.setProgress(pos);
        });
        
        // Drag functionality for volume handle
        this.setupDragHandling(this.volumeHandle, this.volumeSlider, (pos) => {
            this.setVolume(pos);
        });
        
        // Audio element events
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audio.addEventListener('ended', () => this.onAudioEnded());
        
        // Save progress periodically
        setInterval(() => this.saveProgress(), 5000);
        
        // Handle keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Only handle shortcuts if the player is in focus
            if (document.activeElement.tagName === 'INPUT' || 
                document.activeElement.tagName === 'TEXTAREA') {
                return;
            }
            
            switch (e.key) {
                case ' ':  // Space bar
                    e.preventDefault();
                    this.togglePlay();
                    break;
                case 'ArrowLeft':
                    this.skipTime(-5);
                    break;
                case 'ArrowRight':
                    this.skipTime(5);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.changeVolume(0.1);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.changeVolume(-0.1);
                    break;
            }
        });
        
        // Close speed options when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.playback-speed')) {
                this.speedOptions.classList.remove('active');
            }
        });
    }
    
    setupDragHandling(handle, container, callback) {
        let isDragging = false;
        
        handle.addEventListener('mousedown', () => {
            isDragging = true;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const rect = container.getBoundingClientRect();
            let pos = (e.clientX - rect.left) / rect.width;
            
            // Clamp position between 0 and 1
            pos = Math.max(0, Math.min(1, pos));
            
            callback(pos);
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
    
    togglePlay() {
        if (this.audio.paused) {
            this.play();
        } else {
            this.pause();
        }
    }
    
    play() {
        this.audio.play();
        this.isPlaying = true;
        this.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        this.startVisualization();
    }
    
    pause() {
        this.audio.pause();
        this.isPlaying = false;
        this.playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        this.stopVisualization();
    }
    
    skipTime(seconds) {
        this.audio.currentTime += seconds;
    }
    
    toggleMute() {
        this.audio.muted = !this.audio.muted;
        
        if (this.audio.muted) {
            this.muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else {
            this.updateVolumeIcon();
        }
    }
    
    setPlaybackRate(rate) {
        this.playbackRate = rate;
        this.audio.playbackRate = rate;
        this.speedBtn.textContent = `${rate}x`;
    }
    
    setProgress(position) {
        const newTime = position * this.audio.duration;
        this.audio.currentTime = newTime;
        this.updateProgress();
    }
    
    updateProgress() {
        if (isNaN(this.audio.duration)) return;
        
        const progress = this.audio.currentTime / this.audio.duration;
        this.progressFill.style.width = `${progress * 100}%`;
        this.progressHandle.style.left = `${progress * 100}%`;
        
        // Update current time display
        this.currentTimeDisplay.textContent = this.formatTime(this.audio.currentTime);
    }
    
    updateDuration() {
        this.durationDisplay.textContent = this.formatTime(this.audio.duration);
    }
    
    setVolume(position) {
        this.volume = position;
        this.audio.volume = position;
        this.volumeFill.style.width = `${position * 100}%`;
        this.volumeHandle.style.left = `${position * 100}%`;
        
        // Update volume icon
        this.updateVolumeIcon();
    }
    
    changeVolume(delta) {
        const newVolume = Math.max(0, Math.min(1, this.volume + delta));
        this.setVolume(newVolume);
    }
    
    updateVolumeIcon() {
        let icon;
        
        if (this.audio.muted || this.volume === 0) {
            icon = '<i class="fas fa-volume-mute"></i>';
        } else if (this.volume < 0.5) {
            icon = '<i class="fas fa-volume-down"></i>';
        } else {
            icon = '<i class="fas fa-volume-up"></i>';
        }
        
        this.muteBtn.innerHTML = icon;
    }
    
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    onAudioEnded() {
        this.pause();
        this.audio.currentTime = 0;
        this.updateProgress();
        
        // Clear saved progress
        this.clearProgress();
    }
    
    saveProgress() {
        if (!this.audio.paused && this.audio.currentTime > 0) {
            localStorage.setItem(`podcast_progress_${this.episodeId}`, this.audio.currentTime);
        }
    }
    
    loadProgress() {
        const savedTime = localStorage.getItem(`podcast_progress_${this.episodeId}`);
        if (savedTime) {
            this.audio.currentTime = parseFloat(savedTime);
            
            // Show resume notification
            this.showResumeNotification();
        }
    }
    
    clearProgress() {
        localStorage.removeItem(`podcast_progress_${this.episodeId}`);
    }
    
    showResumeNotification() {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'resume-notification';
        notification.innerHTML = `
            <p>Resume from ${this.formatTime(this.audio.currentTime)}?</p>
            <div class="resume-buttons">
                <button class="resume-yes">Yes</button>
                <button class="resume-no">No</button>
            </div>
        `;
        
        // Add to player container
        const playerContainer = document.querySelector('.audio-player-container');
        playerContainer.appendChild(notification);
        
        // Handle buttons
        const yesButton = notification.querySelector('.resume-yes');
        const noButton = notification.querySelector('.resume-no');
        
        yesButton.addEventListener('click', () => {
            // Keep current time and remove notification
            notification.remove();
        });
        
        noButton.addEventListener('click', () => {
            // Reset to beginning
            this.audio.currentTime = 0;
            this.updateProgress();
            notification.remove();
        });
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 10000);
    }
    
    // Audio visualization
    startVisualization() {
        if (!this.audioContext) {
            this.setupAudioContext();
        }
        
        this.visualize();
    }
    
    setupAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.source = this.audioContext.createMediaElementSource(this.audio);
            
            this.source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            
            this.analyser.fftSize = 256;
            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);
            
            // Set up canvas
            const canvas = this.visualizer;
            this.canvasContext = canvas.getContext('2d');
            
            // Set canvas dimensions
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
        } catch (e) {
            console.error('Web Audio API is not supported in this browser', e);
        }
    }
    
    resizeCanvas() {
        if (!this.visualizer) return;
        
        const container = this.visualizer.parentNode;
        this.visualizer.width = container.clientWidth;
        this.visualizer.height = container.clientHeight;
    }
    
    visualize() {
        if (!this.analyser || !this.canvasContext) return;
        
        this.analyser.getByteFrequencyData(this.dataArray);
        
        const canvas = this.visualizer;
        const ctx = this.canvasContext;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw visualization
        const barWidth = (canvas.width / this.bufferLength) * 2.5;
        let x = 0;
        
        for (let i = 0; i < this.bufferLength; i++) {
            const barHeight = this.dataArray[i] / 2;
            
            // Use gradient based on the site's color scheme
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, '#ff3333');
            gradient.addColorStop(1, '#990000');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
        }
        
        // Continue animation loop
        this.animationId = requestAnimationFrame(() => this.visualize());
    }
    
    stopVisualization() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
}

// Initialize audio players when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const audioElements = document.querySelectorAll('audio');
    
    audioElements.forEach(audio => {
        // Create enhanced player for each audio element
        new EnhancedAudioPlayer(audio, {
            episodeId: audio.getAttribute('data-episode-id') || audio.src
        });
    });
    
    // Add global audio player for episode pages
    const episodeAudio = document.querySelector('.episode-audio');
    if (episodeAudio) {
        const audioSrc = episodeAudio.getAttribute('data-audio-src');
        const episodeId = episodeAudio.getAttribute('data-episode-id');
        
        if (audioSrc) {
            // Create audio element
            const audio = document.createElement('audio');
            audio.src = audioSrc;
            audio.setAttribute('data-episode-id', episodeId);
            episodeAudio.appendChild(audio);
            
            // Initialize player
            new EnhancedAudioPlayer(audio, {
                episodeId: episodeId
            });
        }
    }
});

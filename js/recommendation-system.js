// Content Recommendation System for CrimeTimeSnacks
// This script provides personalized episode recommendations based on user behavior and content similarity

class RecommendationSystem {
    constructor() {
        this.episodes = [];
        this.userPreferences = {};
        this.initialized = false;
    }
    
    async init() {
        try {
            // Load episodes data
            await this.loadEpisodes();
            
            // Load user preferences from localStorage
            this.loadUserPreferences();
            
            // Initialize recommendation UI
            this.initRecommendationUI();
            
            this.initialized = true;
            return true;
        } catch (error) {
            console.error('Error initializing recommendation system:', error);
            return false;
        }
    }
    
    async loadEpisodes() {
        // First try to load from episodes.json if available
        try {
            const response = await fetch('/episodes.json');
            if (response.ok) {
                this.episodes = await response.json();
                return;
            }
        } catch (e) {
            console.warn('Could not load episodes.json, falling back to DOM parsing');
        }
        
        // Fall back to parsing episodes from the DOM
        this.episodes = this.parseEpisodesFromDOM();
    }
    
    parseEpisodesFromDOM() {
        const episodes = [];
        const episodeElements = document.querySelectorAll('.episode-card, .episode-item');
        
        episodeElements.forEach(element => {
            const id = element.id || element.getAttribute('data-episode-id') || `episode-${episodes.length}`;
            const titleElement = element.querySelector('.episode-title');
            const descriptionElement = element.querySelector('.episode-description');
            const imageElement = element.querySelector('img');
            const linkElement = element.querySelector('a');
            const dateElement = element.querySelector('.episode-date');
            const categoryElements = element.querySelectorAll('.episode-category, .episode-badge');
            
            if (titleElement) {
                const episode = {
                    id: id,
                    title: titleElement.textContent.trim(),
                    description: descriptionElement ? descriptionElement.textContent.trim() : '',
                    image: imageElement ? imageElement.src : '',
                    link: linkElement ? linkElement.href : '',
                    date: dateElement ? dateElement.textContent.trim() : '',
                    categories: Array.from(categoryElements).map(el => el.textContent.trim()),
                    views: 0,
                    rating: 0
                };
                
                episodes.push(episode);
            }
        });
        
        return episodes;
    }
    
    loadUserPreferences() {
        // Load viewing history
        const viewingHistory = localStorage.getItem('crimeTimeSnacks_viewingHistory');
        if (viewingHistory) {
            try {
                const history = JSON.parse(viewingHistory);
                
                // Update episode view counts
                history.forEach(item => {
                    const episode = this.episodes.find(ep => ep.id === item.id);
                    if (episode) {
                        episode.views = item.views || 0;
                    }
                });
                
                // Extract user preferences based on viewing history
                this.extractUserPreferences(history);
            } catch (e) {
                console.error('Error parsing viewing history:', e);
            }
        }
        
        // Load episode ratings
        const ratings = localStorage.getItem('crimeTimeSnacks_episodeRatings');
        if (ratings) {
            try {
                const ratingData = JSON.parse(ratings);
                
                // Update episode ratings
                Object.entries(ratingData).forEach(([id, rating]) => {
                    const episode = this.episodes.find(ep => ep.id === id);
                    if (episode) {
                        episode.rating = rating;
                    }
                });
            } catch (e) {
                console.error('Error parsing episode ratings:', e);
            }
        }
    }
    
    extractUserPreferences(history) {
        this.userPreferences = {
            categories: {},
            keywords: {}
        };
        
        // Count category preferences
        history.forEach(item => {
            const episode = this.episodes.find(ep => ep.id === item.id);
            if (episode) {
                // Update category preferences
                episode.categories.forEach(category => {
                    if (!this.userPreferences.categories[category]) {
                        this.userPreferences.categories[category] = 0;
                    }
                    this.userPreferences.categories[category] += item.views || 1;
                });
                
                // Extract keywords from title and description
                const keywords = this.extractKeywords(episode.title + ' ' + episode.description);
                keywords.forEach(keyword => {
                    if (!this.userPreferences.keywords[keyword]) {
                        this.userPreferences.keywords[keyword] = 0;
                    }
                    this.userPreferences.keywords[keyword] += item.views || 1;
                });
            }
        });
    }
    
    extractKeywords(text) {
        // Simple keyword extraction - remove common words and split by spaces
        const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'like', 'through', 'over', 'before', 'between', 'after', 'since', 'without', 'under', 'within', 'along', 'following', 'across', 'behind', 'beyond', 'plus', 'except', 'but', 'up', 'out', 'around', 'down', 'off', 'above', 'near', 'a', 'an', 'of', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could'];
        
        return text.toLowerCase()
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .split(/\s+/) // Split by whitespace
            .filter(word => word.length > 3 && !commonWords.includes(word)); // Filter out common words and short words
    }
    
    initRecommendationUI() {
        document.addEventListener('DOMContentLoaded', () => {
            // Track episode views
            this.trackEpisodeViews();
            
            // Add rating UI to episode pages
            this.addRatingUI();
            
            // Add recommendation sections
            this.addRecommendationSections();
            
            // Generate recommendations
            this.generateRecommendations();
        });
    }
    
    trackEpisodeViews() {
        // Check if we're on an episode page
        const episodeContent = document.querySelector('.episode-content');
        if (episodeContent) {
            const episodeId = episodeContent.getAttribute('data-episode-id') || 
                              window.location.pathname.split('/').pop().replace('.html', '');
            
            if (episodeId) {
                // Load viewing history
                let history = [];
                const viewingHistory = localStorage.getItem('crimeTimeSnacks_viewingHistory');
                if (viewingHistory) {
                    try {
                        history = JSON.parse(viewingHistory);
                    } catch (e) {
                        console.error('Error parsing viewing history:', e);
                    }
                }
                
                // Update or add episode view
                const existingEntry = history.find(item => item.id === episodeId);
                if (existingEntry) {
                    existingEntry.views = (existingEntry.views || 0) + 1;
                    existingEntry.lastViewed = new Date().toISOString();
                } else {
                    history.push({
                        id: episodeId,
                        views: 1,
                        lastViewed: new Date().toISOString()
                    });
                }
                
                // Save updated history
                localStorage.setItem('crimeTimeSnacks_viewingHistory', JSON.stringify(history));
            }
        }
    }
    
    addRatingUI() {
        // Check if we're on an episode page
        const episodeContent = document.querySelector('.episode-content');
        if (episodeContent) {
            const episodeId = episodeContent.getAttribute('data-episode-id') || 
                              window.location.pathname.split('/').pop().replace('.html', '');
            
            if (episodeId) {
                // Create rating UI
                const ratingContainer = document.createElement('div');
                ratingContainer.className = 'episode-rating';
                ratingContainer.innerHTML = `
                    <h4>Rate this episode:</h4>
                    <div class="rating-stars">
                        <i class="far fa-star" data-rating="1"></i>
                        <i class="far fa-star" data-rating="2"></i>
                        <i class="far fa-star" data-rating="3"></i>
                        <i class="far fa-star" data-rating="4"></i>
                        <i class="far fa-star" data-rating="5"></i>
                    </div>
                    <div class="rating-message"></div>
                `;
                
                // Add to page
                const insertPoint = document.querySelector('.episode-actions') || episodeContent;
                insertPoint.appendChild(ratingContainer);
                
                // Load existing rating
                let ratings = {};
                const savedRatings = localStorage.getItem('crimeTimeSnacks_episodeRatings');
                if (savedRatings) {
                    try {
                        ratings = JSON.parse(savedRatings);
                        
                        // Update UI if episode was previously rated
                        if (ratings[episodeId]) {
                            this.updateRatingUI(ratingContainer, ratings[episodeId]);
                        }
                    } catch (e) {
                        console.error('Error parsing episode ratings:', e);
                    }
                }
                
                // Add event listeners to stars
                const stars = ratingContainer.querySelectorAll('.rating-stars i');
                stars.forEach(star => {
                    star.addEventListener('click', () => {
                        const rating = parseInt(star.getAttribute('data-rating'));
                        
                        // Update UI
                        this.updateRatingUI(ratingContainer, rating);
                        
                        // Save rating
                        ratings[episodeId] = rating;
                        localStorage.setItem('crimeTimeSnacks_episodeRatings', JSON.stringify(ratings));
                        
                        // Show thank you message
                        const messageElement = ratingContainer.querySelector('.rating-message');
                        messageElement.textContent = 'Thanks for your rating!';
                        setTimeout(() => {
                            messageElement.textContent = '';
                        }, 3000);
                    });
                    
                    // Hover effects
                    star.addEventListener('mouseenter', () => {
                        const rating = parseInt(star.getAttribute('data-rating'));
                        stars.forEach((s, i) => {
                            if (i < rating) {
                                s.classList.remove('far');
                                s.classList.add('fas');
                            }
                        });
                    });
                    
                    star.addEventListener('mouseleave', () => {
                        // Reset to saved rating or no rating
                        const savedRating = ratings[episodeId] || 0;
                        this.updateRatingUI(ratingContainer, savedRating);
                    });
                });
            }
        }
    }
    
    updateRatingUI(container, rating) {
        const stars = container.querySelectorAll('.rating-stars i');
        stars.forEach((star, i) => {
            if (i < rating) {
                star.classList.remove('far');
                star.classList.add('fas');
            } else {
                star.classList.remove('fas');
                star.classList.add('far');
            }
        });
    }
    
    addRecommendationSections() {
        // Add "You Might Also Like" section to episode pages
        const episodeContent = document.querySelector('.episode-content');
        if (episodeContent) {
            const recommendationsSection = document.createElement('div');
            recommendationsSection.className = 'recommendations-section';
            recommendationsSection.innerHTML = `
                <h3>You Might Also Like</h3>
                <div id="episode-recommendations" class="recommendations-container">
                    <div class="loading-spinner">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Finding recommendations for you...</p>
                    </div>
                </div>
            `;
            
            // Add to page
            episodeContent.appendChild(recommendationsSection);
        }
        
        // Add "Continue Listening" section to homepage
        const mainContent = document.querySelector('.main-content');
        if (mainContent && window.location.pathname === '/' || window.location.pathname.endsWith('index.html')) {
            const continueSection = document.createElement('div');
            continueSection.className = 'continue-listening-section';
            continueSection.innerHTML = `
                <h3>Continue Listening</h3>
                <div id="continue-listening" class="continue-listening-container"></div>
            `;
            
            // Insert at the beginning of main content
            mainContent.insertBefore(continueSection, mainContent.firstChild);
        }
        
        // Add "Popular Episodes" section to homepage
        if (mainContent && window.location.pathname === '/' || window.location.pathname.endsWith('index.html')) {
            const popularSection = document.createElement('div');
            popularSection.className = 'popular-episodes-section';
            popularSection.innerHTML = `
                <h3>Popular Episodes</h3>
                <div id="popular-episodes" class="popular-episodes-container"></div>
            `;
            
            // Insert after featured episodes
            const featuredSection = document.querySelector('.featured-episodes') || mainContent.firstChild;
            mainContent.insertBefore(popularSection, featuredSection.nextSibling);
        }
    }
    
    generateRecommendations() {
        // Generate recommendations for episode pages
        const episodeContent = document.querySelector('.episode-content');
        if (episodeContent) {
            const episodeId = episodeContent.getAttribute('data-episode-id') || 
                              window.location.pathname.split('/').pop().replace('.html', '');
            
            if (episodeId) {
                this.generateEpisodeRecommendations(episodeId);
            }
        }
        
        // Generate "Continue Listening" section
        const continueContainer = document.getElementById('continue-listening');
        if (continueContainer) {
            this.generateContinueListening(continueContainer);
        }
        
        // Generate "Popular Episodes" section
        const popularContainer = document.getElementById('popular-episodes');
        if (popularContainer) {
            this.generatePopularEpisodes(popularContainer);
        }
    }
    
    generateEpisodeRecommendations(currentEpisodeId) {
        const recommendationsContainer = document.getElementById('episode-recommendations');
        if (!recommendationsContainer) return;
        
        // Find current episode
        const currentEpisode = this.episodes.find(ep => ep.id === currentEpisodeId);
        if (!currentEpisode) {
            recommendationsContainer.innerHTML = '<p>No recommendations available</p>';
            return;
        }
        
        // Calculate similarity scores for all other episodes
        const recommendations = this.episodes
            .filter(ep => ep.id !== currentEpisodeId) // Exclude current episode
            .map(episode => {
                return {
                    episode: episode,
                    score: this.calculateSimilarityScore(currentEpisode, episode)
                };
            })
            .sort((a, b) => b.score - a.score) // Sort by score descending
            .slice(0, 3); // Take top 3
        
        // Display recommendations
        if (recommendations.length > 0) {
            let html = '<div class="recommendations-grid">';
            
            recommendations.forEach(rec => {
                html += `
                    <div class="recommendation-card">
                        <a href="${rec.episode.link || `/${rec.episode.id}.html`}">
                            <div class="recommendation-image">
                                <img src="${rec.episode.image || '/images/default-episode.jpg'}" alt="${rec.episode.title}">
                            </div>
                            <h4>${rec.episode.title}</h4>
                            <div class="recommendation-categories">
                                ${rec.episode.categories.map(cat => `<span class="episode-badge">${cat}</span>`).join('')}
                            </div>
                        </a>
                    </div>
                `;
            });
            
            html += '</div>';
            recommendationsContainer.innerHTML = html;
        } else {
            recommendationsContainer.innerHTML = '<p>No recommendations available</p>';
        }
    }
    
    calculateSimilarityScore(episode1, episode2) {
        let score = 0;
        
        // Category match (highest weight)
        const commonCategories = episode1.categories.filter(cat => episode2.categories.includes(cat));
        score += commonCategories.length * 10;
        
        // Keyword match from title and description
        const keywords1 = this.extractKeywords(episode1.title + ' ' + episode1.description);
        const keywords2 = this.extractKeywords(episode2.title + ' ' + episode2.description);
        const commonKeywords = keywords1.filter(kw => keywords2.includes(kw));
        score += commonKeywords.length * 5;
        
        // User preference boost
        if (episode2.views > 0) {
            score += Math.min(episode2.views * 2, 10); // Cap at 10 points
        }
        
        if (episode2.rating > 0) {
            score += episode2.rating; // Add rating points (1-5)
        }
        
        return score;
    }
    
    generateContinueListening(container) {
        if (!container) return;
        
        // Load viewing history
        const viewingHistory = localStorage.getItem('crimeTimeSnacks_viewingHistory');
        if (!viewingHistory) {
            container.parentElement.style.display = 'none';
            return;
        }
        
        try {
            const history = JSON.parse(viewingHistory);
            
            // Sort by last viewed date
            history.sort((a, b) => {
                return new Date(b.lastViewed) - new Date(a.lastViewed);
            });
            
            // Take most recent 3
            const recentHistory = history.slice(0, 3);
            
            if (recentHistory.length === 0) {
                container.parentElement.style.display = 'none';
                return;
            }
            
            let html = '<div class="continue-listening-grid">';
            
            recentHistory.forEach(item => {
                const episode = this.episodes.find(ep => ep.id === item.id);
                if (episode) {
                    html += `
                        <div class="continue-card">
                            <a href="${episode.link || `/${episode.id}.html`}">
                                <div class="continue-image">
                                    <img src="${episode.image || '/images/default-episode.jpg'}" alt="${episode.title}">
                                    <div class="continue-overlay">
                                        <i class="fas fa-play-circle"></i>
                                    </div>
                                </div>
                                <div class="continue-info">
                                    <h4>${episode.title}</h4>
                                    <p class="continue-last-played">Last played: ${this.formatDate(item.lastViewed)}</p>
                                </div>
                            </a>
                        </div>
                    `;
                }
            });
            
            html += '</div>';
            container.innerHTML = html;
        } catch (e) {
            console.error('Error generating continue listening section:', e);
            container.parentElement.style.display = 'none';
        }
    }
    
    generatePopularEpisodes(container) {
        if (!container) return;
        
        // Sort episodes by views and rating
        const popularEpisodes = [...this.episodes]
            .sort((a, b) => {
                // Calculate popularity score (views + rating*5)
                const scoreA = a.views + (a.rating * 5);
                const scoreB = b.views + (b.rating * 5);
                return scoreB - scoreA;
            })
            .slice(0, 3); // Take top 3
        
        if (popularEpisodes.length === 0) {
            container.parentElement.style.display = 'none';
            return;
        }
        
        let html = '<div class="popular-episodes-grid">';
        
        popularEpisodes.forEach(episode => {
            html += `
                <div class="popular-card">
                    <a href="${episode.link || `/${episode.id}.html`}">
                        <div class="popular-image">
                            <img src="${episode.image || '/images/default-episode.jpg'}" alt="${episode.title}">
                            <div class="popular-badge">
                                <i class="fas fa-fire"></i> Popular
                            </div>
                        </div>
                        <div class="popular-info">
                            <h4>${episode.title}</h4>
                            <div class="popular-meta">
                                ${this.generateRatingStars(episode.rating)}
                                <span class="popular-views">${episode.views} ${episode.views === 1 ? 'view' : 'views'}</span>
                            </div>
                        </div>
                    </a>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }
    
    generateRatingStars(rating) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) {
                stars += '<i class="fas fa-star"></i>';
            } else {
                stars += '<i class="far fa-star"></i>';
            }
        }
        return `<div class="rating-display">${stars}</div>`;
    }
    
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
}

// Initialize recommendation system
document.addEventListener('DOMContentLoaded', () => {
    const recommendationSystem = new RecommendationSystem();
    recommendationSystem.init().then(success => {
        if (success) {
            console.log('Recommendation system initialized successfully');
        } else {
            console.warn('Recommendation system initialization failed');
        }
    });
});

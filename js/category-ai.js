// AI-Powered Category System for CrimeTimeSnacks

class CategoryAI {
    constructor() {
        this.categories = [
            'murder', 
            'unsolved', 
            'serial-killer', 
            'famous', 
            'recent',
            'cold-case',
            'solved',
            'investigation',
            'family',
            'international'
        ];
        
        this.categoryDescriptions = {
            'murder': 'Cases involving homicide as the primary crime',
            'unsolved': 'Cases that remain unsolved to this day',
            'serial-killer': 'Cases involving perpetrators with multiple victims over time',
            'famous': 'Well-known cases that received significant media attention',
            'recent': 'Cases from the last 5 years',
            'cold-case': 'Cases that went unsolved for many years before resolution',
            'solved': 'Cases where the perpetrator has been identified and convicted',
            'investigation': 'Cases with notable investigative techniques or challenges',
            'family': 'Cases involving family members as victims or perpetrators',
            'international': 'Cases that occurred outside the United States'
        };
        
        this.keywordMap = {
            'murder': ['murder', 'killed', 'homicide', 'stabbed', 'shot', 'strangled', 'death'],
            'unsolved': ['unsolved', 'mystery', 'unknown', 'unidentified', 'cold case', 'no suspect'],
            'serial-killer': ['serial', 'multiple victims', 'pattern', 'multiple murders', 'killing spree'],
            'famous': ['famous', 'well-known', 'high-profile', 'media', 'notorious', 'headline'],
            'recent': ['2020', '2021', '2022', '2023', '2024', '2025', 'recent', 'new'],
            'cold-case': ['cold case', 'years later', 'decades', 'reopened', 'old case'],
            'solved': ['solved', 'convicted', 'arrested', 'sentenced', 'prison', 'guilty'],
            'investigation': ['investigation', 'evidence', 'forensic', 'detective', 'police work'],
            'family': ['family', 'husband', 'wife', 'child', 'parent', 'sibling', 'domestic'],
            'international': ['international', 'foreign', 'abroad', 'overseas', 'country']
        };
        
        // Case-specific mappings for the existing episodes
        this.caseSpecificMappings = {
            'moscow-murders': ['murder', 'recent', 'solved', 'investigation'],
            'menendez-brothers': ['murder', 'famous', 'family', 'solved'],
            'jonbenet-ramsey': ['murder', 'unsolved', 'famous', 'cold-case', 'family'],
            'watts-family-murders': ['murder', 'family', 'solved', 'recent'],
            'delphi-murder-case': ['murder', 'unsolved', 'investigation'],
            'courtney-clenney': ['murder', 'recent', 'investigation']
        };
    }
    
    // Analyze content and assign categories
    analyzeCaseContent(title, description) {
        const combinedText = (title + ' ' + description).toLowerCase();
        const assignedCategories = [];
        
        // Check for each category's keywords
        for (const category in this.keywordMap) {
            const keywords = this.keywordMap[category];
            for (const keyword of keywords) {
                if (combinedText.includes(keyword.toLowerCase())) {
                    if (!assignedCategories.includes(category)) {
                        assignedCategories.push(category);
                    }
                    break;
                }
            }
        }
        
        // If no categories were found, assign 'murder' as default
        if (assignedCategories.length === 0) {
            assignedCategories.push('murder');
        }
        
        return assignedCategories;
    }
    
    // Get categories for a specific case by ID
    getCategoriesForCase(caseId) {
        // Check if we have specific mappings for this case
        if (this.caseSpecificMappings[caseId]) {
            return this.caseSpecificMappings[caseId];
        }
        
        // If not, we'll need to analyze the content
        // This would typically be done with the episode content
        // For now, return some default categories
        return ['murder', 'investigation'];
    }
    
    // Add a new case with its categories
    addCaseMapping(caseId, categories) {
        this.caseSpecificMappings[caseId] = categories;
    }
    
    // Get all available categories
    getAllCategories() {
        return this.categories;
    }
    
    // Get category description
    getCategoryDescription(category) {
        return this.categoryDescriptions[category] || 'Cases related to ' + category;
    }
    
    // Generate category badges HTML
    generateCategoryBadgesHTML(categories) {
        let html = '<div class="episode-badges">';
        categories.forEach(category => {
            html += `<span class="episode-badge">${this.formatCategoryName(category)}</span>`;
        });
        html += '</div>';
        return html;
    }
    
    // Format category name for display (capitalize, replace hyphens)
    formatCategoryName(category) {
        return category
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    
    // Suggest related categories based on current selection
    suggestRelatedCategories(currentCategory) {
        // Define related category pairs
        const relatedCategories = {
            'murder': ['solved', 'unsolved', 'investigation'],
            'unsolved': ['cold-case', 'investigation', 'murder'],
            'serial-killer': ['murder', 'famous', 'investigation'],
            'famous': ['murder', 'solved', 'unsolved'],
            'recent': ['murder', 'investigation', 'solved'],
            'cold-case': ['unsolved', 'investigation', 'famous'],
            'solved': ['murder', 'investigation', 'famous'],
            'investigation': ['murder', 'unsolved', 'solved'],
            'family': ['murder', 'solved', 'recent'],
            'international': ['murder', 'unsolved', 'famous']
        };
        
        return relatedCategories[currentCategory] || ['murder', 'investigation', 'famous'];
    }
    
    // Analyze episode content and update data-categories attribute
    processEpisodeElements() {
        const episodeCards = document.querySelectorAll('.episode-card');
        
        episodeCards.forEach(card => {
            // Skip if already has data-categories
            if (card.getAttribute('data-categories')) {
                return;
            }
            
            const titleElement = card.querySelector('.episode-title');
            const descriptionElement = card.querySelector('.episode-description');
            
            if (titleElement && descriptionElement) {
                const title = titleElement.textContent;
                const description = descriptionElement.textContent;
                
                // Get episode ID from link if available
                let episodeId = '';
                const linkElement = card.querySelector('a[href^="episodes/"]');
                if (linkElement) {
                    const href = linkElement.getAttribute('href');
                    episodeId = href.split('/').pop().replace('.html', '');
                }
                
                // Get categories
                let categories;
                if (episodeId && this.caseSpecificMappings[episodeId]) {
                    categories = this.caseSpecificMappings[episodeId];
                } else {
                    categories = this.analyzeCaseContent(title, description);
                }
                
                // Update data attribute
                card.setAttribute('data-categories', categories.join(','));
                
                // Add category badges if they don't exist
                if (!card.querySelector('.episode-badges')) {
                    const badgesHTML = this.generateCategoryBadgesHTML(categories);
                    const contentElement = card.querySelector('.episode-content');
                    if (contentElement) {
                        contentElement.insertAdjacentHTML('afterbegin', badgesHTML);
                    }
                }
            }
        });
    }
    
    // Initialize category filtering
    initCategoryFiltering() {
        // Process all episode elements
        this.processEpisodeElements();
        
        // Set up category buttons
        const categoryContainer = document.querySelector('.category-filters');
        if (!categoryContainer) return;
        
        // Clear existing buttons
        categoryContainer.innerHTML = '';
        
        // Add "All Cases" button
        const allButton = document.createElement('button');
        allButton.className = 'category-btn active';
        allButton.setAttribute('data-category', 'all');
        allButton.textContent = 'All Cases';
        categoryContainer.appendChild(allButton);
        
        // Add buttons for each category
        this.categories.forEach(category => {
            const button = document.createElement('button');
            button.className = 'category-btn';
            button.setAttribute('data-category', category);
            button.textContent = this.formatCategoryName(category);
            categoryContainer.appendChild(button);
        });
        
        // Add event listeners
        const categoryBtns = document.querySelectorAll('.category-btn');
        const episodeCards = document.querySelectorAll('.episode-card');
        
        categoryBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.getAttribute('data-category');
                
                // Update active button
                categoryBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Filter episodes
                episodeCards.forEach(card => {
                    if (category === 'all') {
                        card.style.display = 'block';
                    } else {
                        const cardCategories = card.getAttribute('data-categories');
                        if (cardCategories && cardCategories.includes(category)) {
                            card.style.display = 'block';
                        } else {
                            card.style.display = 'none';
                        }
                    }
                });
                
                // Update related categories suggestion
                if (category !== 'all') {
                    this.showRelatedCategoriesSuggestion(category);
                } else {
                    this.hideRelatedCategoriesSuggestion();
                }
            });
        });
    }
    
    // Show related categories suggestion
    showRelatedCategoriesSuggestion(category) {
        // Remove existing suggestion
        this.hideRelatedCategoriesSuggestion();
        
        const relatedCategories = this.suggestRelatedCategories(category);
        const categoryContainer = document.querySelector('.category-filters');
        
        if (categoryContainer && relatedCategories.length > 0) {
            const suggestionDiv = document.createElement('div');
            suggestionDiv.className = 'related-categories';
            suggestionDiv.innerHTML = `
                <p>Related categories: ${relatedCategories.map(cat => 
                    `<button class="category-suggestion" data-category="${cat}">${this.formatCategoryName(cat)}</button>`
                ).join(' ')}
                </p>
            `;
            
            categoryContainer.parentNode.insertBefore(suggestionDiv, categoryContainer.nextSibling);
            
            // Add event listeners to suggestion buttons
            document.querySelectorAll('.category-suggestion').forEach(btn => {
                btn.addEventListener('click', () => {
                    const suggestedCategory = btn.getAttribute('data-category');
                    document.querySelector(`.category-btn[data-category="${suggestedCategory}"]`).click();
                });
            });
        }
    }
    
    // Hide related categories suggestion
    hideRelatedCategoriesSuggestion() {
        const existingSuggestion = document.querySelector('.related-categories');
        if (existingSuggestion) {
            existingSuggestion.remove();
        }
    }
    
    // Initialize the AI category system
    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.initCategoryFiltering();
            
            // Add category filter to search
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    const searchTerm = searchInput.value.toLowerCase();
                    
                    // Check if search term matches any category
                    let matchedCategory = null;
                    for (const category of this.categories) {
                        if (category.includes(searchTerm) || 
                            this.formatCategoryName(category).toLowerCase().includes(searchTerm)) {
                            matchedCategory = category;
                            break;
                        }
                    }
                    
                    // If matched a category, suggest using that filter
                    if (matchedCategory && searchTerm.length > 2) {
                        const searchContainer = searchInput.parentElement;
                        let suggestionElement = searchContainer.querySelector('.search-category-suggestion');
                        
                        if (!suggestionElement) {
                            suggestionElement = document.createElement('div');
                            suggestionElement.className = 'search-category-suggestion';
                            searchContainer.appendChild(suggestionElement);
                        }
                        
                        suggestionElement.innerHTML = `
                            Looking for <button class="category-suggestion-btn" data-category="${matchedCategory}">
                                ${this.formatCategoryName(matchedCategory)}
                            </button> cases?
                        `;
                        
                        // Add click event
                        const suggestionBtn = suggestionElement.querySelector('.category-suggestion-btn');
                        if (suggestionBtn) {
                            suggestionBtn.addEventListener('click', () => {
                                document.querySelector(`.category-btn[data-category="${matchedCategory}"]`).click();
                                searchInput.value = '';
                                suggestionElement.remove();
                            });
                        }
                    } else {
                        // Remove suggestion if exists
                        const suggestionElement = searchInput.parentElement.querySelector('.search-category-suggestion');
                        if (suggestionElement) {
                            suggestionElement.remove();
                        }
                    }
                });
            }
        });
    }
}

// Initialize the category AI system
const categoryAI = new CategoryAI();
categoryAI.init();

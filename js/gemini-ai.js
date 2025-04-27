// AI-powered features using Gemini API for CrimeTimeSnacks

class GeminiAI {
    constructor() {
        this.apiKey = null;
        this.isInitialized = false;
        this.useMockData = false;
    }
    
    async init() {
        try {
            // Load environment variables
            const env = await this.loadEnvVariables();
            this.apiKey = env.GEMINI_API_KEY;
            
            if (!this.apiKey) {
                console.warn('Gemini API key not found. Using mock data for AI features.');
                this.useMockData = true;
            }
            
            this.isInitialized = true;
            
            // Initialize features
            this.initRecommendationSystem();
            this.initTranscriptGeneration();
            this.initCaseSummarization();
            this.initSmartSearch();
            
            return true;
        } catch (error) {
            console.error('Error initializing GeminiAI:', error);
            return false;
        }
    }
    
    async loadEnvVariables() {
        // Check if we have the API key in localStorage (for development)
        const storedApiKey = localStorage.getItem('GEMINI_API_KEY');
        if (storedApiKey) {
            return {
                GEMINI_API_KEY: storedApiKey
            };
        }
        
        // Try to load from .env file using fetch
        return fetch('/.env')
            .then(response => response.text())
            .then(text => {
                const env = {};
                text.split('\n').forEach(line => {
                    const parts = line.split('=');
                    if (parts.length === 2) {
                        const key = parts[0].trim();
                        const value = parts[1].trim();
                        env[key] = value;
                    }
                });
                return env;
            })
            .catch(error => {
                console.error('Error loading .env file:', error);
                // Return empty object if .env file can't be loaded
                return {};
            });
    }
    
    async callGeminiAPI(prompt) {
        if (this.useMockData) {
            // Return mock data if API key is not available
            return this.getMockResponse(prompt);
        }
        
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });
            
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }
            
            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error('Error calling Gemini API:', error);
            return this.getMockResponse(prompt);
        }
    }
    
    getMockResponse(prompt) {
        // Return mock responses based on the type of prompt
        if (prompt.includes('recommend') || prompt.includes('similar episodes')) {
            return this.getMockRecommendations();
        } else if (prompt.includes('transcript') || prompt.includes('transcribe')) {
            return this.getMockTranscript();
        } else if (prompt.includes('summarize') || prompt.includes('summary')) {
            return this.getMockSummary();
        } else {
            return "I'm sorry, I couldn't process that request at the moment. Please try again later.";
        }
    }
    
    // Recommendation System
    initRecommendationSystem() {
        document.addEventListener('DOMContentLoaded', () => {
            // Check if we're on an episode page
            const episodeContent = document.querySelector('.episode-content');
            if (episodeContent) {
                this.generateRecommendations();
            }
            
            // Set up recommendation button listeners
            const recommendationButtons = document.querySelectorAll('.get-recommendations-btn');
            recommendationButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    const episodeTitle = button.getAttribute('data-episode-title');
                    const episodeDescription = button.getAttribute('data-episode-description');
                    this.generateRecommendations(episodeTitle, episodeDescription);
                });
            });
        });
    }
    
    async generateRecommendations(title, description) {
        // If no title/description provided, try to get from current page
        if (!title || !description) {
            const titleElement = document.querySelector('.episode-title');
            const descriptionElement = document.querySelector('.episode-description');
            
            if (titleElement && descriptionElement) {
                title = titleElement.textContent;
                description = descriptionElement.textContent;
            } else {
                console.error('Could not find episode information for recommendations');
                return;
            }
        }
        
        const recommendationsContainer = document.getElementById('recommendations-container');
        if (!recommendationsContainer) return;
        
        // Show loading state
        recommendationsContainer.innerHTML = `
            <div class="loading-indicator">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Generating personalized recommendations...</p>
            </div>
        `;
        
        try {
            const prompt = `Based on this true crime episode titled "${title}" with the following description: "${description}", 
            suggest 3 similar true crime cases that listeners might be interested in. 
            Format the response as a JSON array with objects containing:
            - title: A descriptive title for the case
            - description: A brief 1-2 sentence description
            - type: The type of crime (e.g., "Murder", "Disappearance", "Fraud")
            - year: The year the crime occurred
            
            Make the recommendations diverse but relevant to the themes and elements of the original case.`;
            
            const response = await this.callGeminiAPI(prompt);
            
            // Extract JSON from the response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                throw new Error('Could not extract JSON from API response');
            }
            
            const recommendations = JSON.parse(jsonMatch[0]);
            this.displayRecommendations(recommendations, recommendationsContainer);
        } catch (error) {
            console.error('Error generating recommendations:', error);
            recommendationsContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Sorry, we couldn't generate recommendations at this time. Please try again later.</p>
                </div>
            `;
        }
    }
    
    displayRecommendations(recommendations, container) {
        if (!container) return;
        
        let html = `
            <h3><i class="fas fa-lightbulb"></i> You Might Also Be Interested In</h3>
            <div class="recommendations-grid">
        `;
        
        recommendations.forEach(rec => {
            html += `
                <div class="recommendation-card">
                    <div class="recommendation-type">${rec.type}</div>
                    <h4>${rec.title}</h4>
                    <p class="recommendation-year">${rec.year}</p>
                    <p>${rec.description}</p>
                </div>
            `;
        });
        
        html += `
            </div>
            <p class="ai-powered-note"><i class="fas fa-robot"></i> Powered by AI based on your interests</p>
        `;
        
        container.innerHTML = html;
    }
    
    getMockRecommendations() {
        return `[
            {
                "title": "The Zodiac Killer: America's Most Elusive Serial Killer",
                "description": "The case of the Zodiac Killer who terrorized Northern California in the late 1960s, sending taunting letters and cryptic ciphers to local newspapers while evading capture.",
                "type": "Serial Killer",
                "year": "1968-1969"
            },
            {
                "title": "The Disappearance of Maura Murray",
                "description": "College student Maura Murray vanished after a car accident in rural New Hampshire in 2004, leaving behind puzzling clues and theories ranging from voluntary disappearance to foul play.",
                "type": "Disappearance",
                "year": "2004"
            },
            {
                "title": "The Golden State Killer: Solved Through DNA",
                "description": "How investigators used genetic genealogy to identify Joseph James DeAngelo as the Golden State Killer, responsible for at least 13 murders and 50 rapes across California.",
                "type": "Cold Case Solved",
                "year": "1974-1986"
            }
        ]`;
    }
    
    // Transcript Generation
    initTranscriptGeneration() {
        document.addEventListener('DOMContentLoaded', () => {
            const generateTranscriptButtons = document.querySelectorAll('.generate-transcript-btn');
            generateTranscriptButtons.forEach(button => {
                button.addEventListener('click', async (e) => {
                    e.preventDefault();
                    
                    const episodeTitle = button.getAttribute('data-episode-title');
                    const audioSrc = button.getAttribute('data-audio-src');
                    const transcriptContainer = document.getElementById('transcript-container');
                    
                    if (!transcriptContainer) return;
                    
                    // Show loading state
                    transcriptContainer.innerHTML = `
                        <div class="loading-indicator">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Generating transcript...</p>
                        </div>
                    `;
                    
                    try {
                        await this.generateTranscript(episodeTitle, audioSrc, transcriptContainer);
                    } catch (error) {
                        console.error('Error generating transcript:', error);
                        transcriptContainer.innerHTML = `
                            <div class="error-message">
                                <i class="fas fa-exclamation-triangle"></i>
                                <p>Sorry, we couldn't generate a transcript at this time. Please try again later.</p>
                            </div>
                        `;
                    }
                });
            });
        });
    }
    
    async generateTranscript(episodeTitle, audioSrc, container) {
        if (!container) return;
        
        try {
            const prompt = `Create a realistic transcript for a true crime podcast episode titled "${episodeTitle}". 
            The transcript should include:
            1. An introduction by the host
            2. Discussion of the key facts of the case
            3. Analysis of evidence and investigation
            4. Quotes from relevant parties (clearly marked)
            5. Conclusion with remaining questions or resolution
            
            Format the transcript with timestamps (e.g., [00:01:25]) and speaker labels (e.g., "Host:", "Guest:").
            Keep the content factual, respectful to victims, and in the style of a professional true crime podcast.
            The transcript should be approximately 500-800 words.`;
            
            const response = await this.callGeminiAPI(prompt);
            this.displayTranscript(response, container);
        } catch (error) {
            console.error('Error generating transcript:', error);
            throw error;
        }
    }
    
    displayTranscript(transcript, container) {
        if (!container) return;
        
        container.innerHTML = `
            <div class="transcript-content">
                <div class="transcript-header">
                    <h3><i class="fas fa-file-alt"></i> Episode Transcript</h3>
                    <button class="btn btn-secondary btn-sm" onclick="window.print()">
                        <i class="fas fa-print"></i> Print
                    </button>
                </div>
                <div class="transcript-text">
                    ${transcript.replace(/\n/g, '<br>')}
                </div>
                <p class="ai-powered-note"><i class="fas fa-robot"></i> Transcript generated by AI</p>
            </div>
        `;
    }
    
    getMockTranscript() {
        return `[00:00:00] Host: Welcome to CrimeTimeSnacks, the podcast where we dive deep into the cases that have captivated and horrified the nation. I'm your host, Cory, and today we're covering a case that shocked a small college town and left four families devastated.

[00:00:18] Host: In the early morning hours of November 13, 2022, four University of Idaho students - Kaylee Goncalves, Madison Mogen, Xana Kernodle, and Ethan Chapin - were brutally stabbed to death in their off-campus home in Moscow, Idaho. What followed was a massive investigation that would eventually lead to the arrest of Bryan Kohberger, a criminology PhD student from nearby Washington State University.

[00:00:42] Host: Before we get into the details, I want to remind our listeners that we approach these cases with respect for the victims and their families. Our goal is to understand what happened and why, not to sensationalize tragedy.

[00:00:55] Host: Let's start with what we know about that night. Kaylee and Madison had been out at a local bar called Corner Club, while Ethan and Xana attended a party at the Sigma Chi fraternity house. All four returned to the girls' rental home on King Road by 2 AM.

[00:01:12] Host: Two other roommates were also in the house that night but were unharmed. One of them later told police she heard what sounded like crying around 4 AM and when she looked out of her room, she saw a figure dressed in black with a mask covering their face.

[00:01:28] Guest: Detective Sarah Johnson: "What made this case particularly challenging was the lack of forced entry. There was no sign of robbery or sexual assault. It appeared the killer had targeted these specific individuals for reasons we couldn't immediately determine."

[00:01:43] Host: The murder weapon, believed to be a large fixed-blade knife, was never found. However, investigators did recover a tan leather knife sheath beside one of the victims' bodies. This would later prove crucial to the case.

[00:01:57] Host: For weeks, the community was on edge. Students fled campus, residents armed themselves, and rumors spread like wildfire. The police remained tight-lipped about potential suspects, leading to frustration from the public and the victims' families.

[00:02:13] Host: The breakthrough came when investigators identified a white Hyundai Elantra that had been captured on surveillance footage near the victims' residence around the time of the murders. This led them to Bryan Kohberger.

[00:02:26] Host: Kohberger was arrested at his parents' home in Pennsylvania on December 30, 2022. DNA evidence from the knife sheath matched a sample taken from Kohberger's trash. Cell phone data also placed him near the victims' home at least a dozen times before the murders.

[00:02:44] Guest: Criminal Psychologist Dr. Emily Rivera: "What's particularly disturbing in this case is that Kohberger was studying criminal justice and criminology. He was literally studying the very type of crime he's accused of committing. This raises fascinating questions about whether his academic interest was driven by darker impulses."

[00:03:03] Host: One of the most perplexing aspects of this case is the apparent lack of connection between Kohberger and the victims. Investigators have not been able to establish any prior relationship, leaving the question of motive largely unanswered.

[00:03:17] Host: Kohberger has been charged with four counts of first-degree murder and one count of felony burglary. If convicted, he could face the death penalty. His trial is expected to be one of the most closely watched criminal cases in recent years.

[00:03:32] Host: As we wrap up today's episode, we're left with many questions. What drove someone with no apparent connection to these students to commit such a horrific crime? How did a student of criminology end up on the wrong side of the law? And will the upcoming trial finally provide answers to the victims' families?

[00:03:51] Host: Thank you for listening to CrimeTimeSnacks. If you have thoughts on this case or suggestions for future episodes, reach out to us on social media. Until next time, stay safe and stay informed.`;
    }
    
    // Case Summarization
    initCaseSummarization() {
        document.addEventListener('DOMContentLoaded', () => {
            const summarizeButtons = document.querySelectorAll('.summarize-case-btn');
            summarizeButtons.forEach(button => {
                button.addEventListener('click', async (e) => {
                    e.preventDefault();
                    
                    const caseTitle = button.getAttribute('data-case-title');
                    const caseContent = button.getAttribute('data-case-content');
                    const summaryContainer = document.getElementById('case-summary-container');
                    
                    if (!summaryContainer) return;
                    
                    // Show loading state
                    summaryContainer.innerHTML = `
                        <div class="loading-indicator">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Generating case summary...</p>
                        </div>
                    `;
                    
                    try {
                        await this.generateCaseSummary(caseTitle, caseContent, summaryContainer);
                    } catch (error) {
                        console.error('Error generating case summary:', error);
                        summaryContainer.innerHTML = `
                            <div class="error-message">
                                <i class="fas fa-exclamation-triangle"></i>
                                <p>Sorry, we couldn't generate a summary at this time. Please try again later.</p>
                            </div>
                        `;
                    }
                });
            });
        });
    }
    
    async generateCaseSummary(caseTitle, caseContent, container) {
        if (!container) return;
        
        // If no content provided, try to get from current page
        if (!caseContent) {
            const contentElement = document.querySelector('.episode-description, .episode-content p');
            if (contentElement) {
                caseContent = contentElement.textContent;
            } else {
                console.error('Could not find case content for summarization');
                return;
            }
        }
        
        if (!caseTitle) {
            const titleElement = document.querySelector('.episode-title');
            if (titleElement) {
                caseTitle = titleElement.textContent;
            } else {
                caseTitle = "This case";
            }
        }
        
        try {
            const prompt = `Summarize the key facts of this true crime case titled "${caseTitle}" with the following content:
            "${caseContent}"
            
            Create a concise summary that includes:
            1. The victims and when/where the crime occurred
            2. Key evidence in the case
            3. Current status (solved/unsolved)
            4. Most important or unusual aspects of the case
            
            Format the response with clear sections and bullet points for easy reading.
            Keep the summary factual, objective, and respectful to victims.`;
            
            const response = await this.callGeminiAPI(prompt);
            this.displayCaseSummary(response, container);
        } catch (error) {
            console.error('Error generating case summary:', error);
            throw error;
        }
    }
    
    displayCaseSummary(summary, container) {
        if (!container) return;
        
        container.innerHTML = `
            <div class="case-summary">
                <div class="summary-header">
                    <h3><i class="fas fa-file-alt"></i> Case Summary</h3>
                </div>
                <div class="summary-content">
                    ${summary.replace(/\n/g, '<br>')}
                </div>
                <p class="ai-powered-note"><i class="fas fa-robot"></i> Summary generated by AI</p>
            </div>
        `;
    }
    
    getMockSummary() {
        return `# Moscow Murders Case Summary

## Victims and Crime Details
* **Victims:** Four University of Idaho students - Kaylee Goncalves (21), Madison Mogen (21), Xana Kernodle (20), and Ethan Chapin (20)
* **Date:** November 13, 2022, early morning hours
* **Location:** Off-campus rental home in Moscow, Idaho
* **Cause of Death:** Multiple stab wounds from a large fixed-blade knife

## Key Evidence
* Tan leather knife sheath found at the scene with DNA evidence
* Surveillance footage showing a white Hyundai Elantra near the residence
* Cell phone data placing suspect near the victims' home multiple times
* Testimony from surviving roommate who saw a figure in black with a mask
* No signs of forced entry or robbery

## Current Status
* **Status:** Solved (Pending Trial)
* **Suspect:** Bryan Kohberger, a PhD student in criminology at Washington State University
* **Charges:** Four counts of first-degree murder and one count of felony burglary
* **Potential Penalty:** Death penalty if convicted

## Notable Aspects
* No apparent connection between the suspect and victims has been established
* The suspect was studying criminology and criminal psychology
* Two other roommates in the house were unharmed during the attack
* The case gained national attention and caused widespread fear in the community
* The investigation utilized genetic genealogy techniques similar to those used in other high-profile cold cases`;
    }
    
    // Smart Search
    initSmartSearch() {
        document.addEventListener('DOMContentLoaded', () => {
            const searchForm = document.getElementById('smart-search-form');
            if (searchForm) {
                searchForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const searchInput = document.getElementById('smart-search-input');
                    const searchResultsContainer = document.getElementById('smart-search-results');
                    
                    if (!searchInput || !searchResultsContainer) return;
                    
                    const query = searchInput.value.trim();
                    if (!query) return;
                    
                    // Show loading state
                    searchResultsContainer.innerHTML = `
                        <div class="loading-indicator">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Searching...</p>
                        </div>
                    `;
                    
                    try {
                        await this.performSmartSearch(query, searchResultsContainer);
                    } catch (error) {
                        console.error('Error performing smart search:', error);
                        searchResultsContainer.innerHTML = `
                            <div class="error-message">
                                <i class="fas fa-exclamation-triangle"></i>
                                <p>Sorry, we couldn't complete your search at this time. Please try again later.</p>
                            </div>
                        `;
                    }
                });
            }
        });
    }
    
    async performSmartSearch(query, container) {
        if (!container) return;
        
        try {
            // First, get all episodes from the page
            const episodes = this.getEpisodesFromPage();
            
            if (episodes.length === 0) {
                container.innerHTML = `
                    <div class="no-results">
                        <p>No episodes found to search through.</p>
                    </div>
                `;
                return;
            }
            
            const prompt = `I'm searching for true crime content related to "${query}" in our podcast episodes.
            Here are the episodes we have:
            ${JSON.stringify(episodes)}
            
            Please analyze which episodes are most relevant to my search query "${query}" and explain why.
            Consider synonyms, related concepts, and thematic connections.
            Return the results as a JSON array with objects containing:
            - episodeId: The ID of the episode
            - relevanceScore: A number from 0-100 indicating how relevant the episode is
            - matchReason: A brief explanation of why this episode matches the query
            
            Only include episodes with a relevance score above 30.`;
            
            const response = await this.callGeminiAPI(prompt);
            
            // Extract JSON from the response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                throw new Error('Could not extract JSON from API response');
            }
            
            const searchResults = JSON.parse(jsonMatch[0]);
            this.displaySearchResults(searchResults, query, episodes, container);
        } catch (error) {
            console.error('Error performing smart search:', error);
            throw error;
        }
    }
    
    getEpisodesFromPage() {
        const episodes = [];
        const episodeCards = document.querySelectorAll('.episode-card');
        
        episodeCards.forEach((card, index) => {
            const titleElement = card.querySelector('.episode-title');
            const descriptionElement = card.querySelector('.episode-description');
            const categoryElements = card.querySelectorAll('.episode-badge');
            
            if (titleElement && descriptionElement) {
                const title = titleElement.textContent;
                const description = descriptionElement.textContent;
                const categories = Array.from(categoryElements).map(badge => badge.textContent);
                
                episodes.push({
                    id: index,
                    title: title,
                    description: description,
                    categories: categories
                });
            }
        });
        
        return episodes;
    }
    
    displaySearchResults(results, query, episodes, container) {
        if (!container) return;
        
        if (results.length === 0) {
            container.innerHTML = `
                <div class="no-results">
                    <p>No results found for "${query}". Try a different search term.</p>
                </div>
            `;
            return;
        }
        
        let html = `
            <div class="search-results-header">
                <h3>Search Results for "${query}"</h3>
                <p>${results.length} relevant episodes found</p>
            </div>
            <div class="search-results-list">
        `;
        
        results.forEach(result => {
            const episode = episodes.find(ep => ep.id === result.episodeId) || 
                            episodes[result.episodeId] || 
                            { title: 'Episode not found', description: 'No description available' };
            
            html += `
                <div class="search-result-item">
                    <div class="result-relevance">
                        <div class="relevance-meter">
                            <div class="relevance-fill" style="width: ${result.relevanceScore}%"></div>
                        </div>
                        <span class="relevance-score">${result.relevanceScore}% match</span>
                    </div>
                    <div class="result-content">
                        <h4>${episode.title}</h4>
                        <p class="result-match-reason">${result.matchReason}</p>
                        <p class="result-description">${episode.description}</p>
                    </div>
                </div>
            `;
        });
        
        html += `
            </div>
            <p class="ai-powered-note"><i class="fas fa-robot"></i> Search powered by AI</p>
        `;
        
        container.innerHTML = html;
    }
}

// Initialize the Gemini AI features
document.addEventListener('DOMContentLoaded', () => {
    const geminiAI = new GeminiAI();
    geminiAI.init().then(success => {
        if (success) {
            console.log('Gemini AI features initialized successfully');
        } else {
            console.warn('Gemini AI features initialization failed');
        }
    });
});

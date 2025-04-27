// Brave Search API Integration for CrimeTimeSnacks

// Brave Search API key
const BRAVE_SEARCH_API_KEY = 'BSAl1hctJZNjBLbVh-ibu7Etcx8EaJH';
const BRAVE_SEARCH_API_URL = 'https://api.search.brave.com/res/v1/web/search';

// Function to search using Brave Search API
async function searchWithBraveAPI(query, count = 10) {
    try {
        const response = await fetch(BRAVE_SEARCH_API_URL, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': BRAVE_SEARCH_API_KEY
            },
            params: {
                q: query,
                count: count,
                search_lang: 'en'
            }
        });

        if (!response.ok) {
            throw new Error(`Brave Search API error: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error searching with Brave API:', error);
        return null;
    }
}

// Function to enhance search functionality with Brave Search API
function enhanceSearchFunctionality() {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.querySelector('.search-container button');
    
    if (!searchInput || !searchButton) return;
    
    // Override the search button click event
    searchButton.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const searchTerm = searchInput.value.trim();
        if (!searchTerm) return;
        
        // Show loading indicator
        const searchResults = document.getElementById('search-results') || createSearchResultsContainer();
        searchResults.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
        searchResults.style.display = 'block';
        
        // Perform search with Brave API
        const results = await searchWithBraveAPI(searchTerm);
        
        // Display results
        displaySearchResults(results, searchTerm);
    });
    
    // Add keypress event for Enter key
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchButton.click();
        }
    });
}

// Function to create search results container if it doesn't exist
function createSearchResultsContainer() {
    const searchBar = document.getElementById('search-bar');
    const container = document.createElement('div');
    container.id = 'search-results';
    container.className = 'search-results-container';
    container.style.display = 'none';
    
    if (searchBar) {
        searchBar.parentNode.insertBefore(container, searchBar.nextSibling);
    } else {
        document.querySelector('header').appendChild(container);
    }
    
    return container;
}

// Function to display search results
function displaySearchResults(results, searchTerm) {
    const searchResults = document.getElementById('search-results');
    
    if (!searchResults) return;
    
    // Clear previous results
    searchResults.innerHTML = '';
    
    if (!results || !results.web || results.web.results.length === 0) {
        searchResults.innerHTML = `<div class="no-results">No results found for "${searchTerm}"</div>`;
        return;
    }
    
    // Create results header
    const resultsHeader = document.createElement('div');
    resultsHeader.className = 'results-header';
    resultsHeader.innerHTML = `
        <h3>Search Results for "${searchTerm}"</h3>
        <button id="close-search-results"><i class="fas fa-times"></i></button>
    `;
    searchResults.appendChild(resultsHeader);
    
    // Add close button functionality
    document.getElementById('close-search-results').addEventListener('click', () => {
        searchResults.style.display = 'none';
    });
    
    // Create results list
    const resultsList = document.createElement('div');
    resultsList.className = 'results-list';
    
    // Add each result
    results.web.results.forEach(result => {
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        resultItem.innerHTML = `
            <h4><a href="${result.url}" target="_blank">${result.title}</a></h4>
            <p class="result-url">${result.url}</p>
            <p class="result-description">${result.description}</p>
        `;
        resultsList.appendChild(resultItem);
    });
    
    searchResults.appendChild(resultsList);
    
    // Add powered by Brave Search attribution
    const attribution = document.createElement('div');
    attribution.className = 'search-attribution';
    attribution.innerHTML = 'Powered by <a href="https://search.brave.com/" target="_blank">Brave Search</a>';
    searchResults.appendChild(attribution);
    
    // Add CSS for search results if not already added
    addSearchResultsStyles();
}

// Function to add CSS styles for search results
function addSearchResultsStyles() {
    if (document.getElementById('search-results-styles')) return;
    
    const styleElement = document.createElement('style');
    styleElement.id = 'search-results-styles';
    styleElement.textContent = `
        .search-results-container {
            background-color: var(--cts-medium-gray);
            border-radius: var(--cts-border-radius);
            box-shadow: var(--cts-box-shadow);
            margin: 1rem auto;
            max-width: 800px;
            padding: 1.5rem;
            position: relative;
            z-index: 99;
        }
        
        .results-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid var(--cts-light-gray);
        }
        
        .results-header h3 {
            margin: 0;
            color: var(--cts-white);
        }
        
        #close-search-results {
            background: none;
            border: none;
            color: var(--cts-white);
            cursor: pointer;
            font-size: 1.2rem;
        }
        
        #close-search-results:hover {
            color: var(--cts-red);
        }
        
        .results-list {
            max-height: 500px;
            overflow-y: auto;
        }
        
        .result-item {
            margin-bottom: 1.5rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--cts-light-gray);
        }
        
        .result-item:last-child {
            border-bottom: none;
        }
        
        .result-item h4 {
            margin: 0 0 0.5rem 0;
        }
        
        .result-item h4 a {
            color: var(--cts-red);
            text-decoration: none;
        }
        
        .result-item h4 a:hover {
            text-decoration: underline;
        }
        
        .result-url {
            color: #aaa;
            font-size: 0.8rem;
            margin: 0 0 0.5rem 0;
            word-break: break-all;
        }
        
        .result-description {
            color: var(--cts-white);
            margin: 0;
        }
        
        .no-results {
            padding: 2rem;
            text-align: center;
            color: var(--cts-white);
        }
        
        .loading-spinner {
            padding: 2rem;
            text-align: center;
            color: var(--cts-white);
        }
        
        .search-attribution {
            font-size: 0.8rem;
            text-align: right;
            margin-top: 1rem;
            color: #aaa;
        }
        
        .search-attribution a {
            color: var(--cts-red);
            text-decoration: none;
        }
    `;
    
    document.head.appendChild(styleElement);
}

// Initialize Brave Search integration
document.addEventListener('DOMContentLoaded', () => {
    enhanceSearchFunctionality();
});

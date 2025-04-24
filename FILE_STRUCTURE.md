# CrimeTimeSnacks Website File Structure

## Overview
This document provides a complete overview of the upgraded CrimeTimeSnacks website file structure and instructions on what files can be deleted from the original site.

## Directory Structure

```
podcast_upgrade/
├── index.html                # Main homepage
├── about.html               # About page
├── contact.html             # Contact page
├── blog.html                # AI-powered true crime news blog
├── episodes.html            # Episodes listing page
├── merch.html               # Merchandise page
├── videos.html              # Videos page
├── .env.example             # Example environment variables file (DO NOT COMMIT .env)
├── .gitignore               # Git ignore file (add .env to this)
├── css/                     # CSS styles directory
│   └── style.css            # Main stylesheet
├── js/                      # JavaScript directory
│   ├── main.js              # Main JavaScript functionality
│   ├── audio-player.js      # Enhanced audio player
│   ├── category-ai.js       # AI-powered category filtering
│   ├── blog-ai.js           # AI blog functionality
│   ├── gemini-ai.js         # Gemini API integration
│   └── recommendation-system.js # Content recommendation system
├── images/                  # Images directory
│   ├── logo.png             # Site logo
│   ├── favicon.ico          # Favicon
│   └── [episode images]     # Episode cover images
├── audio/                   # Audio files directory
│   └── [podcast episodes]   # Podcast audio files
└── episodes/                # Individual episode pages
    ├── menendez-brothers.html
    ├── murders-in-moscow.html
    ├── jonbenet-ramsey-part-1.html
    ├── watts-family-murders.html
    ├── courtney-clenney.html
    ├── delphi-murder-case.html
    └── [other episode files]
```

## Key Files and Their Purpose

### HTML Files
- `index.html`: Main landing page with featured episodes, continue listening section, and popular episodes
- `about.html`: Information about the podcast and hosts
- `contact.html`: Contact form and information
- `blog.html`: AI-powered blog with latest true crime news from Law and Crime
- `episodes.html`: Complete listing of all podcast episodes with category filtering
- `merch.html`: Merchandise offerings
- `videos.html`: Video content related to the podcast
- `episodes/*.html`: Individual episode pages with content, player, and recommendations

### CSS Files
- `css/style.css`: Main stylesheet with responsive design and dark theme

### JavaScript Files
- `js/main.js`: Core functionality and site-wide features
- `js/audio-player.js`: Enhanced audio player with playback speed, visualization, and progress saving
- `js/category-ai.js`: AI-powered category filtering system
- `js/blog-ai.js`: AI blog functionality for true crime news
- `js/gemini-ai.js`: Gemini API integration for AI features
- `js/recommendation-system.js`: Content recommendation system

### Configuration Files
- `.env.example`: Template for environment variables (copy to .env and add your API key)
- `.gitignore`: Git ignore file to prevent committing sensitive data

## What to Delete from Original Site

You can safely delete the following files from the original site as they've been replaced with improved versions:

1. All HTML files in the root directory (they've been replaced with enhanced versions)
2. The original `style.css` file (replaced with improved CSS)
3. Any JavaScript files in the original site (replaced with new functionality)

**DO NOT DELETE:**
1. Original audio files - these have been incorporated into the new structure
2. Original images - these have been incorporated into the new structure
3. Original episode content - this has been enhanced but preserves your original content

## Environment Variables Setup

1. Copy `.env.example` to `.env`
2. Add your Gemini API key to the `.env` file:
```
GEMINI_API_KEY=AIzaSyClI8VW8G6_RdGQuse5dAUxHtefVke1qjc
```
3. Add `.env` to your `.gitignore` file to prevent committing your API key

## How to Add New Episodes

1. Create a new HTML file in the `episodes/` directory using the existing episodes as templates
2. Add the episode audio file to the `audio/` directory
3. Add the episode cover image to the `images/` directory
4. Update the episode listing in `episodes.html`

The AI category system will automatically categorize your new episode based on its content.

## How to Update the Blog

The blog is designed to automatically fetch the latest true crime news from Law and Crime using the Gemini API. For future automation:

1. Set up a scheduled task to call the blog update function
2. The function will fetch new content and update the blog page

## Deployment Instructions

The website is ready to be deployed to any static hosting platform. For Netlify deployment:

1. Create a new site in Netlify
2. Connect to your GitHub repository
3. Set the build command to `npm run build` (if using build tools) or leave blank for static deployment
4. Set the publish directory to the root of the project
5. Add your GEMINI_API_KEY as an environment variable in the Netlify settings

## Local Development

To run the site locally:

1. Navigate to the project directory
2. Start a local server (e.g., `python -m http.server` or use a tool like Live Server in VS Code)
3. Access the site at `http://localhost:8000` (or the port specified by your server)

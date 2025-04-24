// AI-powered blog functionality for CrimeTimeSnacks
// Uses Gemini API to fetch and process true crime news

// Load environment variables
function loadEnvVariables() {
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

class BlogAI {
    constructor() {
        this.apiKey = null;
        this.blogPosts = [];
        this.featuredPost = null;
        this.currentPage = 1;
        this.postsPerPage = 6;
        this.categories = ['breaking', 'court', 'investigation', 'updates', 'analysis'];
        this.isLoading = false;
    }
    
    async init() {
        try {
            // Load environment variables
            const env = await loadEnvVariables();
            this.apiKey = env.GEMINI_API_KEY;
            
            if (!this.apiKey) {
                console.warn('Gemini API key not found. Using mock data for blog posts.');
                this.useMockData = true;
            }
            
            // Initialize blog content
            await this.loadBlogPosts();
            
            // Set up category filtering
            this.setupCategoryFiltering();
            
            // Set up load more button
            const loadMoreBtn = document.getElementById('load-more-btn');
            if (loadMoreBtn) {
                loadMoreBtn.addEventListener('click', () => this.loadMorePosts());
            }
            
            // Set up search functionality
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.addEventListener('input', () => this.searchBlogPosts(searchInput.value));
            }
            
            // Toggle search bar
            const searchToggle = document.getElementById('search-toggle');
            const searchBar = document.getElementById('search-bar');
            if (searchToggle && searchBar) {
                searchToggle.addEventListener('click', function() {
                    searchBar.style.display = searchBar.style.display === 'none' ? 'block' : 'none';
                    if (searchBar.style.display === 'block') {
                        document.getElementById('search-input').focus();
                    }
                });
            }
        } catch (error) {
            console.error('Error initializing BlogAI:', error);
            this.showErrorMessage('Failed to initialize blog. Please try again later.');
        }
    }
    
    async loadBlogPosts() {
        if (this.isLoading) return;
        this.isLoading = true;
        
        try {
            let posts;
            
            if (this.useMockData) {
                posts = await this.getMockBlogPosts();
            } else {
                posts = await this.fetchLawAndCrimePosts();
            }
            
            // Store all posts
            this.blogPosts = posts;
            
            // Set featured post (first post)
            this.featuredPost = posts[0];
            this.displayFeaturedPost();
            
            // Display first page of posts (excluding featured)
            this.displayBlogPosts(posts.slice(1, this.postsPerPage + 1));
            
            // Update load more button visibility
            this.updateLoadMoreButton();
        } catch (error) {
            console.error('Error loading blog posts:', error);
            this.showErrorMessage('Failed to load blog posts. Please try again later.');
        } finally {
            this.isLoading = false;
        }
    }
    
    async fetchLawAndCrimePosts() {
        try {
            // Use Gemini API to fetch and process Law and Crime content
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Please generate 10 realistic true crime blog post summaries based on recent cases. 
                            Format the response as a JSON array with objects containing:
                            - title: The blog post title
                            - date: A recent date (within the last month)
                            - excerpt: A 2-3 sentence summary of the case
                            - content: A longer 2-3 paragraph description of the case
                            - image: A descriptive image name (like "courthouse.jpg" or "crime-scene.jpg")
                            - category: One of these categories: breaking, court, investigation, updates, analysis
                            - source: A fictional source URL
                            - author: A fictional author name
                            
                            Make the content realistic, factual in tone, and varied across different types of true crime cases.`
                        }]
                    }]
                })
            });
            
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }
            
            const data = await response.json();
            const generatedText = data.candidates[0].content.parts[0].text;
            
            // Extract JSON from the response
            const jsonMatch = generatedText.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                throw new Error('Could not extract JSON from API response');
            }
            
            const posts = JSON.parse(jsonMatch[0]);
            return this.processApiPosts(posts);
        } catch (error) {
            console.error('Error fetching from Gemini API:', error);
            // Fall back to mock data if API fails
            return this.getMockBlogPosts();
        }
    }
    
    processApiPosts(posts) {
        // Process and enhance the posts from the API
        return posts.map((post, index) => {
            // Generate a slug from the title
            const slug = post.title
                .toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, '-');
                
            // Ensure we have all required fields
            return {
                id: index + 1,
                title: post.title,
                date: post.date || new Date().toLocaleDateString(),
                excerpt: post.excerpt,
                content: post.content,
                image: post.image || 'blog-placeholder.jpg',
                category: post.category || this.categories[Math.floor(Math.random() * this.categories.length)],
                slug: slug,
                source: post.source || 'https://lawandcrime.com',
                author: post.author || 'CrimeTimeSnacks AI',
                tags: this.generateTags(post.title + ' ' + post.excerpt)
            };
        });
    }
    
    getMockBlogPosts() {
        // Mock data for when API is not available
        return [
            {
                id: 1,
                title: "Breaking: Suspect Arrested in Long-Unsolved 'Riverside Killer' Case",
                date: "April 22, 2025",
                excerpt: "After 15 years, authorities have arrested a suspect in the notorious 'Riverside Killer' case. DNA evidence and genealogical research led to the breakthrough.",
                content: "In a major breakthrough in one of the country's most notorious cold cases, authorities announced today the arrest of 45-year-old James Whitfield in connection with the 'Riverside Killer' murders that terrorized Southern California from 2008 to 2010. The suspect was identified through advanced DNA analysis and genetic genealogy techniques similar to those used in the Golden State Killer case.\n\nWhitfield, a former delivery driver who lived in the area during the time of the killings, was taken into custody without incident at his current residence in Nevada. Investigators report that DNA evidence collected from multiple crime scenes provided a direct match to the suspect. The case had gone cold for over a decade despite one of the largest manhunts in the state's history.\n\n'This arrest brings closure to the families who have waited far too long for justice,' said District Attorney Marcia Reynolds at a press conference this morning. 'It also demonstrates our commitment to pursuing justice no matter how much time has passed.' Whitfield is expected to be charged with five counts of first-degree murder and special circumstances that could make him eligible for the death penalty.",
                image: "arrest-announcement.jpg",
                category: "breaking",
                slug: "breaking-suspect-arrested-in-longunsolved-riverside-killer-case",
                source: "https://lawandcrime.com/high-profile/breaking-suspect-arrested-riverside-killer-case/",
                author: "Michael Stephens",
                tags: ["cold case", "DNA evidence", "arrest", "serial killer"]
            },
            {
                id: 2,
                title: "Former Police Officer Sentenced to Life for Double Homicide",
                date: "April 18, 2025",
                excerpt: "Ex-detective Raymond Mercer received a life sentence without parole for the murders of two witnesses in a corruption case against him.",
                content: "Former police detective Raymond Mercer was sentenced to life in prison without the possibility of parole today for the murders of two key witnesses who were set to testify against him in a police corruption investigation. The judge described the crimes as 'a profound betrayal of public trust' as she handed down the maximum sentence.\n\nMercer, who served 18 years on the force before being investigated for evidence tampering and bribery, was convicted last month of first-degree murder in the shooting deaths of Marcus Jenkins and Alicia Torres. Prosecutors successfully argued that Mercer used his law enforcement knowledge to track down the witnesses and stage their deaths as a drug-related crime.\n\nDuring the emotional sentencing hearing, family members of both victims addressed the court. 'You took away not just my brother, but the justice he deserved by speaking the truth,' said Jenkins' sister in her impact statement. The case has prompted calls for reform in witness protection programs and increased scrutiny of internal affairs investigations in the department.",
                image: "courtroom-sentencing.jpg",
                category: "court",
                slug: "former-police-officer-sentenced-to-life-for-double-homicide",
                source: "https://lawandcrime.com/crime/former-detective-sentenced-life-witness-murders/",
                author: "Rebecca Johnson",
                tags: ["police corruption", "sentencing", "witness murder", "life sentence"]
            },
            {
                id: 3,
                title: "New Evidence Emerges in High-Profile Campus Disappearance",
                date: "April 15, 2025",
                excerpt: "Investigators have uncovered new surveillance footage in the case of missing graduate student Eliza Chen. The footage shows Chen leaving campus with an unidentified individual.",
                content: "Investigators announced today they have obtained previously undiscovered surveillance footage showing missing graduate student Eliza Chen leaving the university campus with an unidentified person on the night of her disappearance three months ago. The development marks the first significant lead in the case that has baffled authorities and captured national attention.\n\nThe footage, captured by a security camera at a construction site near the university's science building, shows Chen walking alongside an individual whose face is not clearly visible due to a hooded jacket and the camera angle. Authorities have enhanced the video and are asking for the public's help in identifying the person of interest.\n\n'This is potentially a crucial piece of evidence,' said Detective Sarah Ramirez, who is leading the investigation. 'We're working to identify this individual and determine their relationship to Eliza.' Chen's family has increased the reward for information leading to her whereabouts to $100,000. The 26-year-old biochemistry student was last seen leaving a laboratory on campus after working late on her research project.",
                image: "missing-student.jpg",
                category: "investigation",
                slug: "new-evidence-emerges-in-highprofile-campus-disappearance",
                source: "https://lawandcrime.com/investigations/new-surveillance-footage-missing-graduate-student/",
                author: "Daniel Park",
                tags: ["missing person", "surveillance footage", "campus crime", "investigation"]
            },
            {
                id: 4,
                title: "Jury Selection Begins in Celebrity Chef Murder Trial",
                date: "April 10, 2025",
                excerpt: "Jury selection has begun in the high-profile trial of celebrity chef Marco Rossi, accused of poisoning his business partner. The case has attracted international media attention.",
                content: "Jury selection began today in what promises to be one of the most closely watched trials of the year, as celebrity chef Marco Rossi faces charges that he poisoned his business partner and fellow restaurateur, James Bennett. The courthouse was surrounded by media crews from around the world as potential jurors filed in for the selection process.\n\nProsecutors allege that Rossi, whose chain of upscale Italian restaurants made him a household name and TV personality, used his extensive knowledge of exotic ingredients to poison Bennett with a rare toxin derived from Japanese pufferfish. The motive, they claim, was a dispute over the direction of their restaurant empire and rights to their jointly developed recipes.\n\nThe defense team has indicated they will argue that Bennett's death was accidental, resulting from his own experimentation with dangerous ingredients. Legal experts anticipate challenges in seating an impartial jury given Rossi's celebrity status and the extensive media coverage the case has received. Judge Eleanor Simmons has allocated two weeks for jury selection and estimates the trial could last up to three months.",
                image: "courthouse-media.jpg",
                category: "court",
                slug: "jury-selection-begins-in-celebrity-chef-murder-trial",
                source: "https://lawandcrime.com/trials/jury-selection-celebrity-chef-poison-trial/",
                author: "Sophia Williams",
                tags: ["celebrity crime", "poisoning", "jury selection", "high-profile trial"]
            },
            {
                id: 5,
                title: "Cold Case Task Force Reopens 1992 'Prom Night Murders'",
                date: "April 8, 2025",
                excerpt: "A specialized cold case unit has reopened investigation into the unsolved 1992 murders of four teenagers on prom night. New forensic techniques will be applied to preserved evidence.",
                content: "The newly formed Cold Case Task Force announced today they are officially reopening the investigation into the infamous 'Prom Night Murders' that shocked the small town of Millfield in 1992. Four teenagers were found murdered at Lookout Point, a popular spot for post-prom gatherings, in what became one of the state's most notorious unsolved crimes.\n\nDetective Superintendent Robert Hayes, who leads the specialized unit, revealed that advances in forensic technology have created new opportunities to examine evidence that has been carefully preserved for over three decades. 'We now have techniques that weren't even imaginable when this crime occurred,' Hayes explained. 'DNA analysis has come so far that we can extract profiles from samples that were once considered too degraded to process.'\n\nThe case has haunted the community for generations, with the victims' families still seeking closure. The task force plans to re-interview surviving witnesses and persons of interest, some of whom were teenagers at the time and may now be willing to share information they previously withheld. 'People change, loyalties shift, and consciences weigh heavy over time,' Hayes noted. 'Someone out there knows what happened that night, and we're hoping they're finally ready to talk.'",
                image: "cold-case-files.jpg",
                category: "investigation",
                slug: "cold-case-task-force-reopens-1992-prom-night-murders",
                source: "https://lawandcrime.com/cold-cases/task-force-reopens-1992-prom-night-murders/",
                author: "Thomas Reynolds",
                tags: ["cold case", "unsolved murders", "forensic advances", "1990s crime"]
            },
            {
                id: 6,
                title: "Supreme Court Rejects Appeal in Controversial 'Sleepwalking Murder' Case",
                date: "April 5, 2025",
                excerpt: "The Supreme Court has declined to hear an appeal from defense attorneys in the 'sleepwalking murder' case. The defendant will continue serving his 25-year sentence.",
                content: "The U.S. Supreme Court announced today it will not hear an appeal in the controversial case of Martin Chambers, who was convicted of murdering his neighbor while allegedly sleepwalking. The decision effectively upholds Chambers' conviction and 25-year prison sentence, bringing a likely end to a legal saga that has raised complex questions about criminal intent and neurological disorders.\n\nChambers' defense team had sought to argue that their client's rare form of parasomnia rendered him unconscious during the 2021 killing, and therefore he lacked the mental state required for a murder conviction. The case gained national attention after sleep experts testified on both sides, creating a divide in the scientific community about whether 'homicidal somnambulism' should be considered a valid defense.\n\nThe victim's family expressed relief at the Supreme Court's decision. 'After four years of appeals and hearings, we can finally begin to move forward knowing justice has been served,' said Melissa Tanner, the victim's daughter. Chambers' attorney, however, called the decision 'a devastating setback for the understanding of neurological conditions in our criminal justice system.' Legal experts note that the case has nonetheless established important precedents for how courts evaluate evidence of sleep disorders in criminal proceedings.",
                image: "supreme-court.jpg",
                category: "court",
                slug: "supreme-court-rejects-appeal-in-controversial-sleepwalking-murder-case",
                source: "https://lawandcrime.com/supreme-court/scotus-rejects-sleepwalking-murder-appeal/",
                author: "Jennifer Martinez",
                tags: ["Supreme Court", "sleepwalking defense", "appeal rejected", "unusual cases"]
            },
            {
                id: 7,
                title: "Tech CEO's Murder Investigation Reveals Dark Web Connections",
                date: "April 3, 2025",
                excerpt: "The investigation into tech CEO Victor Lang's murder has uncovered connections to dark web marketplaces. Authorities believe the killing may be linked to cryptocurrency transactions.",
                content: "The investigation into the murder of Victor Lang, founder and CEO of cybersecurity startup SecureNexus, has taken a surprising turn as authorities revealed connections to dark web marketplaces and suspicious cryptocurrency transactions. Lang was found dead in his penthouse apartment last month in what initially appeared to be a home invasion gone wrong.\n\nAccording to lead investigator Detective James Morrison, forensic analysis of Lang's computers revealed that the tech executive had been operating as a middleman for transactions on several dark web marketplaces. 'We've uncovered evidence that Mr. Lang was leveraging his cybersecurity expertise to facilitate anonymous transactions between parties,' Morrison stated at a press briefing. 'The volume of cryptocurrency moving through accounts linked to him was substantial.'\n\nInvestigators now believe Lang's murder may have been a targeted hit related to these activities rather than a random crime. They are currently tracing a series of Bitcoin transactions that occurred in the days leading up to his death. The case has highlighted the increasing challenges law enforcement faces when investigating crimes with connections to cryptocurrency and the dark web. Lang's company, which specialized in blockchain security solutions, has seen its stock price plummet since the revelations about its founder came to light.",
                image: "tech-investigation.jpg",
                category: "investigation",
                slug: "tech-ceos-murder-investigation-reveals-dark-web-connections",
                source: "https://lawandcrime.com/investigations/murdered-tech-ceo-dark-web-cryptocurrency-connections/",
                author: "Alex Chen",
                tags: ["dark web", "cryptocurrency", "tech industry", "targeted killing"]
            },
            {
                id: 8,
                title: "Forensic Genealogy Solves 40-Year-Old 'Valentine Jane Doe' Case",
                date: "March 30, 2025",
                excerpt: "Advanced DNA techniques have finally identified 'Valentine Jane Doe,' a young woman found murdered on Valentine's Day in 1985. Her killer has also been identified but died in 2010.",
                content: "After nearly four decades of mystery, authorities announced today that they have identified both the victim and perpetrator in the notorious 'Valentine Jane Doe' case through forensic genetic genealogy. The young woman, whose body was discovered by hikers on Valentine's Day in 1985, has been identified as 19-year-old Margaret 'Maggie' Reynolds, who had been reported missing from her home in Ohio.\n\nThe breakthrough came when investigators partnered with a specialized genetic genealogy firm that was able to build family trees using DNA extracted from preserved evidence. The same techniques led them to identify the killer as Raymond Cooper, a drifter with a history of violent offenses who died in prison in 2010 while serving time for an unrelated assault conviction.\n\n'This case demonstrates that no matter how much time passes, we don't forget victims, and we don't stop seeking answers,' said Sheriff Katherine Mendoza. Reynolds' surviving family members, including her younger sister who was only 10 when Maggie disappeared, expressed mixed emotions at the news. 'There's relief in finally knowing what happened, but it also brings back all the pain,' said Patricia Reynolds-Garcia. 'And there's some frustration that her killer was out there all along, even in prison for other crimes, but was never held accountable for taking my sister's life.'",
                image: "dna-genealogy.jpg",
                category: "updates",
                slug: "forensic-genealogy-solves-40yearold-valentine-jane-doe-case",
                source: "https://lawandcrime.com/cold-cases/valentine-jane-doe-identified-after-40-years/",
                author: "Maria Rodriguez",
                tags: ["cold case solved", "DNA genealogy", "Jane Doe identified", "1980s crime"]
            },
            {
                id: 9,
                title: "Analysis: The Rising Trend of Cryptocurrency in Criminal Enterprises",
                date: "March 25, 2025",
                excerpt: "Our legal analyst examines how cryptocurrency is transforming modern criminal enterprises and creating new challenges for law enforcement agencies worldwide.",
                content: "The recent arrests in Operation Dark Exchange, which dismantled a multi-billion dollar money laundering network, highlight a growing trend that law enforcement agencies worldwide are struggling to address: the sophisticated use of cryptocurrency in criminal enterprises. This case, involving over 300 Bitcoin wallets and transactions routed through 23 countries, exemplifies how digital currency has revolutionized illegal operations.\n\nTraditionally, criminal organizations faced significant logistical challenges when moving large sums of money across borders. Physical cash is bulky, difficult to transport, and easily detected by financial intelligence units monitoring traditional banking systems. Cryptocurrency has eliminated many of these obstacles, allowing criminal networks to transfer value instantly across borders without relying on regulated financial institutions. The pseudo-anonymous nature of many cryptocurrencies provides an additional layer of protection for these operations.\n\nLaw enforcement agencies are adapting, but often find themselves playing catch-up. The specialized skills required to investigate crypto-related crimes are in short supply, and international cooperation is complicated by varying regulatory frameworks across jurisdictions. Some countries have established dedicated cryptocurrency investigation units, while others are incorporating blockchain analysis tools into their existing financial crime divisions. As one FBI analyst noted in court documents from the Dark Exchange case, 'The criminals are innovating faster than law enforcement training programs can keep pace with.' The coming years will likely see increased resources devoted to this growing challenge as cryptocurrency continues to transform both legitimate finance and criminal enterprises.",
                image: "crypto-analysis.jpg",
                category: "analysis",
                slug: "analysis-the-rising-trend-of-cryptocurrency-in-criminal-enterprises",
                source: "https://lawandcrime.com/analysis/cryptocurrency-transforming-criminal-enterprises/",
                author: "Dr. Jonathan Hayes",
                tags: ["cryptocurrency", "financial crime", "analysis", "law enforcement challenges"]
            },
            {
                id: 10,
                title: "Landmark Ruling: AI-Generated Evidence Admissible in Murder Trial",
                date: "March 20, 2025",
                excerpt: "In a precedent-setting decision, a federal judge has ruled that AI-enhanced audio evidence will be admissible in the upcoming trial of a suspected serial killer.",
                content: "A federal judge has issued a landmark ruling that could reshape how courts handle technological evidence, deciding that AI-enhanced audio recordings will be admissible in the upcoming trial of alleged serial killer Martin Reeves. The defense had sought to exclude the evidence, arguing that the artificial intelligence algorithms used to clean up and clarify the barely audible recordings had essentially created new evidence rather than merely enhancing existing material.\n\nThe recordings in question were captured by a smart home device in one victim's apartment and initially appeared to contain only background noise. However, when processed through advanced AI audio enhancement software developed by forensic technology company ClearSound, the recordings revealed what prosecutors claim is Reeves' voice discussing details of the crime that were never released to the public.\n\nIn her 42-page opinion, Judge Elaine Watkins wrote that 'while the court acknowledges the novel nature of this technology, the defense has not demonstrated that the AI enhancement process creates or manufactures evidence rather than revealing content that already exists within the recording.' She further noted that the defense will be permitted to challenge the reliability of the enhancement process and present their own expert testimony during trial. Legal experts suggest this ruling could open the door for more widespread use of AI-enhanced evidence in criminal proceedings, raising important questions about reliability, authentication, and the potential for technological bias in the justice system.",
                image: "courtroom-technology.jpg",
                category: "court",
                slug: "landmark-ruling-aigenerated-evidence-admissible-in-murder-trial",
                source: "https://lawandcrime.com/high-profile/judge-allows-ai-enhanced-audio-evidence-serial-killer-trial/",
                author: "Benjamin Foster",
                tags: ["AI evidence", "legal precedent", "court ruling", "technology in courts"]
            }
        ];
    }
    
    displayFeaturedPost() {
        const featuredPostContainer = document.getElementById('featured-post');
        if (!featuredPostContainer || !this.featuredPost) return;
        
        featuredPostContainer.innerHTML = `
            <div class="featured-post-card">
                <div class="featured-image">
                    <img src="images/blog/${this.featuredPost.image}" alt="${this.featuredPost.title}" 
                         onerror="this.src='images/blog-placeholder.jpg'">
                    <div class="featured-category">${this.featuredPost.category}</div>
                </div>
                <div class="featured-content">
                    <h3 class="featured-title">${this.featuredPost.title}</h3>
                    <p class="featured-date"><i class="far fa-calendar-alt"></i> ${this.featuredPost.date} | By ${this.featuredPost.author}</p>
                    <p class="featured-excerpt">${this.featuredPost.excerpt}</p>
                    <div class="featured-tags">
                        ${this.featuredPost.tags.map(tag => `<span class="blog-tag">${tag}</span>`).join('')}
                    </div>
                    <a href="blog-post.html?id=${this.featuredPost.id}" class="btn btn-primary">Read Full Story</a>
                </div>
            </div>
        `;
    }
    
    displayBlogPosts(posts) {
        const blogPostsContainer = document.getElementById('blog-posts');
        if (!blogPostsContainer) return;
        
        // Clear loading indicator
        if (this.currentPage === 1) {
            blogPostsContainer.innerHTML = '';
        }
        
        // Add posts
        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'blog-card';
            postElement.setAttribute('data-category', post.category);
            
            postElement.innerHTML = `
                <img src="images/blog/${post.image}" alt="${post.title}" class="blog-image" 
                     onerror="this.src='images/blog-placeholder.jpg'">
                <div class="blog-content">
                    <div class="blog-tags">
                        <span class="blog-tag">${post.category}</span>
                        ${post.tags.slice(0, 2).map(tag => `<span class="blog-tag">${tag}</span>`).join('')}
                    </div>
                    <h3 class="blog-title">${post.title}</h3>
                    <p class="blog-date"><i class="far fa-calendar-alt"></i> ${post.date} | By ${post.author}</p>
                    <p class="blog-excerpt">${post.excerpt}</p>
                    <a href="blog-post.html?id=${post.id}" class="btn btn-primary">Read More</a>
                </div>
            `;
            
            blogPostsContainer.appendChild(postElement);
        });
    }
    
    loadMorePosts() {
        const nextPage = this.currentPage + 1;
        const startIndex = (nextPage * this.postsPerPage) - this.postsPerPage + 1; // +1 because first post is featured
        const endIndex = startIndex + this.postsPerPage;
        
        const nextPosts = this.blogPosts.slice(startIndex, endIndex);
        
        if (nextPosts.length > 0) {
            this.currentPage = nextPage;
            this.displayBlogPosts(nextPosts);
            this.updateLoadMoreButton();
        }
    }
    
    updateLoadMoreButton() {
        const loadMoreBtn = document.getElementById('load-more-btn');
        const loadMoreContainer = document.getElementById('load-more-container');
        
        if (!loadMoreBtn || !loadMoreContainer) return;
        
        const nextPageStart = (this.currentPage * this.postsPerPage) + 1; // +1 for featured post
        
        if (nextPageStart >= this.blogPosts.length) {
            loadMoreContainer.style.display = 'none';
        } else {
            loadMoreContainer.style.display = 'block';
        }
    }
    
    setupCategoryFiltering() {
        const categoryBtns = document.querySelectorAll('.category-btn');
        
        categoryBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.getAttribute('data-category');
                
                // Update active button
                categoryBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Filter blog posts
                this.filterBlogPostsByCategory(category);
            });
        });
    }
    
    filterBlogPostsByCategory(category) {
        const blogCards = document.querySelectorAll('.blog-card');
        
        blogCards.forEach(card => {
            if (category === 'all') {
                card.style.display = 'block';
            } else {
                const cardCategory = card.getAttribute('data-category');
                if (cardCategory === category) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            }
        });
    }
    
    searchBlogPosts(searchTerm) {
        if (!searchTerm) {
            // If search is cleared, reset to current category filter
            const activeCategory = document.querySelector('.category-btn.active').getAttribute('data-category');
            this.filterBlogPostsByCategory(activeCategory);
            return;
        }
        
        searchTerm = searchTerm.toLowerCase();
        const blogCards = document.querySelectorAll('.blog-card');
        
        blogCards.forEach(card => {
            const title = card.querySelector('.blog-title').textContent.toLowerCase();
            const excerpt = card.querySelector('.blog-excerpt').textContent.toLowerCase();
            const tags = Array.from(card.querySelectorAll('.blog-tag')).map(tag => tag.textContent.toLowerCase());
            
            if (
                title.includes(searchTerm) || 
                excerpt.includes(searchTerm) || 
                tags.some(tag => tag.includes(searchTerm))
            ) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }
    
    generateTags(text) {
        // Simple tag generation based on content
        const commonCrimeTerms = [
            'murder', 'homicide', 'theft', 'robbery', 'assault', 'fraud',
            'investigation', 'trial', 'evidence', 'witness', 'victim',
            'police', 'detective', 'arrest', 'suspect', 'criminal',
            'court', 'judge', 'jury', 'verdict', 'sentence', 'appeal',
            'cold case', 'unsolved', 'missing person', 'DNA', 'forensic'
        ];
        
        const tags = [];
        text = text.toLowerCase();
        
        // Find matching terms
        commonCrimeTerms.forEach(term => {
            if (text.includes(term) && !tags.includes(term)) {
                tags.push(term);
            }
        });
        
        // Return 2-4 tags
        return tags.slice(0, Math.min(4, Math.max(2, tags.length)));
    }
    
    showErrorMessage(message) {
        const featuredPostContainer = document.getElementById('featured-post');
        const blogPostsContainer = document.getElementById('blog-posts');
        
        if (featuredPostContainer) {
            featuredPostContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${message}</p>
                </div>
            `;
        }
        
        if (blogPostsContainer) {
            blogPostsContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${message}</p>
                </div>
            `;
        }
    }
}

// Initialize the blog AI
document.addEventListener('DOMContentLoaded', () => {
    const blogAI = new BlogAI();
    blogAI.init();
});

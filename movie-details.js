const API_BASE = 'http://localhost:8080/api';
const FALLBACK_POSTER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 960">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#141826"/>
      <stop offset="100%" stop-color="#090b10"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e63946" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#f0c060" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <rect width="720" height="960" fill="url(#bg)"/>
  <circle cx="585" cy="188" r="170" fill="#e63946" opacity="0.16"/>
  <circle cx="160" cy="792" r="190" fill="#c8973a" opacity="0.12"/>
  <rect x="112" y="118" width="496" height="724" rx="28" fill="none" stroke="rgba(255,255,255,0.08)"/>
  <path d="M194 690h332" stroke="url(#glow)" stroke-width="14" stroke-linecap="round"/>
  <path d="M220 276h280v250H220z" fill="none" stroke="url(#glow)" stroke-width="18"/>
  <path d="M500 401L360 316v170z" fill="url(#glow)"/>
  <text x="360" y="770" text-anchor="middle" fill="#f0ede8" font-family="Arial, Helvetica, sans-serif" font-size="36" letter-spacing="8">CINESPHERE</text>
  <text x="360" y="815" text-anchor="middle" fill="#a0a0b0" font-family="Arial, Helvetica, sans-serif" font-size="22" letter-spacing="4">MOVIE POSTER</text>
</svg>
`)}`;

let activeMoviesCache = null;

function showToast(message, type = 'default') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.className = 'toast';
    }, 3200);
}

function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64).split('').map(char =>
                `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`
            ).join('')
        );

        return JSON.parse(jsonPayload);
    } catch (error) {
        return null;
    }
}

function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizePosterUrl(url) {
    if (!url) return FALLBACK_POSTER;

    try {
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
            return url;
        }

        const apiOrigin = new URL(API_BASE).origin;
        if (url.startsWith('/')) return `${apiOrigin}${url}`;
        return `${apiOrigin}/${String(url).replace(/^\.?\//, '')}`;
    } catch (error) {
        return FALLBACK_POSTER;
    }
}

function formatDate(dateValue) {
    if (!dateValue) return 'Release date to be announced';

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'Release date to be announced';

    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function formatRuntime(minutes) {
    const totalMinutes = Number(minutes);
    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return 'Runtime TBA';

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    if (!hours) return `${mins} mins`;
    if (!mins) return `${hours}h`;
    return `${hours}h ${mins}m`;
}

function getReleaseStatus(dateValue, isActive) {
    if (isActive === false) return 'Coming Soon';

    const releaseDate = new Date(dateValue);
    if (Number.isNaN(releaseDate.getTime())) return 'Now Showing';

    return releaseDate.getTime() > Date.now() ? 'Coming Soon' : 'Now Showing';
}

function buildStoryMarkup(description) {
    const story = description?.trim()
        || 'The synopsis for this film is still being prepared. Check back soon for a fuller story overview and screening details.';

    return story
        .split(/\n+/)
        .filter(Boolean)
        .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
        .join('');
}

function getMovieIdFromUrl() {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('movieId') || searchParams.get('id');
}

async function fetchActiveMovies() {
    if (activeMoviesCache) return activeMoviesCache;

    const response = await fetch(`${API_BASE}/movies/all-active`);
    if (!response.ok) {
        throw new Error('Could not load active movies');
    }

    const apiResponse = await response.json();
    const movies = Array.isArray(apiResponse.data) ? apiResponse.data : [];
    activeMoviesCache = movies.filter(movie => movie.active !== false);
    return activeMoviesCache;
}

async function fetchMovieById(movieId) {
    const response = await fetch(`${API_BASE}/movies/id=${encodeURIComponent(movieId)}`, {
        headers: getAuthHeaders()
    });

    if (response.ok) {
        const apiResponse = await response.json();
        if (apiResponse?.data) {
            return apiResponse.data;
        }
    }

    const activeMovies = await fetchActiveMovies();
    const movie = activeMovies.find(entry => String(entry.id) === String(movieId));

    if (!movie) {
        throw new Error('Movie not found');
    }

    return movie;
}

function formatCurrency(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return 'TBA';

    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
}

function formatShowTime(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'Time TBA';

    return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatShowDate(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'Date TBA';

    return date.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short'
    });
}

function normalizeShowDto(show, movieId) {
    return {
        id: show.showId ?? show.id ?? null,
        movieId,
        movieTitle: show.movieTitle || '',
        screenName: show.screenName || 'Standard Screen',
        theatreName: show.theatreName || 'Cinema Hall',
        startTime: show.startTime || null,
        endTime: show.endTime || null,
        vipPrice: Number(show.VIP_price ?? show.vipPrice ?? show.vip_price) || 0,
        premiumPrice: Number(show.PREMIUM_price ?? show.premiumPrice ?? show.premium_price) || 0,
        regularPrice: Number(show.REGULAR_price ?? show.regularPrice ?? show.regular_price) || 0
    };
}

async function fetchShowsByMovieId(movieId) {
    const response = await fetch(`${API_BASE}/shows/movie/id=${encodeURIComponent(movieId)}`, {
        headers: getAuthHeaders()
    });

    if (!response.ok) {
        throw new Error('Could not load showtimes');
    }

    const apiResponse = await response.json();
    const shows = Array.isArray(apiResponse?.data) ? apiResponse.data : [];

    return shows
        .map(show => normalizeShowDto(show, movieId))
        .filter(show => show.id !== null)
        .sort((left, right) => new Date(left.startTime || 0) - new Date(right.startTime || 0));
}

function groupShowsByVenue(shows) {
    const theatreMap = new Map();

    shows.forEach(show => {
        const theatreName = show.theatreName || 'Cinema Hall';
        const screenName = show.screenName || 'Standard Screen';

        if (!theatreMap.has(theatreName)) {
            theatreMap.set(theatreName, new Map());
        }

        const screenMap = theatreMap.get(theatreName);
        if (!screenMap.has(screenName)) {
            screenMap.set(screenName, []);
        }

        screenMap.get(screenName).push(show);
    });

    return theatreMap;
}

function formatPriceSummary(show) {
    return ` Regular ${formatCurrency(show.regularPrice)} | Premium ${formatCurrency(show.premiumPrice)} | VIP ${formatCurrency(show.vipPrice)}`;
}

function buildShowtimeSectionMarkup(movieId, shows, showLoadError = false) {
    if (showLoadError) {
        return `
            <div class="showtime-empty-state showtime-error-state">
                <strong>Showtimes could not be loaded right now.</strong>
                <p>Please make sure the backend is running and try again.</p>
            </div>
        `;
    }

    if (!shows.length) {
        return `
            <div class="showtime-empty-state">
                <strong>No shows are scheduled for this movie yet.</strong>
                <p>Once a theatre schedules this title, the available screens and time slots will appear here.</p>
            </div>
        `;
    }

    const groupedShows = groupShowsByVenue(shows);

    return `
        <div class="theatre-stack">
            ${[...groupedShows.entries()].map(([theatreName, screens]) => {
                const screenEntries = [...screens.entries()];
                const totalShows = screenEntries.reduce((count, [, screenShows]) => count + screenShows.length, 0);

                return `
                    <article class="theatre-row">
                        <div class="theatre-row-head">
                            <div class="theatre-info">
                                <h3>${escapeHtml(theatreName)}</h3>
                                <span>${screenEntries.length} screen${screenEntries.length === 1 ? '' : 's'} | ${totalShows} showtime${totalShows === 1 ? '' : 's'}</span>
                            </div>
                            <div class="theatre-badge">Choose a show</div>
                        </div>

                        <div class="screen-stack">
                            ${screenEntries.map(([screenName, screenShows]) => `
                                <div class="screen-row">
                                    <div class="screen-info">
                                        <strong>${escapeHtml(screenName)}</strong>
                                    </div>

                                    <div class="showtime-slots">
                                        ${screenShows.map(show => `
                                            <button class="slot-btn" type="button" data-show-id="${escapeHtml(String(show.id))}">
                                                <span class="slot-time">${escapeHtml(formatShowTime(show.startTime))}</span>
                                                <span class="slot-meta">${escapeHtml(formatShowDate(show.startTime))} | Ends ${escapeHtml(formatShowTime(show.endTime))}</span>
                                                <span>${escapeHtml(formatPriceSummary(show))}</span>
                                            </button>
                                        `).join('')}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </article>
                `;
            }).join('')}
        </div>
    `;
}

function renderLoadingState() {
    const detailsShell = document.getElementById('detailsShell');
    if (!detailsShell) return;

    detailsShell.innerHTML = `
        <div class="detail-state">
            <div>
                <div class="detail-spinner"></div>
                <p>Loading movie experience...</p>
            </div>
        </div>
    `;
}

function renderErrorState(message) {
    const detailsShell = document.getElementById('detailsShell');
    if (!detailsShell) return;

    detailsShell.innerHTML = `
        <div class="detail-error-state">
            <div class="detail-error-card">
                <h1>Movie details are unavailable right now.</h1>
                <p>${escapeHtml(message)}</p>
                <div class="detail-error-actions">
                    <a class="btn-primary detail-link-btn" href="index.html#moviesSection">Back to Movies</a>
                    <button class="btn-ghost" type="button" id="retryMovieLoad">Try Again</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('retryMovieLoad')?.addEventListener('click', initMovieDetails);
}

function renderMovieDetails(movie, activeMovies, shows = [], showLoadError = false) {
    const detailsShell = document.getElementById('detailsShell');
    if (!detailsShell) return;

    const safeTitle = escapeHtml(movie.title || 'Untitled Feature');
    const safeGenre = escapeHtml(movie.genre || 'Genre TBA');
    const safeLanguage = escapeHtml(movie.language || 'Language TBA');
    const releaseDate = formatDate(movie.releaseDate);
    const runtime = formatRuntime(movie.durationMinutes);
    const status = getReleaseStatus(movie.releaseDate, movie.active);
    const posterUrl = sanitizePosterUrl(movie.posterUrl);
    const releaseYearDate = new Date(movie.releaseDate);
    const releaseYear = Number.isNaN(releaseYearDate.getTime())
        ? 'Release Year TBA'
        : String(releaseYearDate.getFullYear());
    const storyMarkup = buildStoryMarkup(movie.description);
    const summaryText = escapeHtml(
        movie.description?.trim()
        || 'A premium theatrical story experience, now presented inside the Cinesphere booking journey.'
    );
    const taglineLanguage = safeLanguage.toLowerCase();
    const relatedMovies = activeMovies
        .filter(entry => String(entry.id) !== String(movie.id))
        .slice(0, 3);
    const showtimeMarkup = buildShowtimeSectionMarkup(movie.id, shows, showLoadError);

    document.title = `${movie.title || 'Movie Details'} | Cinesphere`;

    detailsShell.innerHTML = `
        <section class="detail-hero">
            <div class="detail-backdrop" style="background-image: url('${posterUrl}')"></div>

            <div class="detail-hero-grid">
                <div class="detail-poster-card">
                    <span class="detail-poster-badge">${escapeHtml(status)}</span>
                    <img class="detail-poster" src="${posterUrl}" alt="${safeTitle}" loading="eager">
                    <div class="detail-poster-caption">
                        <div class="detail-caption-copy">
                            <strong>${safeTitle}</strong>
                            <span>${safeGenre}</span>
                        </div>
                        <span class="detail-chip">${safeLanguage}</span>
                    </div>
                </div>

                <div class="detail-copy">
                    <a class="detail-breadcrumb" href="index.html#moviesSection">Back to the movie gallery</a>
                    <span class="detail-eyebrow">${escapeHtml(status)}</span>
                    <div>
                        <h1 class="detail-title">${safeTitle}</h1>
                        <p class="detail-tagline">${safeGenre} crafted for the big screen in ${taglineLanguage}.</p>
                    </div>

                    <div class="detail-chip-row">
                        <span class="detail-chip">${escapeHtml(runtime)}</span>
                        <span class="detail-chip">${safeLanguage}</span>
                        <span class="detail-chip">${safeGenre}</span>
                        <span class="detail-chip">${escapeHtml(releaseYear)}</span>
                    </div>
                    <p class="detail-summary">${summaryText}</p>

                    <div class="detail-actions">
                        <button class="btn-primary" type="button" id="bookTicketsBtn">Choose Show</button>
                        <a class="btn-ghost detail-link-btn" href="index.html#moviesSection">Discover More Movies</a>
                    </div>

                    <div class="detail-spotlight">
                        <article class="detail-stat">
                            <span class="detail-stat-label">Release</span>
                            <strong>${escapeHtml(releaseDate)}</strong>
                        </article>
                        <article class="detail-stat">
                            <span class="detail-stat-label">Runtime</span>
                            <strong>${escapeHtml(runtime)}</strong>
                        </article>
                        <article class="detail-stat">
                            <span class="detail-stat-label">Language</span>
                            <strong>${safeLanguage}</strong>
                        </article>
                        <article class="detail-stat">
                            <span class="detail-stat-label">Genre</span>
                            <strong>${safeGenre}</strong>
                        </article>
                    </div>
                </div>
            </div>
        </section>

        <section class="detail-card showtime-panel" id="showtimePanel">
            <div class="showtime-panel-head">
                <div>
                    <h2 class="panel-title">Available Showtimes</h2>
                    <p class="panel-lead">Choose the theatre, screen, and exact timing you want before continuing to seat booking.</p>
                </div>
                <div class="showtime-panel-badge">${escapeHtml(shows.length)} slot${shows.length === 1 ? '' : 's'}</div>
            </div>
            ${showtimeMarkup}
        </section>

        <section class="detail-panels">
            <div class="detail-column">
                <article class="detail-card">
                    <h2 class="panel-title">Storyline</h2>
                    <p class="panel-lead">The full cinema brief for this title, ready before you step into booking.</p>
                    <div class="detail-story">${storyMarkup}</div>
                </article>

                <article class="detail-card">
                    <h2 class="panel-title">More Now Showing</h2>
                    <p class="panel-lead">Keep exploring the current lineup if you are building a movie night for later.</p>
                    <div class="detail-related-grid">
                        ${relatedMovies.length ? relatedMovies.map(relatedMovie => `
                            <article class="related-card">
                                <img src="${sanitizePosterUrl(relatedMovie.posterUrl)}" alt="${escapeHtml(relatedMovie.title || 'Movie poster')}" loading="lazy">
                                <div class="related-body">
                                    <h3>${escapeHtml(relatedMovie.title || 'Untitled')}</h3>
                                    <p>${escapeHtml(relatedMovie.genre || 'Genre TBA')} | ${escapeHtml(formatRuntime(relatedMovie.durationMinutes))}</p>
                                    <button class="book-btn" type="button" data-open-movie="${escapeHtml(String(relatedMovie.id))}">Open Details</button>
                                </div>
                            </article>
                        `).join('') : `
                            <article class="detail-mini-card">
                                <span>Catalog</span>
                                <strong>More titles are on the way.</strong>
                                <p>Once additional movies are available, we will surface them here for quick discovery.</p>
                            </article>
                        `}
                    </div>
                </article>
            </div>

            <aside class="detail-column">
                <article class="detail-card">
                    <h2 class="panel-title">Why watch here</h2>
                    <div class="experience-grid">
                        <div class="experience-item">
                            <strong>Fast path to seats</strong>
                            <p>Open the movie, confirm your plan, and move into booking without hunting through the catalog again.</p>
                        </div>
                        <div class="experience-item">
                            <strong>Premium visual context</strong>
                            <p>Poster-led presentation keeps the page cinematic while still surfacing the key facts you need quickly.</p>
                        </div>
                        <div class="experience-item">
                            <strong>Consistent account flow</strong>
                            <p>Sign in from this page, keep your session active, and continue directly into your next booking step.</p>
                        </div>
                    </div>
                    <div class="detail-note">Booking opens only after a specific theatre and showtime is selected, so the seat page always loads the correct show context.</div>
                </article>

                <article class="detail-card">
                    <h2 class="panel-title">Tonight's checklist</h2>
                    <div class="detail-side-stack">
                        <div class="detail-mini-card">
                            <span>Title</span>
                            <strong>${safeTitle}</strong>
                            <p>Make sure this is the film you want before moving ahead to your screening selection.</p>
                        </div>
                        <div class="detail-mini-card">
                            <span>Quick guide</span>
                            <div class="detail-list">
                                <div class="detail-list-item">Review the language, genre, runtime, and release timing at a glance.</div>
                                <div class="detail-list-item">Sign in once if you are ready to reserve seats for this movie.</div>
                                <div class="detail-list-item">Choose a theatre, screen, and timing before moving into seat selection.</div>
                            </div>
                        </div>
                        <div class="detail-cta-band">
                            <p>Ready to plan <strong>${safeTitle}</strong>?</p>
                            <button class="btn-primary" type="button" id="bookTicketsBandBtn">View Showtimes</button>
                        </div>
                    </div>
                </article>
            </aside>
        </section>
    `;

    document.getElementById('bookTicketsBtn')?.addEventListener('click', () => startBooking(movie.id, shows.length > 0, showLoadError));
    document.getElementById('bookTicketsBandBtn')?.addEventListener('click', () => startBooking(movie.id, shows.length > 0, showLoadError));

    detailsShell.querySelectorAll('[data-open-movie]').forEach(button => {
        button.addEventListener('click', () => {
            const nextMovieId = button.getAttribute('data-open-movie');
            if (!nextMovieId) return;

            window.location.href = `movie-details.html?movieId=${encodeURIComponent(nextMovieId)}`;
        });
    });

    detailsShell.querySelectorAll('[data-show-id]').forEach(button => {
        button.addEventListener('click', () => {
            const showId = button.getAttribute('data-show-id');
            const selectedMovieId = button.getAttribute('data-movie-id') || movie.id;
            if (!showId) return;

            proceedToSeatSelection(showId, selectedMovieId);
        });
    });
}

function showProfile() {
    const authBtn = document.getElementById('authBtn');
    if (!authBtn) return;

    authBtn.innerHTML = '<span class="profile-icon">U</span>';
    document.getElementById('user-name-display').textContent = localStorage.getItem('userName') || '';
    document.getElementById('user-email-display').textContent = localStorage.getItem('userEmail') || '';
    document.getElementById('user-phone-display').textContent = localStorage.getItem('userPhone') || '';
}

function toggleDropdown() {
    const dropdown = document.getElementById('profile-dropdown');
    if (!dropdown) return;

    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

function openModal() {
    const authModal = document.getElementById('authModal');
    authModal?.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const authModal = document.getElementById('authModal');
    authModal?.classList.remove('open');
    document.body.style.overflow = '';
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userPhone');
    showToast('Signed out successfully', 'success');
    setTimeout(() => window.location.reload(), 500);
}

function startBooking(movieId, hasShows = false, showLoadError = false) {
    const showtimePanel = document.getElementById('showtimePanel');
    showtimePanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (showLoadError) {
        showToast('Showtimes are unavailable right now. Please try again shortly.', 'error');
        return;
    }

    if (!hasShows) {
        showToast('No shows are scheduled for this movie yet.', 'error');
        return;
    }

    showToast('Choose a theatre and showtime to continue to seats.', 'success');
}

function proceedToSeatSelection(showId, movieId) {
    if (!localStorage.getItem('token')) {
        showToast('Please sign in to book tickets.', 'error');
        openModal();
        return;
    }

    window.location.href = `book-seats.html?showId=${encodeURIComponent(showId)}&movieId=${encodeURIComponent(movieId)}`;
}

async function initMovieDetails() {
    const movieId = getMovieIdFromUrl();
    if (!movieId) {
        renderErrorState('Open this page from the movies grid or include a movieId in the URL.');
        return;
    }

    renderLoadingState();

    try {
        const [movie, activeMovies, showsResult] = await Promise.all([
            fetchMovieById(movieId),
            fetchActiveMovies(),
            fetchShowsByMovieId(movieId)
                .then(shows => ({ shows, showLoadError: false }))
                .catch(error => {
                    console.error('Error loading showtimes:', error);
                    return { shows: [], showLoadError: true };
                })
        ]);

        renderMovieDetails(movie, activeMovies, showsResult.shows, showsResult.showLoadError);
    } catch (error) {
        console.error('Error loading movie details:', error);
        renderErrorState('We could not load this movie right now. Please make sure the backend is running and try again.');
    }
}

function setupAuthInteractions() {
    const authModal = document.getElementById('authModal');
    const authBtn = document.getElementById('authBtn');
    const closeBtn = document.getElementById('closeBtn');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const toggleLogin = document.getElementById('toggleLogin');
    const toggleRegister = document.getElementById('toggleRegister');
    const modalBackdrop = authModal?.querySelector('.modal-backdrop');

    authBtn?.addEventListener('click', () => {
        if (localStorage.getItem('token')) {
            showProfile();
            toggleDropdown();
            return;
        }

        openModal();
    });

    closeBtn?.addEventListener('click', closeModal);
    modalBackdrop?.addEventListener('click', closeModal);

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeModal();
        }
    });

    toggleLogin?.addEventListener('click', () => {
        loginForm?.classList.remove('hidden');
        registerForm?.classList.add('hidden');
        toggleLogin.classList.add('active');
        toggleRegister?.classList.remove('active');
    });

    toggleRegister?.addEventListener('click', () => {
        registerForm?.classList.remove('hidden');
        loginForm?.classList.add('hidden');
        toggleRegister.classList.add('active');
        toggleLogin?.classList.remove('active');
    });

    document.addEventListener('click', event => {
        const navAuth = document.getElementById('nav-auth');
        if (navAuth && !navAuth.contains(event.target)) {
            const dropdown = document.getElementById('profile-dropdown');
            if (dropdown) dropdown.style.display = 'none';
        }
    });

    loginForm?.addEventListener('submit', async event => {
        event.preventDefault();

        const submitBtn = loginForm.querySelector('.submit-btn');
        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = 'Signing in...';

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                showToast('Invalid credentials. Please try again.', 'error');
                return;
            }

            const result = await response.json();
            const token = result?.data?.token;
            if (!token) {
                showToast('Login failed. Please try again.', 'error');
                return;
            }

            localStorage.setItem('token', token);
            localStorage.setItem('userName', result.data.name);
            localStorage.setItem('userEmail', result.data.email);
            localStorage.setItem('userPhone', result.data.phoneNumber);

            const decoded = parseJwt(token);
            showProfile();
            closeModal();
            showToast(`Welcome back, ${result.data.name}!`, 'success');

            if (decoded?.role === 'ROLE_ADMIN') {
                setTimeout(() => {
                    window.location.href = 'admin.html';
                }, 450);
            }
        } catch (error) {
            console.error('Login error:', error);
            showToast('Connection error. Is the backend running?', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Sign In</span><span class="btn-arrow">></span>';
        }
    });

    registerForm?.addEventListener('submit', async event => {
        event.preventDefault();

        const submitBtn = registerForm.querySelector('.submit-btn');
        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = 'Creating account...';

        const registrationData = {
            name: document.getElementById('regName').value,
            email: document.getElementById('regEmail').value,
            password: document.getElementById('regPassword').value,
            phone: document.getElementById('regPhone').value
        };

        try {
            const response = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(registrationData)
            });

            if (response.ok) {
                showToast('Account created! Please sign in.', 'success');
                registerForm.reset();
                toggleLogin?.click();
            } else {
                const errorData = await response.json();
                showToast(`Registration failed: ${errorData.message || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            showToast('Connection error. Is the backend running?', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Create Account</span><span class="btn-arrow">></span>';
        }
    });
}

function setupNavbarScrollEffect() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    const updateNavbar = () => {
        navbar.classList.toggle('scrolled', window.scrollY > 40);
    };

    updateNavbar();
    window.addEventListener('scroll', updateNavbar);
}

window.logout = logout;

document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('token')) {
        showProfile();
    }

    setupNavbarScrollEffect();
    setupAuthInteractions();
    initMovieDetails();
});

document.querySelector('.close-btn')?.addEventListener('click', () => {
    closeModal();
});

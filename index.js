/* ============================================
   CINESPHERE - Enhanced App Logic
   ============================================ */

const CITY_OPTIONS = [
    'Agra',
    'Ahmedabad',
    'Aurangabad',
    'Bengaluru',
    'Bhopal',
    'Bhubaneswar',
    'Chandigarh',
    'Chennai',
    'Coimbatore',
    'Dehradun',
    'Delhi',
    'Goa',
    'Gurugram',
    'Guwahati',
    'Hyderabad',
    'Indore',
    'Jaipur',
    'Jodhpur',
    'Kanpur',
    'Kochi',
    'Kolkata',
    'Lucknow',
    'Ludhiana',
    'Meerut',
    'Mumbai',
    'Mysuru',
    'Nagpur',
    'Nashik',
    'Noida',
    'Patna',
    'Pune',
    'Raipur',
    'Ranchi',
    'Surat',
    'Thiruvananthapuram',
    'Udaipur',
    'Vadodara',
    'Vijayawada',
    'Visakhapatnam'
];

const POPULAR_CITIES = [
    'Mumbai',
    'Delhi',
    'Bengaluru',
    'Hyderabad',
    'Chennai',
    'Kolkata',
    'Pune',
    'Ahmedabad',
    'Jaipur',
    'Chandigarh'
];

function showToast(message, type = 'default') {
    const toast = document.getElementById('toast');
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
            atob(base64)
                .split('')
                .map(char => '%' + ('00' + char.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(jsonPayload);
    } catch (error) {
        return null;
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getCityInitials(city) {
    return city
        .split(/\s+/)
        .slice(0, 2)
        .map(word => word.charAt(0).toUpperCase())
        .join('');
}

const navbar = document.getElementById('navbar');
const authModal = document.getElementById('authModal');
const authBtn = document.getElementById('authBtn');
const closeBtn = document.getElementById('closeBtn');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const toggleLogin = document.getElementById('toggleLogin');
const toggleRegister = document.getElementById('toggleRegister');
const modalBackdrop = authModal.querySelector('.modal-backdrop');

const movieGrid = document.getElementById('movieGrid');
const cinemaGrid = document.getElementById('cinemaGrid');
const moviesSection = document.getElementById('moviesSection');
const cinemasSection = document.getElementById('cinemasSection');
const moviesSectionLabel = document.getElementById('moviesSectionLabel');
const moviesSectionTitle = document.getElementById('moviesSectionTitle');
const heroSubtitle = document.getElementById('heroSubtitle');
const exploreMoviesBtn = document.getElementById('exploreMoviesBtn');
const chooseCityBtn = document.getElementById('chooseCityBtn');

const cityPickerBtn = document.getElementById('cityPickerBtn');
const selectedCityText = document.getElementById('selectedCityText');
const cityModal = document.getElementById('cityModal');
const closeCityModalBtn = document.getElementById('closeCityModalBtn');
const citySearchInput = document.getElementById('citySearchInput');
const citySelectionStatus = document.getElementById('citySelectionStatus');
const popularCitiesGrid = document.getElementById('popularCitiesGrid');
const cityResults = document.getElementById('cityResults');
const cityResultsMeta = document.getElementById('cityResultsMeta');
const showAllCitiesMoviesBtn = document.getElementById('showAllCitiesMoviesBtn');

const API_BASE = 'http://localhost:8080/api';
const moviesState = {
    selectedCity: '',
    activeRequestId: 0
};
const theatresState = {
    activeRequestId: 0
};

window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
});

function syncBodyScrollState() {
    const isLocked = authModal.classList.contains('open') || cityModal.classList.contains('open');
    document.body.style.overflow = isLocked ? 'hidden' : '';
}

authBtn.addEventListener('click', () => {
    if (localStorage.getItem('token') === null) {
        openModal();
    } else {
        showProfile();
        toggleDropdown();
    }
});

function openModal() {
    authModal.classList.add('open');
    syncBodyScrollState();
}

function closeModal() {
    authModal.classList.remove('open');
    syncBodyScrollState();
}

closeBtn.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);

function openCityModal() {
    cityModal.classList.add('open');
    cityModal.setAttribute('aria-hidden', 'false');
    citySearchInput.value = '';
    renderCityLists();
    syncBodyScrollState();
    setTimeout(() => citySearchInput.focus(), 120);
}

function closeCityModal() {
    cityModal.classList.remove('open');
    cityModal.setAttribute('aria-hidden', 'true');
    syncBodyScrollState();
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        if (cityModal.classList.contains('open')) {
            closeCityModal();
            return;
        }

        closeModal();
    }
});

toggleLogin.addEventListener('click', () => {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    toggleLogin.classList.add('active');
    toggleRegister.classList.remove('active');
});

toggleRegister.addEventListener('click', () => {
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    toggleRegister.classList.add('active');
    toggleLogin.classList.remove('active');
});

function toggleDropdown() {
    const dropdown = document.getElementById('profile-dropdown');
    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';
}

document.addEventListener('click', event => {
    const navAuth = document.getElementById('nav-auth');
    if (!navAuth.contains(event.target)) {
        const dropdown = document.getElementById('profile-dropdown');
        dropdown.style.display = 'none';
    }
});

function showProfile() {
    authBtn.innerHTML = '<span class="profile-icon">&#128100;</span>';
    document.getElementById('user-name-display').textContent = localStorage.getItem('userName') || '';
    document.getElementById('user-email-display').textContent = localStorage.getItem('userEmail') || '';
    document.getElementById('user-phone-display').textContent = localStorage.getItem('userPhone') || '';
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userPhone');
    showToast('Signed out successfully', 'success');
    setTimeout(() => window.location.reload(), 600);
}

loginForm.addEventListener('submit', async event => {
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

        if (response.ok) {
            const result = await response.json();
            const token = result.data.token;

            localStorage.setItem('token', token);
            localStorage.setItem('userName', result.data.name);
            localStorage.setItem('userEmail', result.data.email);
            localStorage.setItem('userPhone', result.data.phoneNumber);

            const decoded = parseJwt(token);

            if (decoded && decoded.role === 'ROLE_ADMIN') {
                window.location.href = 'admin.html';
            } else {
                showProfile();
                closeModal();
                showToast(`Welcome back, ${result.data.name}!`, 'success');
            }
        } else {
            showToast('Invalid credentials. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('Connection error. Is the backend running?', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Sign In</span><span class="btn-arrow">&rarr;</span>';
    }
});

registerForm.addEventListener('submit', async event => {
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
            toggleLogin.click();
        } else {
            const errorData = await response.json();
            showToast(`Registration failed: ${errorData.message || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showToast('Connection error. Is the backend running?', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Create Account</span><span class="btn-arrow">&rarr;</span>';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('token')) {
        showProfile();
    }

    renderCityLists();
    updateCitySelectionUI();
    updateMoviesHeading('');
    fetchMovies();
    fetchTheatres();

    cityPickerBtn.addEventListener('click', openCityModal);
    chooseCityBtn.addEventListener('click', openCityModal);
    closeCityModalBtn.addEventListener('click', closeCityModal);
    cityModal.querySelector('[data-close-city-modal]').addEventListener('click', closeCityModal);
    citySearchInput.addEventListener('input', renderCityLists);
    showAllCitiesMoviesBtn.addEventListener('click', clearCitySelection);

    popularCitiesGrid.addEventListener('click', handleCityOptionClick);
    cityResults.addEventListener('click', handleCityOptionClick);

    exploreMoviesBtn.addEventListener('click', () => {
        moviesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const moviesBtn = document.getElementById('showAllMovies');
    moviesBtn.addEventListener('click', event => {
        event.preventDefault();
        moviesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const cinemasBtn = document.getElementById('showAllCinemas');
    cinemasBtn.addEventListener('click', event => {
        event.preventDefault();
        cinemasSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

function renderCityLists() {
    const query = citySearchInput.value.trim().toLowerCase();
    const filteredCities = CITY_OPTIONS.filter(city => city.toLowerCase().includes(query));

    citySelectionStatus.textContent = moviesState.selectedCity
        ? `Showing movies for ${moviesState.selectedCity}`
        : 'Showing all active movies across cities';

    popularCitiesGrid.innerHTML = POPULAR_CITIES.map(city => `
        <button class="city-chip ${moviesState.selectedCity === city ? 'is-active' : ''}" type="button" data-city="${escapeHtml(city)}">
            <span class="city-chip-mark">${escapeHtml(getCityInitials(city))}</span>
            <span class="city-chip-name">${escapeHtml(city)}</span>
        </button>
    `).join('');

    cityResultsMeta.textContent = `${filteredCities.length} cities available`;

    if (!filteredCities.length) {
        cityResults.innerHTML = `
            <div class="city-empty-search">
                <strong>No city found</strong>
                <span>Try a different spelling or browse all active movies instead.</span>
            </div>
        `;
        return;
    }

    cityResults.innerHTML = filteredCities.map(city => `
        <button class="city-result-btn ${moviesState.selectedCity === city ? 'is-active' : ''}" type="button" data-city="${escapeHtml(city)}">
            <span class="city-result-name">${escapeHtml(city)}</span>
            <span class="city-result-copy">Switch movie lineup</span>
        </button>
    `).join('');
}

function handleCityOptionClick(event) {
    const cityButton = event.target.closest('[data-city]');
    if (!cityButton) return;

    const city = cityButton.getAttribute('data-city');
    selectCity(city);
}

function selectCity(city) {
    if (!city) return;

    moviesState.selectedCity = city;
    updateCitySelectionUI();
    updateMoviesHeading(city);
    closeCityModal();
    fetchMovies(city);
    fetchTheatres(city);
    showToast(`Showing active movies in ${city}`, 'success');
}

function clearCitySelection() {
    moviesState.selectedCity = '';
    updateCitySelectionUI();
    updateMoviesHeading('');
    closeCityModal();
    fetchMovies();
    fetchTheatres();
    showToast('Showing all active movies across cities', 'success');
}

function updateCitySelectionUI() {
    const city = moviesState.selectedCity;
    selectedCityText.textContent = city || 'Select City';
    cityPickerBtn.classList.toggle('is-active', Boolean(city));
    citySelectionStatus.textContent = city
        ? `Showing movies for ${city}`
        : 'Showing all active movies across cities';
}

function updateMoviesHeading(city) {
    if (!city) {
        moviesSectionLabel.textContent = 'LIVE NOW';
        moviesSectionTitle.textContent = 'All Active Movies Right Now';
        heroSubtitle.textContent = 'Browse all active movies right now, or choose your city to narrow the lineup to theatres near you.';
        return;
    }

    moviesSectionLabel.textContent = city.toUpperCase();
    moviesSectionTitle.textContent = `Active Movies in ${city}`;
    heroSubtitle.textContent = `Showing the active movie lineup currently available in ${city}. Change city anytime to refresh the results.`;
}

function renderMovieGridState(title, message, actionLabel = 'Choose City', actionType = 'open-city') {
    const actionMarkup = actionLabel
        ? `<button class="movie-grid-state-btn" type="button" data-grid-action="${escapeHtml(actionType)}">${escapeHtml(actionLabel)}</button>`
        : '';

    movieGrid.innerHTML = `
        <div class="movie-grid-state">
            <div class="movie-grid-state-eyebrow">ACTIVE NOW</div>
            <h3 class="movie-grid-state-title">${escapeHtml(title)}</h3>
            <p class="movie-grid-state-copy">${escapeHtml(message)}</p>
            ${actionMarkup}
        </div>
    `;

    const actionButton = movieGrid.querySelector('[data-grid-action]');
    if (!actionButton) return;

    actionButton.addEventListener('click', () => {
        if (actionType === 'browse-all') {
            clearCitySelection();
            return;
        }

        if (actionType === 'retry') {
            fetchMovies(moviesState.selectedCity);
            return;
        }

        openCityModal();
    });
}

function renderMovieSkeletons(count = 5) {
    movieGrid.innerHTML = '';

    for (let index = 0; index < count; index += 1) {
        const skeletonCard = document.createElement('div');
        skeletonCard.className = 'skeleton-card';
        movieGrid.appendChild(skeletonCard);
    }
}

function normalizeMovieCollection(apiResponse) {
    if (Array.isArray(apiResponse)) return apiResponse;
    if (Array.isArray(apiResponse?.data)) return apiResponse.data;
    return [];
}

function getReleaseYear(releaseDate) {
    if (!releaseDate) return 'Upcoming';

    const parsedDate = new Date(releaseDate);
    return Number.isNaN(parsedDate.getTime()) ? 'Upcoming' : parsedDate.getFullYear();
}

function getDurationLabel(durationMinutes) {
    return durationMinutes ? `${durationMinutes} mins` : 'TBA';
}

function getMovieEndpoint(city) {
    return city
        ? `${API_BASE}/movies/city=${encodeURIComponent(city)}`
        : `${API_BASE}/movies/all-active`;
}

function renderMovies(movies) {
    movieGrid.innerHTML = '';

    movies.forEach((movie, index) => {
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.style.animationDelay = `${index * 0.05}s`;
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'link');
        card.setAttribute('aria-label', `Open details for ${movie.title}`);
        card.innerHTML = `
            <div class="card-img-container">
                <img src="${movie.posterUrl || ''}" alt="${escapeHtml(movie.title)}" loading="lazy">
                <span class="lang-tag">${escapeHtml(movie.language || 'N/A')}</span>
            </div>
            <div class="movie-info">
                <h4 title="${escapeHtml(movie.title)}">${escapeHtml(movie.title)}</h4>
                <p class="genre-text">${escapeHtml(movie.genre || 'Genre unavailable')}</p>
                <div class="meta-info">
                    <span>${escapeHtml(getDurationLabel(movie.durationMinutes))}</span>
                    <span>${escapeHtml(getReleaseYear(movie.releaseDate))}</span>
                </div>
                <button class="book-btn" type="button">View Details</button>
            </div>
        `;

        card.addEventListener('click', () => openMovieDetails(movie.id));
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openMovieDetails(movie.id);
            }
        });
        card.querySelector('.book-btn').addEventListener('click', event => {
            event.stopPropagation();
            openMovieDetails(movie.id);
        });

        movieGrid.appendChild(card);
    });
}

async function fetchMovies(city = '') {
    const requestId = ++moviesState.activeRequestId;
    renderMovieSkeletons();

    try {
        const response = await fetch(getMovieEndpoint(city));
        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        const apiResponse = await response.json();
        if (requestId !== moviesState.activeRequestId) return;

        const movies = normalizeMovieCollection(apiResponse).filter(movie => movie && movie.active !== false);

        if (!movies.length) {
            if (city) {
                renderMovieGridState(
                    `No active movies in ${city}`,
                    'Try another city or switch back to all active movies.',
                    'Browse All Active Movies',
                    'browse-all'
                );
                return;
            }

            renderMovieGridState(
                'No active movies right now',
                'There are no active movies available at the moment. Please try again shortly.',
                '',
                ''
            );
            return;
        }

        renderMovies(movies);
    } catch (error) {
        if (requestId !== moviesState.activeRequestId) return;

        console.error('Error loading movies:', error);
        renderMovieGridState(
            city ? `Could not load movies for ${city}` : 'Could not load active movies',
            'Make sure the backend is running and the movies API is available.',
            'Try Again',
            'retry'
        );
    }
}

function handleBooking(movieId) {
    openMovieDetails(movieId);
}

function openMovieDetails(movieId) {
    window.location.href = `movie-details.html?movieId=${encodeURIComponent(movieId)}`;
}

function renderCinemaState(title, message) {
    cinemaGrid.innerHTML = `
        <div class="cinema-list-state">
            <div class="movie-grid-state-eyebrow">CINEMAS</div>
            <h3 class="movie-grid-state-title">${escapeHtml(title)}</h3>
            <p class="movie-grid-state-copy">${escapeHtml(message)}</p>
        </div>
    `;
}

function normalizeTheatreCollection(apiResponse) {
    if (Array.isArray(apiResponse)) return apiResponse;
    if (Array.isArray(apiResponse?.data)) return apiResponse.data;
    return [];
}

function renderTheatres(theatres) {
    cinemaGrid.innerHTML = theatres.map((theatre, index) => `
        <article class="cinema-list-card" style="animation-delay:${index * 0.05}s">
            <div class="cinema-list-accent"></div>
            <div class="cinema-list-main">
                <div class="cinema-list-overline">${escapeHtml(theatre.city || 'City not listed')}</div>
                <h3>${escapeHtml(theatre.name || 'Cinema')}</h3>
                <p>${escapeHtml(theatre.address || 'Address not available')}</p>
            </div>
            <div class="cinema-list-meta">
                <span class="cinema-meta-chip">${theatre.active === false ? 'Inactive' : 'Now Showing'}</span>
                <span class="cinema-meta-copy">Browse movies and showtimes from this venue.</span>
            </div>
        </article>
    `).join('');
}

async function fetchTheatres(city = moviesState.selectedCity || '') {
    const requestId = ++theatresState.activeRequestId;
    renderCinemaState('Loading theatres...', 'Fetching venues available for your current city selection.');

    try {
        const response = await fetch(`${API_BASE}/theatres/all`);
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        const payload = await response.json();
        if (requestId !== theatresState.activeRequestId) return;

        const theatres = normalizeTheatreCollection(payload)
            .filter(theatre => theatre && theatre.active !== false)
            .filter(theatre => !city || String(theatre.city || '').toLowerCase() === String(city).toLowerCase());

        if (!theatres.length) {
            renderCinemaState(
                city ? `No cinemas found in ${city}` : 'No cinemas available right now',
                city ? 'Try switching to another city to explore more theatres.' : 'The theatre list will appear here once the API returns active venues.'
            );
            return;
        }

        renderTheatres(theatres);
    } catch (error) {
        if (requestId !== theatresState.activeRequestId) return;
        console.error('Error loading theatres:', error);
        renderCinemaState('Could not load cinemas', 'Make sure the backend is running and the theatres API is available.');
    }
}

const API_BASE = 'http://localhost:8080/api';
const LOCK_DURATION_MS = 10 * 60 * 1000;
const SESSION_STORAGE_KEY = 'cinesphere-session-id';
const LOCK_STORAGE_PREFIX = 'cinesphere-seat-locks';
const BOOKING_DRAFT_KEY = 'cinesphere-booking-draft';
const SHOWS_ENDPOINT = `${API_BASE}/shows/all`;
const SEAT_STATUS_ENDPOINTS = [
    showId => `${API_BASE}/shows/id=${showId}/seats`,
    showId => `${API_BASE}/bookings/show/id=${showId}/seats`
];
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

const params = new URLSearchParams(window.location.search);

const state = {
    movieId: params.get('movieId'),
    requestedShowId: params.get('showId'),
    requestedScreenId: params.get('screenId'),
    movie: null,
    shows: [],
    activeShow: null,
    screen: null,
    layout: null,
    selectedSeatKeys: new Set(),
    remoteStatusByKey: new Map(),
    localLocksByKey: new Map(),
    statusSource: 'none'
};

const elements = {
    heroBackdrop: document.getElementById('heroBackdrop'),
    movieTitle: document.getElementById('movieTitle'),
    movieMeta: document.getElementById('movieMeta'),
    bookingModeBadge: document.getElementById('bookingModeBadge'),
    showtimePicker: document.getElementById('showtimePicker'),
    highlightScreen: document.getElementById('highlightScreen'),
    highlightMatrix: document.getElementById('highlightMatrix'),
    highlightInventory: document.getElementById('highlightInventory'),
    moviePoster: document.getElementById('moviePoster'),
    summaryMovieTitle: document.getElementById('summaryMovieTitle'),
    summaryShowTime: document.getElementById('summaryShowTime'),
    summaryTheatre: document.getElementById('summaryTheatre'),
    summaryScreen: document.getElementById('summaryScreen'),
    summaryPrices: document.getElementById('summaryPrices'),
    statusNotice: document.getElementById('statusNotice'),
    seatMapState: document.getElementById('seatMapState'),
    seatMap: document.getElementById('seatMap'),
    selectedSeatsEmpty: document.getElementById('selectedSeatsEmpty'),
    selectedSeatsList: document.getElementById('selectedSeatsList'),
    lockedSeatsEmpty: document.getElementById('lockedSeatsEmpty'),
    lockedSeatsList: document.getElementById('lockedSeatsList'),
    priceBreakdown: document.getElementById('priceBreakdown'),
    summaryTotalLabel: document.getElementById('summaryTotalLabel'),
    summaryTotal: document.getElementById('summaryTotal'),
    availableCount: document.getElementById('availableCount'),
    selectedCount: document.getElementById('selectedCount'),
    lockedCount: document.getElementById('lockedCount'),
    bookedCount: document.getElementById('bookedCount'),
    gapCount: document.getElementById('gapCount'),
    lockSeatsBtn: document.getElementById('lockSeatsBtn'),
    releaseLocksBtn: document.getElementById('releaseLocksBtn'),
    toast: document.getElementById('toast')
};

function showToast(message, type = 'default') {
    if (!elements.toast) return;

    elements.toast.textContent = message;
    elements.toast.className = `toast ${type} show`;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
        elements.toast.className = 'toast';
    }, 3200);
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
        return url.startsWith('/') ? `${apiOrigin}${url}` : `${apiOrigin}/${String(url).replace(/^\.?\//, '')}`;
    } catch (error) {
        return FALLBACK_POSTER;
    }
}

function unwrapApiPayload(payload) {
    if (payload && typeof payload === 'object' && 'data' in payload) {
        return payload.data;
    }

    return payload;
}

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: {
            Accept: 'application/json',
            ...getAuthHeaders()
        }
    });

    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }

    return unwrapApiPayload(await response.json());
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

function formatShortDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Show timing unavailable';

    return date.toLocaleString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function rowIndexToLabel(index) {
    let current = Number(index);
    let label = '';

    while (current >= 0) {
        label = String.fromCharCode((current % 26) + 65) + label;
        current = Math.floor(current / 26) - 1;
    }

    return label;
}

function coordKey(rowIndex, colIndex) {
    return `coord:${rowIndex}:${colIndex}`;
}

function labelKey(label) {
    return `label:${String(label).trim().toUpperCase()}`;
}

function normalizeMovie(movie) {
    if (!movie) return null;

    return {
        id: movie.id ?? movie.movieId ?? null,
        title: movie.title || movie.movieTitle || 'Untitled Feature',
        posterUrl: sanitizePosterUrl(movie.posterUrl),
        genre: movie.genre || 'Genre TBA',
        language: movie.language || 'Language TBA',
        durationMinutes: Number(movie.durationMinutes) || null
    };
}

function normalizeShow(show) {
    if (!show) return null;

    return {
        id: show.showId ?? show.id ?? null,
        movieId: show.movieId ?? show.movie?.id ?? null,
        screenId: show.screenId ?? show.screen?.id ?? null,
        movieTitle: show.movieTitle ?? show.movie?.title ?? '',
        theatreName: show.theatreName ?? show.theatre?.name ?? 'Theatre TBA',
        screenName: show.screenName ?? show.screen?.screenName ?? 'Screen TBA',
        startTime: show.startTime ?? show.showTime ?? null,
        endTime: show.endTime ?? null,
        vipPrice: Number(show.VIP_price ?? show.vipPrice ?? show.vip_price) || 0,
        premiumPrice: Number(show.PREMIUM_price ?? show.premiumPrice ?? show.premium_price) || 0,
        regularPrice: Number(show.REGULAR_price ?? show.regularPrice ?? show.regular_price) || 0,
        bookedSeats: Array.isArray(show.bookedSeats) ? show.bookedSeats : [],
        lockedSeats: Array.isArray(show.lockedSeats) ? show.lockedSeats : [],
        seatStatuses: Array.isArray(show.seatStatuses) ? show.seatStatuses : []
    };
}

function normalizeScreen(screen) {
    if (!screen) return null;

    return {
        id: screen.id ?? screen.screenId ?? null,
        screenName: screen.screenName || 'Screen',
        theatreName: screen.theatreName || screen.theatre?.name || state.activeShow?.theatreName || 'CineSphere',
        maxRows: Number(screen.maxRows) || 0,
        maxCols: Number(screen.maxCols) || 0,
        seats: Array.isArray(screen.seats) ? screen.seats : []
    };
}

async function fetchMovieById(movieId) {
    if (!movieId) return null;

    try {
        return normalizeMovie(await fetchJson(`${API_BASE}/movies/id=${encodeURIComponent(movieId)}`));
    } catch (error) {
        try {
            const movies = await fetchJson(`${API_BASE}/movies/all-active`);
            const found = Array.isArray(movies)
                ? movies.find(movie => String(movie.id) === String(movieId))
                : null;
            return normalizeMovie(found);
        } catch (fallbackError) {
            return null;
        }
    }
}

async function fetchShows() {
    const shows = await fetchJson(SHOWS_ENDPOINT);
    return Array.isArray(shows)
        ? shows.map(normalizeShow).filter(Boolean).sort((a, b) => new Date(a.startTime || 0) - new Date(b.startTime || 0))
        : [];
}

async function fetchShowById(showId) {
    if (!showId) return null;

    try {
        return normalizeShow(await fetchJson(`${API_BASE}/shows/id=${encodeURIComponent(showId)}`));
    } catch (error) {
        return null;
    }
}

async function fetchScreenById(screenId) {
    if (!screenId) return null;
    return normalizeScreen(await fetchJson(`${API_BASE}/screens/id=${encodeURIComponent(screenId)}`));
}

function getSeatPrice(seatType) {
    if (!state.activeShow) return 0;
    if (seatType === 'VIP') return state.activeShow.vipPrice;
    if (seatType === 'PREMIUM') return state.activeShow.premiumPrice;
    return state.activeShow.regularPrice;
}

function buildLayoutMatrix(screen) {
    const seatsByCoord = new Map();

    screen.seats.forEach(rawSeat => {
        const rowIndex = Number(rawSeat.rowIndex);
        const colIndex = Number(rawSeat.colIndex);
        if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return;

        const seatType = String(rawSeat.seatType || 'REGULAR').toUpperCase();
        const seatRow = rawSeat.seatRow || rowIndexToLabel(rowIndex);
        const seatNumber = Number(rawSeat.seatNumber) || 0;
        const seatLabel = `${seatRow}${seatNumber}`;
        seatsByCoord.set(coordKey(rowIndex, colIndex), {
            rowIndex,
            colIndex,
            seatType,
            seatRow,
            seatNumber,
            seatLabel,
            coordKey: coordKey(rowIndex, colIndex),
            labelKey: labelKey(seatLabel),
            price: getSeatPrice(seatType)
        });
    });

    const matrix = [];
    for (let rowIndex = 0; rowIndex < screen.maxRows; rowIndex += 1) {
        const row = [];
        for (let colIndex = 0; colIndex < screen.maxCols; colIndex += 1) {
            const seat = seatsByCoord.get(coordKey(rowIndex, colIndex));
            row.push(seat ? { kind: 'seat', seat } : { kind: 'gap' });
        }
        matrix.push(row);
    }

    return {
        rows: screen.maxRows,
        cols: screen.maxCols,
        matrix,
        seatsByCoord,
        seatCount: seatsByCoord.size
    };
}

function getCurrentSessionId() {
    let sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionId) {
        sessionId = `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }

    return sessionId;
}

function activeLockStorageKey() {
    return `${LOCK_STORAGE_PREFIX}:${state.activeShow?.id || state.requestedScreenId || 'preview'}`;
}

function readLocalLocks() {
    let rawLocks = {};
    try {
        rawLocks = JSON.parse(localStorage.getItem(activeLockStorageKey()) || '{}');
    } catch (error) {
        rawLocks = {};
    }

    const now = Date.now();
    const cleanLocks = new Map();
    const serializable = {};

    Object.entries(rawLocks).forEach(([seatKey, lock]) => {
        if (!lock || Number(lock.expiresAt) <= now) return;
        cleanLocks.set(seatKey, lock);
        serializable[seatKey] = lock;
    });

    localStorage.setItem(activeLockStorageKey(), JSON.stringify(serializable));
    return cleanLocks;
}

function writeLocalLocks(lockMap) {
    const serializable = {};
    lockMap.forEach((lock, seatKey) => {
        serializable[seatKey] = lock;
    });
    localStorage.setItem(activeLockStorageKey(), JSON.stringify(serializable));
}

function normalizeSeatStatus(entry) {
    const rawStatus = String(
        entry?.status
        ?? entry?.seatStatus
        ?? entry?.bookingStatus
        ?? entry?.availability
        ?? 'AVAILABLE'
    ).toUpperCase();

    if (entry?.booked === true || rawStatus.includes('BOOK')) return 'BOOKED';
    if (entry?.locked === true || rawStatus.includes('LOCK') || rawStatus.includes('HELD') || rawStatus.includes('RESERVED')) return 'LOCKED';
    return 'AVAILABLE';
}

function getSeatIdentityKeys(entry) {
    const keys = [];
    const rowIndex = Number(entry?.rowIndex);
    const colIndex = Number(entry?.colIndex);
    if (Number.isFinite(rowIndex) && Number.isFinite(colIndex)) {
        keys.push(coordKey(rowIndex, colIndex));
    }

    const seatLabel = entry?.seatLabel ?? entry?.label ?? entry?.seatName;
    if (seatLabel) keys.push(labelKey(seatLabel));

    if (entry?.seatRow !== undefined && entry?.seatNumber !== undefined) {
        keys.push(labelKey(`${entry.seatRow}${entry.seatNumber}`));
    }

    return keys;
}

function statusMapFromEntries(entries) {
    const map = new Map();
    entries.forEach(entry => {
        const status = {
            status: normalizeSeatStatus(entry),
            mine: Boolean(entry?.mine)
        };
        getSeatIdentityKeys(entry).forEach(key => map.set(key, status));
    });
    return map;
}

async function fetchRemoteSeatStatuses(show) {
    const inlineEntries = [
        ...show.bookedSeats.map(entry => ({ ...entry, status: 'BOOKED' })),
        ...show.lockedSeats.map(entry => ({ ...entry, status: 'LOCKED' })),
        ...show.seatStatuses
    ];

    if (inlineEntries.length) {
        state.statusSource = 'show-data';
        return statusMapFromEntries(inlineEntries);
    }

    for (const buildEndpoint of SEAT_STATUS_ENDPOINTS) {
        try {
            const payload = await fetchJson(buildEndpoint(show.id));
            const entries = Array.isArray(payload)
                ? payload
                : Array.isArray(payload?.seats)
                    ? payload.seats
                    : Array.isArray(payload?.seatStatuses)
                        ? payload.seatStatuses
                        : [];
            state.statusSource = 'remote';
            return statusMapFromEntries(entries);
        } catch (error) {
            continue;
        }
    }

    state.statusSource = 'none';
    return new Map();
}

function resolveSeatDisplayState(seat) {
    const remoteStatus = state.remoteStatusByKey.get(seat.coordKey) || state.remoteStatusByKey.get(seat.labelKey);
    const localLock = state.localLocksByKey.get(seat.coordKey);

    if (remoteStatus?.status === 'BOOKED') return { status: 'BOOKED', mine: false };
    if (localLock) return { status: 'LOCKED', mine: localLock.owner === getCurrentSessionId() };
    if (remoteStatus?.status === 'LOCKED') return { status: 'LOCKED', mine: Boolean(remoteStatus.mine) };
    if (state.selectedSeatKeys.has(seat.coordKey)) return { status: 'SELECTED', mine: true };
    return { status: 'AVAILABLE', mine: false };
}

function selectedSeats() {
    if (!state.layout) return [];
    return [...state.selectedSeatKeys]
        .map(seatKey => state.layout.seatsByCoord.get(seatKey))
        .filter(Boolean)
        .sort((a, b) => a.rowIndex - b.rowIndex || a.colIndex - b.colIndex);
}

function myLockedSeats() {
    if (!state.layout) return [];
    const sessionId = getCurrentSessionId();
    return [...state.localLocksByKey.entries()]
        .filter(([, lock]) => lock.owner === sessionId)
        .map(([seatKey, lock]) => ({ seat: state.layout.seatsByCoord.get(seatKey), lock }))
        .filter(entry => entry.seat)
        .sort((a, b) => a.seat.rowIndex - b.seat.rowIndex || a.seat.colIndex - b.seat.colIndex);
}

function persistBookingDraft() {
    const lockedSeats = myLockedSeats();
    if (!lockedSeats.length || !state.activeShow || !state.screen) {
        localStorage.removeItem(BOOKING_DRAFT_KEY);
        return;
    }

    localStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify({
        movieId: state.movie?.id ?? state.movieId ?? null,
        showId: state.activeShow.id,
        screenId: state.screen.id,
        movieTitle: state.movie?.title ?? state.activeShow.movieTitle ?? 'Movie',
        movieName: state.movie?.title ?? state.activeShow.movieTitle ?? 'Movie',
        theatreName: state.activeShow.theatreName,
        screenName: state.activeShow.screenName,
        showStartTime: state.activeShow.startTime ?? null,
        totalAmount: lockedSeats.reduce((sum, entry) => sum + (Number(entry.seat.price) || 0), 0),
        seatCount: lockedSeats.length,
        seats: lockedSeats.map(entry => ({
            seatLabel: entry.seat.seatLabel,
            seatType: entry.seat.seatType,
            price: entry.seat.price,
            rowIndex: entry.seat.rowIndex,
            colIndex: entry.seat.colIndex
        }))
    }));
}

function renderPageHeader() {
    const movieTitle = state.movie?.title || state.activeShow?.movieTitle || 'Choose your seats';
    const posterUrl = state.movie?.posterUrl || FALLBACK_POSTER;
    const genre = state.movie?.genre || 'Cinema Experience';
    const language = state.movie?.language || 'Language TBA';
    const duration = state.movie?.durationMinutes ? `${state.movie.durationMinutes} mins` : 'Runtime TBA';

    document.title = `${movieTitle} | Book Seats | CineSphere`;
    elements.movieTitle.textContent = movieTitle;
    elements.movieMeta.textContent = `${genre} | ${language} | ${duration}`;
    elements.moviePoster.src = posterUrl;
    elements.moviePoster.alt = `${movieTitle} poster`;
    elements.heroBackdrop.style.backgroundImage = `url('${posterUrl}')`;
    elements.summaryMovieTitle.textContent = movieTitle;
    elements.summaryShowTime.textContent = state.activeShow ? formatShortDateTime(state.activeShow.startTime) : 'Not selected yet';
    elements.summaryTheatre.textContent = state.activeShow?.theatreName || state.screen?.theatreName || 'Waiting for schedule';
    elements.summaryScreen.textContent = state.screen?.screenName || state.activeShow?.screenName || 'Waiting for layout';
    elements.summaryPrices.textContent = state.activeShow
        ? `VIP ${formatCurrency(state.activeShow.vipPrice)} | Premium ${formatCurrency(state.activeShow.premiumPrice)} | Regular ${formatCurrency(state.activeShow.regularPrice)}`
        : 'Choose a show';
    elements.highlightScreen.textContent = state.screen?.screenName || 'Waiting for screen data';
    elements.highlightMatrix.textContent = state.screen ? `${state.screen.maxRows} rows x ${state.screen.maxCols} cols` : '-';
    elements.highlightInventory.textContent = state.layout ? `${state.layout.seatCount} saved seats` : '0 seats';
    elements.bookingModeBadge.textContent = state.statusSource === 'none' ? 'Local Seat Locking' : 'Live Seat Status';
    elements.statusNotice.textContent = state.statusSource === 'none'
        ? 'Booked seats default to the data available for this show, and your temporary locks stay in this browser until checkout.'
        : 'Booked and locked seats are being layered on top of the saved screen matrix for this show.';
}

function renderShowtimePicker() {
    if (!state.shows.length) {
        elements.showtimePicker.innerHTML = '<div class="showtime-empty">No scheduled shows found for this movie.</div>';
        return;
    }

    elements.showtimePicker.innerHTML = state.shows.map(show => `
        <button class="showtime-chip ${String(show.id) === String(state.activeShow?.id) ? 'active' : ''}" type="button" data-show-id="${escapeHtml(String(show.id))}">
            <strong>${escapeHtml(formatShortDateTime(show.startTime).split(',').slice(-1)[0].trim())}</strong>
            <span>${escapeHtml(formatShortDateTime(show.startTime).split(',').slice(0, 2).join(','))}</span>
            <span>${escapeHtml(show.screenName)} | ${escapeHtml(show.theatreName)}</span>
        </button>
    `).join('');
}

function renderSeatMap() {
    if (!state.layout) {
        elements.seatMap.classList.add('hidden');
        elements.seatMapState.classList.remove('hidden');
        elements.seatMapState.textContent = 'Choose a show to load the seat matrix.';
        return;
    }

    elements.seatMap.innerHTML = state.layout.matrix.map((row, rowIndex) => `
        <div class="seat-row">
            <div class="seat-row-label">${escapeHtml(rowIndexToLabel(rowIndex))}</div>
            <div class="seat-row-track" style="--seat-cols:${state.layout.cols}">
                ${row.map(cell => {
                    if (cell.kind === 'gap') return '<div class="seat-gap" aria-hidden="true"></div>';
                    const seat = cell.seat;
                    const display = resolveSeatDisplayState(seat);
                    const classes = ['seat-btn', `status-${display.status}`, display.mine ? 'mine' : '', display.status === 'BOOKED' ? 'is-disabled' : ''].filter(Boolean).join(' ');
                    return `
                        <button class="${classes}" type="button" data-seat-key="${escapeHtml(seat.coordKey)}" data-seat-type="${escapeHtml(seat.seatType)}" ${display.status === 'BOOKED' ? 'disabled' : ''}>
                            <span class="seat-code">${escapeHtml(seat.seatLabel)}</span>
                            <span class="seat-type-tag">${escapeHtml(seat.seatType)}</span>
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    `).join('');

    elements.seatMap.classList.remove('hidden');
    elements.seatMapState.classList.add('hidden');
}

function renderSeatStats() {
    const stats = { AVAILABLE: 0, SELECTED: 0, LOCKED: 0, BOOKED: 0, GAP: 0 };

    if (state.layout) {
        state.layout.matrix.forEach(row => {
            row.forEach(cell => {
                if (cell.kind === 'gap') {
                    stats.GAP += 1;
                    return;
                }
                stats[resolveSeatDisplayState(cell.seat).status] += 1;
            });
        });
    }

    elements.availableCount.textContent = String(stats.AVAILABLE);
    elements.selectedCount.textContent = String(stats.SELECTED);
    elements.lockedCount.textContent = String(stats.LOCKED);
    elements.bookedCount.textContent = String(stats.BOOKED);
    elements.gapCount.textContent = String(stats.GAP);
}

function renderSelectedSeats() {
    const seats = selectedSeats();
    if (!seats.length) {
        elements.selectedSeatsEmpty.classList.remove('hidden');
        elements.selectedSeatsList.innerHTML = '';
        return;
    }

    elements.selectedSeatsEmpty.classList.add('hidden');
    elements.selectedSeatsList.innerHTML = seats.map(seat => `
        <div class="seat-chip">
            <span>${escapeHtml(seat.seatLabel)} | ${escapeHtml(seat.seatType)} | ${escapeHtml(formatCurrency(seat.price))}</span>
            <button type="button" data-remove-selected="${escapeHtml(seat.coordKey)}">Remove</button>
        </div>
    `).join('');
}

function renderLockedSeats() {
    const seats = myLockedSeats();
    if (!seats.length) {
        elements.lockedSeatsEmpty.classList.remove('hidden');
        elements.lockedSeatsList.innerHTML = '';
        elements.releaseLocksBtn.disabled = true;
        return;
    }

    elements.lockedSeatsEmpty.classList.add('hidden');
    elements.releaseLocksBtn.disabled = false;
    elements.lockedSeatsList.innerHTML = seats.map(entry => {
        const minutesLeft = Math.max(Math.ceil((Number(entry.lock.expiresAt) - Date.now()) / 60000), 1);
        return `
            <div class="seat-chip">
                <span>${escapeHtml(entry.seat.seatLabel)} | ${escapeHtml(entry.seat.seatType)} | ${escapeHtml(formatCurrency(entry.seat.price))} | ${minutesLeft} min left</span>
                <button type="button" data-release-seat="${escapeHtml(entry.seat.coordKey)}">Release</button>
            </div>
        `;
    }).join('');
}

function renderPriceBreakdown() {
    const seats = selectedSeats();
    const locked = myLockedSeats().map(entry => entry.seat);
    const total = seats.reduce((sum, seat) => sum + (Number(seat.price) || 0), 0);
    const lockedTotal = locked.reduce((sum, seat) => sum + (Number(seat.price) || 0), 0);

    if (!seats.length) {
        elements.priceBreakdown.innerHTML = `
            <div class="price-empty">
                ${locked.length
                    ? `You currently hold ${locked.length} seats worth ${escapeHtml(formatCurrency(lockedTotal))}.`
                    : 'Seat totals will appear here as soon as you start selecting.'}
            </div>
        `;
        elements.summaryTotalLabel.textContent = locked.length ? 'Locked Total' : 'Selected Total';
        elements.summaryTotal.textContent = locked.length ? formatCurrency(lockedTotal) : 'INR 0';
        return;
    }

    const byType = new Map();
    seats.forEach(seat => {
        const entry = byType.get(seat.seatType) || { count: 0, total: 0 };
        entry.count += 1;
        entry.total += Number(seat.price) || 0;
        byType.set(seat.seatType, entry);
    });

    elements.priceBreakdown.innerHTML = [...byType.entries()].map(([seatType, entry]) => `
        <div class="price-row">
            <span>${escapeHtml(seatType)} x ${entry.count}</span>
            <strong>${escapeHtml(formatCurrency(entry.total))}</strong>
        </div>
    `).join('');
    elements.summaryTotalLabel.textContent = 'Selected Total';
    elements.summaryTotal.textContent = formatCurrency(total);
}

function updateActionButtons() {
    const count = state.selectedSeatKeys.size;
    elements.lockSeatsBtn.disabled = count === 0 || !state.activeShow?.id;
    elements.lockSeatsBtn.textContent = count ? `Lock ${count} Selected Seat${count === 1 ? '' : 's'}` : 'Lock Selected Seats';
}

function renderAll() {
    renderPageHeader();
    renderShowtimePicker();
    renderSeatMap();
    renderSeatStats();
    renderSelectedSeats();
    renderLockedSeats();
    renderPriceBreakdown();
    updateActionButtons();
    persistBookingDraft();
}

function releaseSingleLock(seatKey, successMessage = 'Seat lock released.') {
    if (!state.localLocksByKey.has(seatKey)) return;
    state.localLocksByKey.delete(seatKey);
    writeLocalLocks(state.localLocksByKey);
    renderAll();
    showToast(successMessage, 'success');
}

function toggleSeatSelection(seatKey) {
    if (!state.layout) return;
    const seat = state.layout.seatsByCoord.get(seatKey);
    if (!seat) return;

    const display = resolveSeatDisplayState(seat);
    if (display.status === 'BOOKED') {
        showToast(`${seat.seatLabel} has already been booked.`, 'error');
        return;
    }
    if (display.status === 'LOCKED' && !display.mine) {
        showToast(`${seat.seatLabel} is currently locked.`, 'error');
        return;
    }
    if (display.status === 'LOCKED' && display.mine) {
        releaseSingleLock(seatKey, `${seat.seatLabel} released.`);
        return;
    }
    if (!state.activeShow?.id) {
        showToast('Choose a show first so seats can be locked against that show.', 'error');
        return;
    }

    if (state.selectedSeatKeys.has(seatKey)) {
        state.selectedSeatKeys.delete(seatKey);
    } else {
        state.selectedSeatKeys.add(seatKey);
    }
    renderAll();
}

function lockSelectedSeats() {
    const seats = selectedSeats();
    if (!seats.length) return;

    const now = Date.now();
    const sessionId = getCurrentSessionId();
    seats.forEach(seat => {
        state.localLocksByKey.set(seat.coordKey, {
            owner: sessionId,
            expiresAt: now + LOCK_DURATION_MS,
            lockedAt: now
        });
    });
    writeLocalLocks(state.localLocksByKey);
    state.selectedSeatKeys.clear();
    renderAll();
    showToast(`${seats.length} seat${seats.length === 1 ? '' : 's'} locked for 10 minutes.`, 'success');
}

function releaseAllMyLocks() {
    const sessionId = getCurrentSessionId();
    let released = 0;
    [...state.localLocksByKey.entries()].forEach(([seatKey, lock]) => {
        if (lock.owner === sessionId) {
            state.localLocksByKey.delete(seatKey);
            released += 1;
        }
    });
    writeLocalLocks(state.localLocksByKey);
    renderAll();
    if (released) showToast(`${released} locked seat${released === 1 ? '' : 's'} released.`, 'success');
}

async function selectShow(showId) {
    const show = state.shows.find(entry => String(entry.id) === String(showId));
    if (!show) return;

    state.activeShow = show;
    state.selectedSeatKeys.clear();
    state.screen = await fetchScreenById(show.screenId);
    state.layout = state.screen ? buildLayoutMatrix(state.screen) : null;
    state.remoteStatusByKey = await fetchRemoteSeatStatuses(show);
    state.localLocksByKey = readLocalLocks();

    const nextParams = new URLSearchParams(window.location.search);
    if (state.movieId) nextParams.set('movieId', state.movieId);
    nextParams.set('showId', show.id);
    if (state.screen?.id) nextParams.set('screenId', state.screen.id);
    history.replaceState(null, '', `book-seats.html?${nextParams.toString()}`);

    renderAll();
}

async function initializeBookingPage() {
    try {
        const [movie, requestedShow, shows] = await Promise.all([
            fetchMovieById(state.movieId),
            fetchShowById(state.requestedShowId),
            fetchShows()
        ]);

        state.movie = movie;
        state.shows = shows.filter(show => {
            if (state.requestedShowId) return String(show.id) === String(state.requestedShowId);
            if (state.movieId && show.movieId !== null && show.movieId !== undefined) {
                return String(show.movieId) === String(state.movieId);
            }
            return true;
        });

        if (requestedShow && !state.shows.some(show => String(show.id) === String(requestedShow.id))) {
            state.shows = [requestedShow, ...state.shows];
        }

        state.activeShow = requestedShow
            || state.shows.find(show => String(show.id) === String(state.requestedShowId))
            || state.shows[0]
            || null;

        if (!state.activeShow && state.requestedScreenId) {
            state.screen = await fetchScreenById(state.requestedScreenId);
            state.layout = state.screen ? buildLayoutMatrix(state.screen) : null;
            state.localLocksByKey = readLocalLocks();
            renderAll();
            elements.seatMapState.textContent = 'Screen preview loaded. Add a show id to enable seat locking.';
            return;
        }

        if (!state.activeShow) {
            renderAll();
            elements.seatMapState.textContent = 'No scheduled shows were found for this movie.';
            return;
        }

        state.screen = await fetchScreenById(state.activeShow.screenId);
        state.layout = state.screen ? buildLayoutMatrix(state.screen) : null;
        state.remoteStatusByKey = await fetchRemoteSeatStatuses(state.activeShow);
        state.localLocksByKey = readLocalLocks();
        renderAll();
    } catch (error) {
        console.error('Failed to initialize booking page:', error);
        renderAll();
        elements.seatMapState.textContent = 'We could not load the seat layout right now. Please confirm the backend is running and try again.';
        showToast('Seat layout could not be loaded.', 'error');
    }
}

elements.showtimePicker.addEventListener('click', async event => {
    const button = event.target.closest('[data-show-id]');
    if (!button) return;
    const showId = button.getAttribute('data-show-id');
    if (!showId || String(showId) === String(state.activeShow?.id)) return;
    elements.seatMap.classList.add('hidden');
    elements.seatMapState.classList.remove('hidden');
    elements.seatMapState.textContent = 'Loading the selected show layout...';
    await selectShow(showId);
});

elements.seatMap.addEventListener('click', event => {
    const button = event.target.closest('[data-seat-key]');
    if (!button) return;
    toggleSeatSelection(button.getAttribute('data-seat-key'));
});

elements.selectedSeatsList.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-selected]');
    if (!button) return;
    state.selectedSeatKeys.delete(button.getAttribute('data-remove-selected'));
    renderAll();
});

elements.lockedSeatsList.addEventListener('click', event => {
    const button = event.target.closest('[data-release-seat]');
    if (!button) return;
    releaseSingleLock(button.getAttribute('data-release-seat'));
});

elements.lockSeatsBtn.addEventListener('click', lockSelectedSeats);
elements.releaseLocksBtn.addEventListener('click', releaseAllMyLocks);

setInterval(() => {
    const nextLocks = readLocalLocks();
    const currentSerialized = JSON.stringify([...state.localLocksByKey.entries()]);
    const nextSerialized = JSON.stringify([...nextLocks.entries()]);
    if (currentSerialized !== nextSerialized) {
        state.localLocksByKey = nextLocks;
        renderAll();
    }
}, 30000);

document.addEventListener('DOMContentLoaded', initializeBookingPage);

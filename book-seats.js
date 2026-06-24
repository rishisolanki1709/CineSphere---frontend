const API_BASE = 'http://localhost:8080/api';
const SHOWS_ENDPOINT = `${API_BASE}/shows/all`;
const SHOW_SEATS_ENDPOINT = showId => `${API_BASE}/shows/id=${encodeURIComponent(showId)}/seats`;
const LOCK_SEATS_ENDPOINT = `${API_BASE}/shows/lock-seats`;
const LOCK_DURATION_MS = 5 * 60 * 1000;
const REFRESH_INTERVAL_MS = 15000;
const LOCKS_PREFIX = 'cinesphere-show-locks';
const BOOKING_DRAFT_KEY = 'cinesphere-booking-draft';
const ACTIVE_BOOKING_ID_KEY = 'cinesphere-active-booking-id';
const PAYMENT_RESULT_KEY = 'cinesphere-payment-result';
const VISIBLE_SEAT_TYPES = new Set(['VIP', 'PREMIUM', 'REGULAR']);
const FALLBACK_POSTER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 460"><rect width="320" height="460" fill="#0d1017"/><circle cx="245" cy="86" r="70" fill="#e63946" opacity=".18"/><circle cx="72" cy="382" r="90" fill="#c8973a" opacity=".14"/><rect x="44" y="52" width="232" height="332" rx="20" fill="none" stroke="rgba(255,255,255,.08)"/><text x="160" y="414" fill="#f0ede8" font-family="Arial" font-size="20" text-anchor="middle" letter-spacing="4">CINESPHERE</text></svg>')}`;

const params = new URLSearchParams(window.location.search);

const state = {
    movieId: params.get('movieId'),
    requestedShowId: params.get('showId'),
    movie: null,
    shows: [],
    activeShow: null,
    screen: null,
    layout: null,
    selectedSeatKeys: new Set(),
    myLocksBySeatId: new Map(),
    lockBusy: false,
    refreshBusy: false
};

const els = {
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
    lockSeatsBtn: document.getElementById('lockSeatsBtn'),
    toast: document.getElementById('toast')
};

let holdCountdownIntervalId = null;

function toast(message, type = 'default') {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.className = `toast ${type} show`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { els.toast.className = 'toast'; }, 3200);
}

function authHeaders() {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function unwrap(payload) {
    return payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { Accept: 'application/json', ...authHeaders(), ...(options.headers || {}) }
    });
    const raw = await response.text();
    let payload = null;
    if (raw) {
        try { payload = JSON.parse(raw); } catch { payload = raw; }
    }
    const data = unwrap(payload);
    if (!response.ok) {
        const message = typeof data === 'object' && data ? data.message || data.error : payload;
        const error = new Error(message || `Request failed: ${response.status}`);
        error.status = response.status;
        throw error;
    }
    return data;
}

const getJson = url => requestJson(url);
const postJson = (url, body) => requestJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
});

function sanitizePosterUrl(url) {
    if (!url) return FALLBACK_POSTER;
    try {
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
        const origin = new URL(API_BASE).origin;
        return url.startsWith('/') ? `${origin}${url}` : `${origin}/${String(url).replace(/^\.?\//, '')}`;
    } catch {
        return FALLBACK_POSTER;
    }
}

function rowLabel(index) {
    let value = Number(index);
    let label = '';
    while (value >= 0) {
        label = String.fromCharCode((value % 26) + 65) + label;
        value = Math.floor(value / 26) - 1;
    }
    return label;
}

function coordKey(rowIndex, colIndex) {
    return `coord:${rowIndex}:${colIndex}`;
}

function money(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return 'TBA';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function shortDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Show timing unavailable';
    return date.toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function showTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Time TBA';
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function showDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date TBA';
    return date.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
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
        vipPrice: Number(show.VIP_price ?? show.vipPrice ?? show.vip_price) || 0,
        premiumPrice: Number(show.PREMIUM_price ?? show.premiumPrice ?? show.premium_price) || 0,
        regularPrice: Number(show.REGULAR_price ?? show.regularPrice ?? show.regular_price) || 0
    };
}

function normalizeSeatStatus(status) {
    const raw = String(status ?? 'AVAILABLE').toUpperCase();
    if (raw.includes('BOOK')) return 'BOOKED';
    if (raw.includes('LOCK') || raw.includes('HELD') || raw.includes('RESERVED')) return 'LOCKED';
    return 'AVAILABLE';
}

function seatPrice(seatType) {
    if (seatType === 'VIP') return state.activeShow?.vipPrice || 0;
    if (seatType === 'PREMIUM') return state.activeShow?.premiumPrice || 0;
    return state.activeShow?.regularPrice || 0;
}

function normalizeShowSeat(rawSeat) {
    const rowIndex = Number(rawSeat?.rowIndex);
    const colIndex = Number(rawSeat?.colIndex);
    if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return null;
    const seatType = String(rawSeat?.seatType || 'REGULAR').toUpperCase();
    const price = Number(rawSeat?.price);
    return {
        id: rawSeat?.id ?? rawSeat?.seatId ?? null,
        rowIndex,
        colIndex,
        seatType,
        status: normalizeSeatStatus(rawSeat?.status ?? rawSeat?.seatStatus),
        price: Number.isFinite(price) ? price : seatPrice(seatType)
    };
}

async function fetchMovieById(movieId) {
    if (!movieId) return null;
    try {
        return normalizeMovie(await getJson(`${API_BASE}/movies/id=${encodeURIComponent(movieId)}`));
    } catch {
        try {
            const movies = await getJson(`${API_BASE}/movies/all-active`);
            return normalizeMovie(Array.isArray(movies) ? movies.find(entry => String(entry.id) === String(movieId)) : null);
        } catch {
            return null;
        }
    }
}

async function fetchShows() {
    const shows = await getJson(SHOWS_ENDPOINT);
    return Array.isArray(shows)
        ? shows.map(normalizeShow).filter(Boolean).sort((a, b) => new Date(a.startTime || 0) - new Date(b.startTime || 0))
        : [];
}

async function fetchShowById(showId) {
    if (!showId) return null;
    try { return normalizeShow(await getJson(`${API_BASE}/shows/id=${encodeURIComponent(showId)}`)); }
    catch { return null; }
}

async function fetchShowSeats(showId) {
    const payload = await getJson(SHOW_SEATS_ENDPOINT(showId));
    const seats = Array.isArray(payload) ? payload : Array.isArray(payload?.seats) ? payload.seats : [];
    return seats.map(normalizeShowSeat).filter(Boolean).sort((a, b) => a.rowIndex - b.rowIndex || a.colIndex - b.colIndex);
}

function lockStorageKey(showId = state.activeShow?.id) {
    return `${LOCKS_PREFIX}:${showId || 'unknown'}`;
}

function readLocks(showId = state.activeShow?.id) {
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(lockStorageKey(showId)) || '{}'); } catch { raw = {}; }
    const now = Date.now();
    const map = new Map();
    const serializable = {};
    Object.entries(raw).forEach(([seatId, lock]) => {
        if (!lock || Number(lock.expiresAt) <= now) return;
        map.set(String(seatId), { ...lock, seatId: lock.seatId ?? seatId });
        serializable[String(seatId)] = { ...lock, seatId: lock.seatId ?? seatId };
    });
    localStorage.setItem(lockStorageKey(showId), JSON.stringify(serializable));
    return map;
}

function writeLocks(lockMap, showId = state.activeShow?.id) {
    const serializable = {};
    lockMap.forEach((lock, seatId) => { serializable[String(seatId)] = lock; });
    localStorage.setItem(lockStorageKey(showId), JSON.stringify(serializable));
}

function buildLayout(showSeats) {
    if (!showSeats.length) return { matrix: [], cols: 0, seatCount: 0, seatsByCoord: new Map(), seatsById: new Map() };
    const rows = [...new Set(showSeats.map(seat => seat.rowIndex))].sort((a, b) => a - b);
    const maxCol = showSeats.reduce((max, seat) => Math.max(max, seat.colIndex), 0);
    const seatsByCoord = new Map();
    const seatsById = new Map();
    const rowCounts = new Map();
    showSeats.forEach(seat => {
        if (!VISIBLE_SEAT_TYPES.has(seat.seatType)) return;
        const seatNumber = (rowCounts.get(seat.rowIndex) || 0) + 1;
        rowCounts.set(seat.rowIndex, seatNumber);
        const normalized = { ...seat, seatNumber, rowLabel: rowLabel(seat.rowIndex), seatLabel: `${rowLabel(seat.rowIndex)}${seatNumber}`, coordKey: coordKey(seat.rowIndex, seat.colIndex) };
        seatsByCoord.set(normalized.coordKey, normalized);
        if (normalized.id !== null && normalized.id !== undefined) seatsById.set(String(normalized.id), normalized);
    });
    const matrix = rows.map(rowIndex => {
        const cells = [];
        let hasSeat = false;
        for (let colIndex = 0; colIndex <= maxCol; colIndex += 1) {
            const seat = seatsByCoord.get(coordKey(rowIndex, colIndex));
            if (seat) { hasSeat = true; cells.push({ kind: 'seat', seat }); }
            else cells.push({ kind: 'gap' });
        }
        return hasSeat ? { rowIndex, cells } : null;
    }).filter(Boolean);
    return { matrix, cols: maxCol + 1, seatCount: seatsByCoord.size, seatsByCoord, seatsById };
}

function currentLock(seat) {
    if (seat?.id === null || seat?.id === undefined) return null;
    const lock = state.myLocksBySeatId.get(String(seat.id)) || null;
    return lock && Number(lock.expiresAt) > Date.now() ? lock : null;
}

function displayState(seat) {
    if (seat.status === 'BOOKED') return 'UNAVAILABLE';
    if (seat.status === 'LOCKED') return currentLock(seat) ? 'LOCKED' : 'UNAVAILABLE';
    return state.selectedSeatKeys.has(seat.coordKey) ? 'SELECTED' : 'AVAILABLE';
}

function selectedSeats() {
    return [...state.selectedSeatKeys].map(key => state.layout?.seatsByCoord.get(key)).filter(Boolean).sort((a, b) => a.rowIndex - b.rowIndex || a.colIndex - b.colIndex);
}

function lockedSeats() {
    return [...state.myLocksBySeatId.entries()].map(([seatId, lock]) => ({ seat: state.layout?.seatsById.get(String(seatId)), lock })).filter(entry => entry.seat).sort((a, b) => a.seat.rowIndex - b.seat.rowIndex || a.seat.colIndex - b.seat.colIndex);
}

function readBookingDraft() {
    try {
        return JSON.parse(localStorage.getItem(BOOKING_DRAFT_KEY) || 'null');
    } catch {
        return null;
    }
}

function writeBookingDraft(draft) {
    localStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(draft));
}

function setStoredBookingId(bookingId) {
    if (bookingId === null || bookingId === undefined || bookingId === '') return;
    const normalized = String(bookingId);
    localStorage.setItem(ACTIVE_BOOKING_ID_KEY, normalized);
    localStorage.setItem('bookingId', normalized);
}

function totalSeatAmount(seats) {
    return seats.reduce((sum, entry) => sum + (Number(entry?.seat?.price ?? entry?.price) || 0), 0);
}

function formatCountdown(msRemaining) {
    const safe = Math.max(0, Math.floor(msRemaining / 1000));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function nextHoldExpiry() {
    const now = Date.now();
    const expiries = [...state.myLocksBySeatId.values()]
        .map(lock => Number(lock?.expiresAt))
        .filter(value => Number.isFinite(value) && value > now);
    if (!expiries.length) return null;
    return Math.min(...expiries);
}

function renderHoldCountdown() {
    const badge = document.getElementById('holdTimerBadge');
    const pill = document.getElementById('holdCountdownPill');
    const expiry = nextHoldExpiry();

    if (!badge || !pill) return;

    if (!expiry) {
        badge.textContent = 'No seats held';
        badge.className = 'hold-timer-badge inactive';
        pill.textContent = 'No active hold';
        pill.classList.add('hidden');
        return;
    }

    const remaining = expiry - Date.now();
    if (remaining <= 0) {
        badge.textContent = 'Hold expired';
        badge.className = 'hold-timer-badge expired';
        pill.textContent = 'Expired';
        pill.classList.remove('hidden');
        pill.classList.add('expired');
        return;
    }

    const countdown = formatCountdown(remaining);
    badge.textContent = `${countdown} remaining`;
    badge.className = 'hold-timer-badge active';
    pill.textContent = `${countdown} left`;
    pill.classList.remove('hidden', 'expired');
}

function ensureHoldCountdownTicker() {
    if (holdCountdownIntervalId) return;
    holdCountdownIntervalId = window.setInterval(() => {
        renderHoldCountdown();
        renderLocked();
        renderBreakdown();
    }, 1000);
}

function pruneSelectedSeats() {
    let removed = 0;
    [...state.selectedSeatKeys].forEach(key => {
        const seat = state.layout?.seatsByCoord.get(key);
        if (!seat || seat.status !== 'AVAILABLE') { state.selectedSeatKeys.delete(key); removed += 1; }
    });
    return removed;
}

function pruneLocks() {
    const next = new Map();
    const now = Date.now();
    state.myLocksBySeatId.forEach((lock, seatId) => {
        const seat = state.layout?.seatsById.get(String(seatId));
        if (!lock || Number(lock.expiresAt) <= now) return;
        if (!seat || seat.status !== 'LOCKED') return;
        next.set(String(seatId), { ...lock, seatId: seat.id, seatLabel: seat.seatLabel, seatType: seat.seatType, price: seat.price, rowIndex: seat.rowIndex, colIndex: seat.colIndex, coordKey: seat.coordKey });
    });
    state.myLocksBySeatId = next;
    writeLocks(next);
}

function persistDraft() {
    const seats = lockedSeats();
    if (!seats.length || !state.activeShow) { localStorage.removeItem(BOOKING_DRAFT_KEY); return; }
    writeBookingDraft({
        movieId: state.movie?.id ?? state.activeShow.movieId ?? state.movieId ?? null,
        showId: state.activeShow.id,
        screenId: state.activeShow.screenId ?? null,
        movieTitle: state.movie?.title ?? state.activeShow.movieTitle ?? 'Movie',
        movieName: state.movie?.title ?? state.activeShow.movieTitle ?? 'Movie',
        theatreName: state.activeShow.theatreName,
        screenName: state.activeShow.screenName,
        showStartTime: state.activeShow.startTime ?? null,
        totalAmount: totalSeatAmount(seats),
        seatCount: seats.length,
        seats: seats.map(entry => ({ id: entry.seat.id, seatLabel: entry.seat.seatLabel, seatType: entry.seat.seatType, price: entry.seat.price, rowIndex: entry.seat.rowIndex, colIndex: entry.seat.colIndex, expiresAt: entry.lock.expiresAt }))
    });
}

function updateUrl() {
    const next = new URLSearchParams(window.location.search);
    if (state.movie?.id || state.movieId) next.set('movieId', state.movie?.id ?? state.movieId);
    if (state.activeShow?.id) next.set('showId', state.activeShow.id);
    if (state.activeShow?.screenId) next.set('screenId', state.activeShow.screenId);
    history.replaceState(null, '', `book-seats.html?${next.toString()}`);
}

function renderHeader() {
    const title = state.movie?.title || state.activeShow?.movieTitle || 'Choose your seats';
    const poster = state.movie?.posterUrl || FALLBACK_POSTER;
    const duration = state.movie?.durationMinutes ? `${state.movie.durationMinutes} mins` : 'Runtime TBA';
    document.title = `${title} | Book Seats | CineSphere`;
    els.movieTitle.textContent = title;
    els.movieMeta.textContent = `${state.movie?.genre || 'Cinema Experience'} | ${state.movie?.language || 'Language TBA'} | ${duration}`;
    els.summaryMovieTitle.textContent = title;
    els.moviePoster.src = poster;
    els.moviePoster.alt = `${title} poster`;
    els.heroBackdrop.style.backgroundImage = `url('${poster}')`;
    els.highlightScreen.textContent = state.activeShow?.screenName || 'Waiting for show data';
    els.highlightMatrix.textContent = state.layout ? `${state.layout.matrix.length} rows x ${state.layout.cols} cols` : '-';
    els.highlightInventory.textContent = state.layout ? `${state.layout.seatCount} seats` : '0 seats';
    els.summaryShowTime.textContent = state.activeShow ? shortDateTime(state.activeShow.startTime) : 'Not selected yet';
    els.summaryTheatre.textContent = state.activeShow?.theatreName || 'Waiting for schedule';
    els.summaryScreen.textContent = state.activeShow?.screenName || 'Waiting for layout';
    els.summaryPrices.textContent = state.activeShow ? `VIP ${money(state.activeShow.vipPrice)} | Premium ${money(state.activeShow.premiumPrice)} | Regular ${money(state.activeShow.regularPrice)}` : 'Choose a show';
    els.bookingModeBadge.textContent = 'Live Show Seats';
    els.statusNotice.textContent = 'White seats are available. Confirming selection calls the backend lock API and holds seats for 5 minutes.';
}

function renderShowtimes() {
    if (!state.shows.length) {
        els.showtimePicker.innerHTML = '<div class="showtime-empty">No scheduled shows were found for this movie yet.</div>';
        return;
    }
    els.showtimePicker.innerHTML = state.shows.map(show => `
        <button class="showtime-chip ${String(show.id) === String(state.activeShow?.id) ? 'active' : ''}" type="button" data-show-id="${escapeHtml(String(show.id))}">
            <strong>${escapeHtml(showTime(show.startTime))}</strong>
            <span>${escapeHtml(showDate(show.startTime))}</span>
            <span>${escapeHtml(show.screenName)} | ${escapeHtml(show.theatreName)}</span>
        </button>
    `).join('');
}

function renderSeatMap() {
    if (!state.layout || !state.layout.seatCount) {
        els.seatMap.classList.add('hidden');
        els.seatMapState.classList.remove('hidden');
        els.seatMapState.textContent = state.activeShow ? 'No seat matrix is available for this show yet.' : 'Choose a show to load the seat matrix.';
        return;
    }
    els.seatMap.innerHTML = state.layout.matrix.map(row => `
        <div class="seat-row">
            <div class="seat-row-label">${escapeHtml(rowLabel(row.rowIndex))}</div>
            <div class="seat-row-track" style="--seat-cols:${state.layout.cols}">
                ${row.cells.map(cell => {
        if (cell.kind === 'gap') return '<div class="seat-gap" aria-hidden="true"></div>';
        const seat = cell.seat;
        const status = displayState(seat);
        const disabled = status === 'LOCKED' || status === 'UNAVAILABLE';
        const label = status === 'LOCKED' ? `${seat.seatLabel} is held by you.` : status === 'UNAVAILABLE' ? `${seat.seatLabel} is unavailable.` : status === 'SELECTED' ? `${seat.seatLabel} is selected. Click to deselect it.` : `${seat.seatLabel} is available. Click to select it.`;
        return `<button class="seat-btn status-${status} ${disabled ? 'is-disabled' : ''}" type="button" data-seat-key="${escapeHtml(seat.coordKey)}" data-seat-type="${escapeHtml(seat.seatType)}" aria-label="${escapeHtml(label)}" ${disabled ? 'disabled' : ''}><span class="seat-code">${escapeHtml(seat.seatLabel)}</span><span class="seat-type-tag">${escapeHtml(seat.seatType)}</span></button>`;
    }).join('')}
            </div>
        </div>
    `).join('');
    els.seatMap.classList.remove('hidden');
    els.seatMapState.classList.add('hidden');
}

function renderStats() {
    const stats = { AVAILABLE: 0, SELECTED: 0, LOCKED: 0, UNAVAILABLE: 0 };
    state.layout?.matrix.forEach(row => row.cells.forEach(cell => { if (cell.kind === 'seat') stats[displayState(cell.seat)] += 1; }));
    els.availableCount.textContent = String(stats.AVAILABLE);
    els.selectedCount.textContent = String(stats.SELECTED);
    els.lockedCount.textContent = String(stats.LOCKED);
    els.bookedCount.textContent = String(stats.UNAVAILABLE);
}

function renderSelected() {
    const seats = selectedSeats();
    if (!seats.length) { els.selectedSeatsEmpty.classList.remove('hidden'); els.selectedSeatsList.innerHTML = ''; return; }
    els.selectedSeatsEmpty.classList.add('hidden');
    els.selectedSeatsList.innerHTML = seats.map(seat => `<div class="seat-chip"><span>${escapeHtml(seat.seatLabel)} | ${escapeHtml(seat.seatType)} | ${escapeHtml(money(seat.price))}</span><button type="button" data-remove-selected="${escapeHtml(seat.coordKey)}">Remove</button></div>`).join('');
}

function renderLocked() {
    const seats = lockedSeats();
    if (!seats.length) { els.lockedSeatsEmpty.classList.remove('hidden'); els.lockedSeatsList.innerHTML = ''; return; }
    els.lockedSeatsEmpty.classList.add('hidden');
    els.lockedSeatsList.innerHTML = seats.map(entry => `
        <div class="seat-chip is-held">
            <span>${escapeHtml(entry.seat.seatLabel)} | ${escapeHtml(entry.seat.seatType)} | ${escapeHtml(money(entry.seat.price))}</span>
            <strong class="seat-chip-timer">${escapeHtml(formatCountdown(Number(entry.lock.expiresAt) - Date.now()))}</strong>
        </div>
    `).join('');
}

function renderBreakdown() {
    const chosen = selectedSeats();
    const held = lockedSeats().map(entry => entry.seat);
    const heldTotal = held.reduce((sum, seat) => sum + (Number(seat.price) || 0), 0);
    if (!chosen.length) {
        els.priceBreakdown.innerHTML = `<div class="price-empty">${held.length ? `You currently hold ${held.length} seats worth ${escapeHtml(money(heldTotal))}.` : 'Seat totals will appear here as soon as you start selecting.'}</div>`;
        els.summaryTotalLabel.textContent = held.length ? 'Held Total' : 'Selected Total';
        els.summaryTotal.textContent = held.length ? money(heldTotal) : 'INR 0';
        return;
    }
    const groups = new Map();
    chosen.forEach(seat => { const item = groups.get(seat.seatType) || { count: 0, total: 0 }; item.count += 1; item.total += Number(seat.price) || 0; groups.set(seat.seatType, item); });
    els.priceBreakdown.innerHTML = [...groups.entries()].map(([seatType, item]) => `<div class="price-row"><span>${escapeHtml(seatType)} x ${item.count}</span><strong>${escapeHtml(money(item.total))}</strong></div>`).join('');
    els.summaryTotalLabel.textContent = 'Selected Total';
    els.summaryTotal.textContent = money(chosen.reduce((sum, seat) => sum + (Number(seat.price) || 0), 0));
}

function renderActions() {
    const count = state.selectedSeatKeys.size;
    els.lockSeatsBtn.disabled = state.lockBusy || count === 0 || !state.activeShow?.id;
    els.lockSeatsBtn.textContent = state.lockBusy ? 'Holding seats...' : count ? `Hold ${count} Seat${count === 1 ? '' : 's'} for 5 Min` : 'Hold Selected Seats';
}

function renderAll() {
    renderHeader();
    renderShowtimes();
    renderSeatMap();
    renderStats();
    renderSelected();
    renderLocked();
    renderBreakdown();
    renderActions();
    renderHoldCountdown();
    persistDraft();
}

async function refreshSeatMatrix({ notifySelectionLoss = false, silentError = false } = {}) {
    if (!state.activeShow?.id || state.refreshBusy) return;
    state.refreshBusy = true;
    const showId = String(state.activeShow.id);
    try {
        const layout = buildLayout(await fetchShowSeats(showId));
        if (String(state.activeShow?.id) !== showId) return;
        state.layout = layout;
        state.screen = { id: state.activeShow.screenId ?? null, screenName: state.activeShow.screenName || 'Screen', theatreName: state.activeShow.theatreName || 'CineSphere', maxRows: state.layout.matrix.length, maxCols: state.layout.cols };
        const removed = pruneSelectedSeats();
        pruneLocks();
        if (removed && notifySelectionLoss) toast(`${removed} selected seat${removed === 1 ? '' : 's'} became unavailable.`, 'error');
    } catch (error) {
        if (!silentError) { console.error('Failed to refresh seat matrix:', error); toast(error.message || 'We could not refresh the seat map right now.', 'error'); }
    } finally {
        state.refreshBusy = false;
    }
}

async function selectShow(showId) {
    const show = state.shows.find(entry => String(entry.id) === String(showId));
    if (!show) return;
    state.activeShow = show;
    state.selectedSeatKeys.clear();
    state.myLocksBySeatId = readLocks(show.id);
    state.layout = null;
    updateUrl();
    renderAll();
    els.seatMap.classList.add('hidden');
    els.seatMapState.classList.remove('hidden');
    els.seatMapState.textContent = 'Loading the selected show layout...';
    await refreshSeatMatrix();
    renderAll();
}

function toggleSeat(key) {
    const seat = state.layout?.seatsByCoord.get(key);
    if (!seat) return;
    if (seat.id === null || seat.id === undefined) { toast('This seat is missing its seat id and cannot be booked yet.', 'error'); return; }
    const status = displayState(seat);
    if (status === 'UNAVAILABLE') { toast(`${seat.seatLabel} is unavailable.`, 'error'); return; }
    if (status === 'LOCKED') { toast(`${seat.seatLabel} is already held by you.`, 'success'); return; }
    if (state.selectedSeatKeys.has(key)) state.selectedSeatKeys.delete(key);
    else state.selectedSeatKeys.add(key);
    renderAll();
}

function lockExpiry(response, now) {
    const raw = response?.expiresAt ?? response?.lockExpiresAt ?? response?.expiryTime ?? null;
    if (!raw) return now + LOCK_DURATION_MS;
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && asNumber > 0) {
        if (asNumber > 1000000000000) return asNumber;
        if (asNumber > 1000000000) return asNumber * 1000;
        return now + (asNumber * 1000);
    }
    const asDate = new Date(raw);
    return Number.isNaN(asDate.getTime()) ? now + LOCK_DURATION_MS : asDate.getTime();
}

async function holdSelectedSeats() {
    const seats = selectedSeats();
    if (!seats.length || !state.activeShow?.id) return;

    state.lockBusy = true;
    renderActions();
    const now = Date.now();

    try {
        const seatIds = seats.map(seat => Number(seat.id)).filter(Number.isFinite);
        if (seatIds.length !== seats.length) throw new Error('Invalid seat data.');

        // STEP 1: Lock Seats (Temporary hold in DB)
        // API: /api/shows/lock-seats
        const lockResponse = await postJson(LOCK_SEATS_ENDPOINT, {
            showId: Number(state.activeShow.id),
            showSeatIds: seatIds
        });

        // STEP 2: Confirm Booking (Create PENDING_PAYMENT record)
        // API: /api/bookings/confirm
        const confirmRes = await fetch(`${API_BASE}/bookings/confirm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                showId: Number(state.activeShow.id),
                showSeatIds: seatIds
            })
        });

        const confirmResult = await confirmRes.json();
        if (!confirmResult.success) throw new Error(confirmResult.message);
        console.log(confirmResult);
        // STEP 3: Local State Management
        const expiresAt = lockExpiry(lockResponse, now);
        const nextLocks = readLocks(state.activeShow.id);

        seats.forEach(seat => {
            nextLocks.set(String(seat.id), {
                seatId: seat.id,
                seatLabel: seat.seatLabel,
                price: seat.price,
                lockedAt: now,
                expiresAt
            });
        });

        state.myLocksBySeatId = nextLocks;
        writeLocks(nextLocks, state.activeShow.id);

        // STEP 4: Save Booking DTO for Checkout Page without losing the UI context
        const existingDraft = readBookingDraft() || {};
        const resolvedBookingId = confirmResult?.data?.bookingId ?? confirmResult?.data?.id ?? existingDraft.bookingId ?? null;
        const mergedDraft = {
            ...existingDraft,
            ...confirmResult.data,
            bookingId: resolvedBookingId,
            id: resolvedBookingId ?? confirmResult?.data?.id ?? null,
            movieTitle: existingDraft.movieTitle ?? state.movie?.title ?? state.activeShow?.movieTitle ?? 'Movie',
            movieName: existingDraft.movieName ?? existingDraft.movieTitle ?? state.movie?.title ?? state.activeShow?.movieTitle ?? 'Movie',
            theatreName: existingDraft.theatreName ?? state.activeShow?.theatreName ?? 'CineSphere',
            screenName: existingDraft.screenName ?? state.activeShow?.screenName ?? 'Screen',
            showStartTime: existingDraft.showStartTime ?? state.activeShow?.startTime ?? null,
            seats: Array.isArray(existingDraft.seats) && existingDraft.seats.length ? existingDraft.seats : seats.map(seat => ({
                id: seat.id,
                seatLabel: seat.seatLabel,
                seatType: seat.seatType,
                price: seat.price,
                rowIndex: seat.rowIndex,
                colIndex: seat.colIndex,
                expiresAt
            })),
            seatCount: existingDraft.seatCount ?? seats.length,
            totalAmount: Number(confirmResult?.data?.totalAmount ?? existingDraft.totalAmount ?? totalSeatAmount(seats)) || 0
        };

        writeBookingDraft(mergedDraft);
        setStoredBookingId(resolvedBookingId);
        localStorage.removeItem(PAYMENT_RESULT_KEY);
        console.log('Saving to storage:', mergedDraft);
        state.selectedSeatKeys.clear();
        await refreshSeatMatrix();

        toast('Booking initiated! Redirecting to payment...', 'success');

        // Final Step: Redirect to the Checkout Page
        setTimeout(() => {
            window.location.href = 'checkout.html';
        }, 1500);

    } catch (error) {
        console.error('Booking Flow Failed:', error);
        await refreshSeatMatrix({ notifySelectionLoss: true, silentError: true });
        toast(error.message || 'We could not process your booking. Please try again.', 'error');
    } finally {
        state.lockBusy = false;
        renderAll();
    }
}

async function init() {
    try {
        const [requestedShow, allShows] = await Promise.all([fetchShowById(state.requestedShowId), fetchShows()]);
        const resolvedMovieId = state.movieId || requestedShow?.movieId || null;
        state.movie = await fetchMovieById(resolvedMovieId);
        state.shows = allShows.filter(show => resolvedMovieId ? String(show.movieId) === String(resolvedMovieId) : state.requestedShowId ? String(show.id) === String(state.requestedShowId) : true);
        if (requestedShow && !state.shows.some(show => String(show.id) === String(requestedShow.id))) state.shows = [requestedShow, ...state.shows];
        state.activeShow = state.shows.find(show => String(show.id) === String(state.requestedShowId)) || requestedShow || state.shows[0] || null;
        if (!state.activeShow) { renderAll(); els.seatMapState.textContent = 'No scheduled shows are available for this movie yet.'; return; }
        state.myLocksBySeatId = readLocks(state.activeShow.id);
        updateUrl();
        await refreshSeatMatrix();
        renderAll();
    } catch (error) {
        console.error('Failed to initialize booking page:', error);
        renderAll();
        els.seatMap.classList.add('hidden');
        els.seatMapState.classList.remove('hidden');
        els.seatMapState.textContent = 'We could not load the seat layout right now. Please confirm the backend is running and try again.';
        toast('Seat layout could not be loaded.', 'error');
    }
}

els.showtimePicker.addEventListener('click', async event => {
    const chip = event.target.closest('[data-show-id]');
    if (!chip) return;
    const showId = chip.getAttribute('data-show-id');
    if (!showId || String(showId) === String(state.activeShow?.id)) return;
    await selectShow(showId);
});

els.seatMap.addEventListener('click', event => {
    const button = event.target.closest('[data-seat-key]');
    if (!button) return;
    toggleSeat(button.getAttribute('data-seat-key'));
});

els.selectedSeatsList.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-selected]');
    if (!button) return;
    state.selectedSeatKeys.delete(button.getAttribute('data-remove-selected'));
    renderAll();
});

els.lockSeatsBtn.addEventListener('click', holdSelectedSeats);
ensureHoldCountdownTicker();

setInterval(async () => {
    if (!state.activeShow?.id || state.lockBusy) return;
    const nextLocks = readLocks(state.activeShow.id);
    if (JSON.stringify([...nextLocks.entries()]) !== JSON.stringify([...state.myLocksBySeatId.entries()])) state.myLocksBySeatId = nextLocks;
    await refreshSeatMatrix({ silentError: true });
    renderAll();
}, REFRESH_INTERVAL_MS);

document.addEventListener('DOMContentLoaded', init);

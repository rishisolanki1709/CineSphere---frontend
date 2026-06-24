const API_BASE = 'http://localhost:8080/api';
const BOOKING_DRAFT_KEY = 'cinesphere-booking-draft';
let holdRefreshIntervalId = null;

const state = {
    bookings: [],
    filter: 'ALL',
    search: '',
    loading: false,
    cancellingBookingIds: new Set()
};

const filters = [
    { key: 'ALL', label: 'All' },
    { key: 'UPCOMING', label: 'Upcoming' },
    { key: 'CONFIRMED', label: 'Confirmed' },
    { key: 'PENDING', label: 'Pending' },
    { key: 'CANCELLED', label: 'Cancelled' }
];

const elements = {};

document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    bindEvents();
    hydrateIdentity();
    renderSummary([]);
    renderSpotlight([]);
    renderFilters();
    loadBookings();
});

function cacheElements() {
    elements.summaryGrid = document.getElementById('summaryGrid');
    elements.spotlightCard = document.getElementById('spotlightCard');
    elements.searchInput = document.getElementById('searchInput');
    elements.filterChips = document.getElementById('filterChips');
    elements.bookingsGrid = document.getElementById('bookingsGrid');
    elements.pageState = document.getElementById('pageState');
    elements.toastRegion = document.getElementById('toastRegion');
    elements.refreshButton = document.getElementById('refreshButton');
    elements.resultCountLabel = document.getElementById('resultCountLabel');
    elements.visitorName = document.getElementById('visitorName');
    elements.visitorEmail = document.getElementById('visitorEmail');
    elements.heroDescription = document.getElementById('heroDescription');
}

function bindEvents() {
    elements.searchInput.addEventListener('input', event => {
        state.search = event.target.value.trim().toLowerCase();
        renderBookings();
        renderFilters();
    });

    elements.refreshButton.addEventListener('click', () => {
        loadBookings(true);
    });

    elements.bookingsGrid.addEventListener('click', event => {
        const cancelButton = event.target.closest('[data-cancel-booking-id]');
        if (!cancelButton) return;
        cancelBooking(cancelButton.dataset.cancelBookingId);
    });
}

function hydrateIdentity() {
    const userName = localStorage.getItem('userName') || 'Guest Viewer';
    const userEmail = localStorage.getItem('userEmail') || 'Sign in to load your bookings';

    elements.visitorName.textContent = userName;
    elements.visitorEmail.textContent = userEmail;
    elements.heroDescription.textContent = localStorage.getItem('token')
        ? `Welcome back, ${userName}. Your booking archive updates live from the account currently signed in.`
        : 'Sign in to load your personal booking archive, status history, and upcoming show timeline.';
}

function authHeaders() {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchApiData(url, options = {}) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(payload?.message || 'Request failed.');
    }

    if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'success')) {
        if (!payload.success) throw new Error(payload.message || 'Request failed.');
        return payload.data;
    }

    return payload;
}

function normalizeCollection(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.content)) return data.content;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.results)) return data.results;
    return [];
}

function normalizeBooking(booking) {
    return {
        bookingId: booking?.bookingId ?? booking?.id ?? null,
        showId: booking?.showId ?? null,
        totalAmount: Number(booking?.totalAmount) || 0,
        status: String(booking?.status || 'UNKNOWN'),
        bookedAt: booking?.bookedAt ?? booking?.date ?? null,
        movieName: booking?.movieName ?? booking?.movieTitle ?? 'Untitled screening',
        theatreName: booking?.theatreName ?? 'Theatre not available',
        screenName: booking?.screenName ?? 'Screen not available',
        showTime: booking?.showTime ?? booking?.startTime ?? null
    };
}

function readStoredJson(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
        return null;
    }
}

function formatCountdown(msRemaining) {
    const safe = Math.max(0, Math.floor(msRemaining / 1000));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getActiveHoldDetails(booking) {
    if (!booking?.bookingId) return null;
    const draft = readStoredJson(BOOKING_DRAFT_KEY);
    if (!draft || String(draft.bookingId ?? draft.id ?? '') !== String(booking.bookingId)) return null;

    const expiries = Array.isArray(draft.seats)
        ? draft.seats.map(seat => Number(seat?.expiresAt)).filter(value => Number.isFinite(value) && value > Date.now())
        : [];
    if (!expiries.length) return null;

    const expiry = Math.min(...expiries);
    return {
        expiry,
        countdown: formatCountdown(expiry - Date.now())
    };
}

function syncHoldRefreshTicker() {
    const hasActiveHold = state.bookings.some(booking => !!getActiveHoldDetails(booking));
    if (hasActiveHold && !holdRefreshIntervalId) {
        holdRefreshIntervalId = window.setInterval(() => {
            renderSpotlight(state.bookings);
            renderBookings();
        }, 1000);
        return;
    }

    if (!hasActiveHold && holdRefreshIntervalId) {
        window.clearInterval(holdRefreshIntervalId);
        holdRefreshIntervalId = null;
    }
}

async function loadBookings(isManualRefresh = false) {
    if (!localStorage.getItem('token')) {
        state.loading = false;
        state.bookings = [];
        renderSummary([]);
        renderSpotlight([]);
        renderFilters();
        renderBookings();
        showState(
            'Sign In Required',
            'Your booking archive is available only after you sign in. Once you are back in your account, this page will pull all personal bookings from /api/bookings/my.',
            `
                <div class="state-actions">
                    <a class="state-button" href="index.html">Go to Home</a>
                </div>
            `
        );
        showToast('Please sign in to view your bookings.', 'info');
        return;
    }

    state.loading = true;
    hideState();
    renderLoadingState();

    try {
        const data = await fetchApiData(`${API_BASE}/bookings/my`, {
            headers: authHeaders()
        });
        state.bookings = normalizeCollection(data).map(normalizeBooking);
        state.loading = false;

        renderSummary(state.bookings);
        renderSpotlight(state.bookings);
        renderFilters();
        renderBookings();
        syncHoldRefreshTicker();

        if (!state.bookings.length) {
            showState(
                'No Bookings Yet',
                'Your archive is ready, but there are no bookings to show right now. Once you complete a reservation, it will appear here with the theatre, screen, amount, and showtime.',
                `
                    <div class="state-actions">
                        <a class="state-button" href="index.html">Explore Movies</a>
                    </div>
                `
            );
        } else {
            hideState();
        }

        showToast(
            `${isManualRefresh ? 'Refreshed' : 'Loaded'} ${state.bookings.length} booking${state.bookings.length === 1 ? '' : 's'}.`,
            'success'
        );
    } catch (error) {
        state.loading = false;
        state.bookings = [];
        renderSummary([]);
        renderSpotlight([]);
        renderFilters();
        renderBookings();
        syncHoldRefreshTicker();

        const message = error.message || 'Failed to load your bookings.';
        showState(
            'Could Not Load Bookings',
            message,
            `
                <div class="state-actions">
                    <button class="state-button" type="button" onclick="window.location.reload()">Try Again</button>
                    <a class="state-button" href="index.html">Back Home</a>
                </div>
            `
        );
        showToast(message, 'error');
    }
}

async function cancelBooking(bookingId) {
    const normalizedBookingId = String(bookingId || '').trim();
    if (!normalizedBookingId) return;

    const booking = state.bookings.find(item => String(item.bookingId) === normalizedBookingId);
    if (!booking) {
        showToast('That booking could not be found in your archive.', 'error');
        return;
    }

    if (!canCancelBooking(booking)) {
        showToast('Only upcoming confirmed bookings can be cancelled from this page.', 'info');
        return;
    }

    if (state.cancellingBookingIds.has(normalizedBookingId)) return;

    const confirmed = window.confirm(
        `Cancel Booking #${normalizedBookingId} for ${booking.movieName}? This cannot be undone from this page.`
    );
    if (!confirmed) return;

    state.cancellingBookingIds.add(normalizedBookingId);
    renderBookings();

    try {
        const responseData = await requestBookingCancellation(normalizedBookingId);
        const updatedBooking = buildCancelledBooking(booking, responseData);

        state.bookings = state.bookings.map(item =>
            String(item.bookingId) === normalizedBookingId ? updatedBooking : item
        );

        showToast(`Booking #${normalizedBookingId} cancelled successfully.`, 'success');
    } catch (error) {
        showToast(error.message || `Could not cancel booking #${normalizedBookingId}.`, 'error');
    } finally {
        state.cancellingBookingIds.delete(normalizedBookingId);
        renderSummary(state.bookings);
        renderSpotlight(state.bookings);
        renderFilters();
        renderBookings();
        syncHoldRefreshTicker();
    }
}

async function requestBookingCancellation(bookingId) {
    const url = `${API_BASE}/bookings/cancel/${encodeURIComponent(bookingId)}`;

    for (const method of ['POST', 'PUT']) {
        const response = await fetch(url, {
            method,
            headers: authHeaders()
        });
        const payload = await response.json().catch(() => null);

        if (response.status === 405 && method === 'POST') continue;

        if (!response.ok) {
            throw new Error(payload?.message || 'Failed to cancel booking.');
        }

        if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'success')) {
            if (!payload.success) throw new Error(payload.message || 'Failed to cancel booking.');
            return payload.data;
        }

        return payload;
    }

    throw new Error('Failed to cancel booking.');
}

function buildCancelledBooking(booking, responseData) {
    const nextBooking = responseData && typeof responseData === 'object'
        ? {
            ...booking,
            ...responseData,
            status: responseData.status ?? 'CANCELLED'
        }
        : {
            ...booking,
            status: 'CANCELLED'
        };

    return normalizeBooking(nextBooking);
}

function renderLoadingState() {
    elements.bookingsGrid.innerHTML = `
        <div class="skeleton-grid">
            ${Array.from({ length: 4 }, () => '<div class="skeleton-card"></div>').join('')}
        </div>
    `;
    elements.resultCountLabel.textContent = 'Loading...';
}

function renderSummary(bookings) {
    const confirmed = bookings.filter(isConfirmedStatus).length;
    const upcoming = bookings.filter(isUpcomingBooking).length;
    const totalSpend = bookings
        .filter(booking => String(booking.status || '').toUpperCase() === 'CONFIRMED')
        .reduce((sum, booking) => sum + booking.totalAmount, 0);
    const mostRecent = getMostRecentBooking(bookings);

    const cards = [
        {
            label: 'Total Bookings',
            value: String(bookings.length),
            note: bookings.length ? 'Every reservation linked to this account.' : 'Your archive will count every reservation here.'
        },
        {
            label: 'Upcoming Shows',
            value: String(upcoming),
            note: upcoming ? 'These screenings are still ahead of showtime.' : 'No future screenings are lined up yet.'
        },
        {
            label: 'Confirmed Tickets',
            value: String(confirmed),
            note: confirmed ? 'Confirmed and successful bookings counted live.' : 'Confirmed tickets will appear once available.'
        },
        {
            label: 'Total Spend',
            value: formatCurrency(totalSpend),
            note: mostRecent ? `Calculated from confirmed bookings only. Latest booking on ${formatDateTime(mostRecent.bookedAt)}.` : 'Calculated from confirmed bookings only.'
        }
    ];

    elements.summaryGrid.innerHTML = cards.map(card => `
        <article class="summary-card">
            <span>${escapeHtml(card.label)}</span>
            <strong>${escapeHtml(card.value)}</strong>
            <p>${escapeHtml(card.note)}</p>
        </article>
    `).join('');
}

function renderSpotlight(bookings) {
    const featured = getNextUpcomingBooking(bookings) || getMostRecentBooking(bookings);

    if (!featured) {
        elements.spotlightCard.innerHTML = `
            <div class="spotlight-tag">Next On Screen</div>
            <h2>Your next headline booking appears here.</h2>
            <p>Once you reserve a show, this panel will spotlight the nearest screening with its venue, amount, and booking status.</p>
        `;
        return;
    }

    const tone = pillTone(featured.status);
    const hold = getActiveHoldDetails(featured);

    elements.spotlightCard.innerHTML = `
        <div>
            <div class="spotlight-tag">Featured Booking</div>
            <h2>${escapeHtml(featured.movieName)}</h2>
            <p>${escapeHtml(featured.theatreName)} | ${escapeHtml(featured.screenName)}</p>
        </div>
        ${hold ? `
            <div class="booking-hold-banner">
                <span>Payment Hold</span>
                <strong>${escapeHtml(hold.countdown)}</strong>
            </div>
        ` : ''}
        <div class="spotlight-details">
            <div class="spotlight-detail">
                <span>Status</span>
                <strong><span class="status-pill ${tone}">${escapeHtml(humanizeStatus(featured.status))}</span></strong>
            </div>
            <div class="spotlight-detail">
                <span>Total</span>
                <strong>${escapeHtml(formatCurrency(featured.totalAmount))}</strong>
            </div>
            <div class="spotlight-detail">
                <span>Show Time</span>
                <strong>${escapeHtml(formatDateTime(featured.showTime))}</strong>
            </div>
            <div class="spotlight-detail">
                <span>Booked On</span>
                <strong>${escapeHtml(formatDateTime(featured.bookedAt))}</strong>
            </div>
        </div>
    `;
}

function renderFilters() {
    const visibleBookings = getFilteredBookings();
    elements.resultCountLabel.textContent = `${visibleBookings.length} booking${visibleBookings.length === 1 ? '' : 's'}`;

    elements.filterChips.innerHTML = filters.map(filter => {
        const count = countForFilter(filter.key);
        return `
            <button
                class="filter-chip ${filter.key === state.filter ? 'active' : ''}"
                type="button"
                data-filter="${filter.key}"
                role="tab"
                aria-selected="${filter.key === state.filter ? 'true' : 'false'}"
            >
                ${escapeHtml(filter.label)} (${count})
            </button>
        `;
    }).join('');

    elements.filterChips.querySelectorAll('[data-filter]').forEach(button => {
        button.addEventListener('click', () => {
            state.filter = button.dataset.filter;
            renderFilters();
            renderBookings();
        });
    });
}

function renderBookings() {
    if (state.loading) {
        renderLoadingState();
        return;
    }

    const bookings = getFilteredBookings();
    elements.resultCountLabel.textContent = `${bookings.length} booking${bookings.length === 1 ? '' : 's'}`;

    if (!state.bookings.length) {
        elements.bookingsGrid.innerHTML = '';
        return;
    }

    if (!bookings.length) {
        elements.bookingsGrid.innerHTML = `
            <div class="page-state visible">
                <span class="state-eyebrow">No Matches</span>
                <h3>Nothing matches this view right now.</h3>
                <p>Try another status filter or clear the search box to bring the rest of your booking archive back into view.</p>
            </div>
        `;
        return;
    }

    elements.bookingsGrid.innerHTML = bookings.map((booking, index) => renderBookingCard(booking, index)).join('');
}

function renderBookingCard(booking, index) {
    const tone = pillTone(booking.status);
    const phase = bookingPhase(booking);
    const isCancelling = state.cancellingBookingIds.has(String(booking.bookingId));
    const canCancel = canCancelBooking(booking);
    const hold = getActiveHoldDetails(booking);

    return `
        <article class="booking-card tone-${tone}" style="animation-delay:${Math.min(index * 70, 280)}ms">
            <div class="booking-card-inner">
                <div class="booking-topline">
                    <div>
                        <p class="booking-overline">Booking #${escapeHtml(booking.bookingId ?? 'N/A')}</p>
                        <h3>${escapeHtml(booking.movieName)}</h3>
                        <p class="booking-venue">${escapeHtml(booking.theatreName)} | ${escapeHtml(booking.screenName)}</p>
                    </div>

                    <div class="status-cluster">
                        <span class="status-pill ${tone}">${escapeHtml(humanizeStatus(booking.status))}</span>
                        <span class="phase-pill ${phase.tone}">${escapeHtml(phase.label)}</span>
                    </div>
                </div>

                <div class="booking-metrics">
                    <div class="metric-card">
                        <span class="meta-label">Show Time</span>
                        <strong class="metric-value">${escapeHtml(formatDateTime(booking.showTime))}</strong>
                    </div>
                    <div class="metric-card">
                        <span class="meta-label">Booked At</span>
                        <strong class="metric-value">${escapeHtml(formatDateTime(booking.bookedAt))}</strong>
                    </div>
                    <div class="metric-card">
                        <span class="meta-label">Amount</span>
                        <strong class="metric-value">${escapeHtml(formatCurrency(booking.totalAmount))}</strong>
                    </div>
                    <div class="metric-card">
                        <span class="meta-label">Show Reference</span>
                        <strong class="metric-value">${escapeHtml(booking.showId ? `Show #${booking.showId}` : 'Not available')}</strong>
                    </div>
                </div>

                ${hold ? `
                    <div class="booking-hold-banner inline">
                        <span>Seat hold active</span>
                        <strong>${escapeHtml(hold.countdown)}</strong>
                    </div>
                ` : ''}

                <div class="booking-footer">
                    <div class="booking-footer-copy">
                        <span>Status timeline updates live from your account.</span>
                        <strong>${escapeHtml(relativeTimeLabel(booking.showTime))}</strong>
                    </div>
                    ${canCancel ? `
                        <button
                            class="booking-action-button booking-action-danger"
                            type="button"
                            data-cancel-booking-id="${escapeHtml(booking.bookingId)}"
                            ${isCancelling ? 'disabled' : ''}
                        >
                            ${isCancelling ? 'Cancelling...' : 'Cancel Booking'}
                        </button>
                    ` : ''}
                </div>
            </div>
        </article>
    `;
}

function getFilteredBookings() {
    return state.bookings.filter(booking => matchesFilter(booking, state.filter) && matchesSearch(booking, state.search));
}

function countForFilter(filterKey) {
    return state.bookings.filter(booking => matchesFilter(booking, filterKey) && matchesSearch(booking, state.search)).length;
}

function matchesFilter(booking, filterKey) {
    if (filterKey === 'ALL') return true;
    if (filterKey === 'UPCOMING') return isUpcomingBooking(booking);
    if (filterKey === 'CONFIRMED') return isConfirmedStatus(booking);
    if (filterKey === 'PENDING') return isPendingStatus(booking);
    if (filterKey === 'CANCELLED') return isCancelledStatus(booking);
    return true;
}

function matchesSearch(booking, searchTerm) {
    if (!searchTerm) return true;

    const haystack = [
        booking.bookingId,
        booking.movieName,
        booking.theatreName,
        booking.screenName,
        booking.showId,
        booking.status
    ].join(' ').toLowerCase();

    return haystack.includes(searchTerm);
}

function isUpcomingBooking(booking) {
    if (isCancelledStatus(booking)) return false;
    const showTime = parseDateTimeValue(booking.showTime);
    return !!showTime && showTime.getTime() > Date.now();
}

function isConfirmedStatus(booking) {
    return matchesStatus(booking.status, ['CONFIRMED', 'BOOKED', 'SUCCESS', 'COMPLETED', 'PAID']);
}

function canCancelBooking(booking) {
    if (!booking?.bookingId || !isConfirmedStatus(booking)) return false;

    const showTime = parseDateTimeValue(booking.showTime);
    return !showTime || showTime.getTime() > Date.now();
}

function isPendingStatus(booking) {
    return matchesStatus(booking.status, ['PENDING', 'PROCESSING', 'INITIATED', 'HOLD']);
}

function isCancelledStatus(booking) {
    return matchesStatus(booking.status, ['CANCEL', 'REFUND', 'FAILED', 'EXPIRED']);
}

function matchesStatus(status, tokens) {
    const normalized = String(status || '').toUpperCase();
    return tokens.some(token => normalized.includes(token));
}

function bookingPhase(booking) {
    if (isCancelledStatus(booking)) return { label: 'Interrupted', tone: 'danger' };
    if (isPendingStatus(booking)) return { label: 'Awaiting Completion', tone: 'warning' };
    if (isUpcomingBooking(booking)) return { label: 'Upcoming Show', tone: 'info' };
    if (isConfirmedStatus(booking)) return { label: 'Screened or Confirmed', tone: 'success' };
    return { label: 'On Record', tone: 'info' };
}

function humanizeStatus(status) {
    return String(status || 'UNKNOWN').replaceAll('_', ' ');
}

function pillTone(status) {
    if (isCancelledStatus({ status })) return 'danger';
    if (isPendingStatus({ status })) return 'warning';
    if (isConfirmedStatus({ status })) return 'success';
    return 'info';
}

function getNextUpcomingBooking(bookings) {
    return bookings
        .filter(isUpcomingBooking)
        .sort((a, b) => toTimestamp(a.showTime) - toTimestamp(b.showTime))[0] || null;
}

function getMostRecentBooking(bookings) {
    return bookings
        .slice()
        .sort((a, b) => toTimestamp(b.bookedAt) - toTimestamp(a.bookedAt))[0] || null;
}

function toTimestamp(value) {
    const parsed = parseDateTimeValue(value);
    return parsed ? parsed.getTime() : 0;
}

function parseDateTimeValue(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') {
        const parsedFromNumber = new Date(value);
        return Number.isNaN(parsedFromNumber.getTime()) ? null : parsedFromNumber;
    }
    if (typeof value !== 'string') return null;

    const normalized = value.trim().replace(' ', 'T');
    if (!normalized) return null;

    const localDateTimeMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/);
    if (localDateTimeMatch) {
        const [, year, month, day, hour, minute, second = '0', fraction = '0'] = localDateTimeMatch;
        const milliseconds = Number(fraction.slice(0, 3).padEnd(3, '0'));
        return new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second),
            milliseconds
        );
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value) {
    const parsed = parseDateTimeValue(value);
    if (!parsed) return 'Not available';
    return parsed.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function relativeTimeLabel(value) {
    const parsed = parseDateTimeValue(value);
    if (!parsed) return 'Schedule pending';

    const diff = parsed.getTime() - Date.now();
    const absMinutes = Math.round(Math.abs(diff) / 60000);

    if (absMinutes < 60) {
        return diff >= 0 ? 'Within the hour' : 'About an hour ago';
    }

    const absHours = Math.round(absMinutes / 60);
    if (absHours < 48) {
        return diff >= 0 ? `In ${absHours} hour${absHours === 1 ? '' : 's'}` : `${absHours} hour${absHours === 1 ? '' : 's'} ago`;
    }

    const absDays = Math.round(absHours / 24);
    return diff >= 0 ? `In ${absDays} day${absDays === 1 ? '' : 's'}` : `${absDays} day${absDays === 1 ? '' : 's'} ago`;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2
    }).format(Number(amount) || 0);
}

function showState(title, description, actionsMarkup = '') {
    elements.pageState.classList.add('visible');
    elements.pageState.innerHTML = `
        <span class="state-eyebrow">Archive Status</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
        ${actionsMarkup}
    `;
}

function hideState() {
    elements.pageState.classList.remove('visible');
    elements.pageState.innerHTML = '';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    elements.toastRegion.appendChild(toast);

    window.setTimeout(() => {
        toast.remove();
    }, 3200);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

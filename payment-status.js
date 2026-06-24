const PAYMENT_RESULT_KEY = 'cinesphere-payment-result';
const BOOKING_DRAFT_KEY = 'cinesphere-booking-draft';

document.addEventListener('DOMContentLoaded', () => {
    const pageStatus = document.body.dataset.paymentStatus || 'success';
    const paymentSummary = normalizePaymentSummary(readStoredJson(PAYMENT_RESULT_KEY))
        || normalizeDraftFallback(readStoredJson(BOOKING_DRAFT_KEY));

    renderPaymentStatus(pageStatus, paymentSummary);
});

function readStoredJson(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
        return null;
    }
}

function normalizePaymentSummary(summary) {
    if (!summary || typeof summary !== 'object') return null;
    return {
        status: summary.status ?? 'UNKNOWN',
        bookingId: summary.bookingId ?? summary.id ?? null,
        movieTitle: summary.movieTitle ?? summary.movieName ?? 'Movie Night',
        theatreName: summary.theatreName ?? 'Theatre not available',
        screenName: summary.screenName ?? 'Screen not available',
        showStartTime: summary.showStartTime ?? summary.startTime ?? null,
        seats: Array.isArray(summary.seats) ? summary.seats : [],
        seatCount: summary.seatCount ?? (Array.isArray(summary.seats) ? summary.seats.length : 0),
        totalAmount: Number(summary.totalAmount) || 0,
        customerName: summary.customerName ?? localStorage.getItem('userName') ?? '',
        customerEmail: summary.customerEmail ?? localStorage.getItem('userEmail') ?? '',
        orderId: summary.orderId ?? null,
        paymentId: summary.paymentId ?? null,
        reason: summary.reason ?? '',
        code: summary.code ?? '',
        createdAt: summary.createdAt ?? null
    };
}

function normalizeDraftFallback(draft) {
    if (!draft || typeof draft !== 'object') return null;
    return {
        status: 'PENDING',
        bookingId: draft.bookingId ?? draft.id ?? null,
        movieTitle: draft.movieTitle ?? draft.movieName ?? 'Movie Night',
        theatreName: draft.theatreName ?? 'Theatre not available',
        screenName: draft.screenName ?? 'Screen not available',
        showStartTime: draft.showStartTime ?? draft.startTime ?? null,
        seats: Array.isArray(draft.seats)
            ? draft.seats.map(seat => typeof seat === 'string' ? seat : seat?.seatLabel).filter(Boolean)
            : [],
        seatCount: draft.seatCount ?? (Array.isArray(draft.seats) ? draft.seats.length : 0),
        totalAmount: Number(draft.totalAmount) || 0,
        customerName: localStorage.getItem('userName') || '',
        customerEmail: localStorage.getItem('userEmail') || '',
        orderId: null,
        paymentId: null,
        reason: '',
        code: '',
        createdAt: null
    };
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2
    }).format(Number(amount) || 0);
}

function formatDateTime(value) {
    if (!value) return 'Not available';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function renderPaymentStatus(pageStatus, summary) {
    const seats = summary?.seats || [];
    const venueLine = summary ? `${summary.theatreName} (${summary.screenName})` : 'Venue details unavailable';
    const timestamp = summary?.createdAt ? formatDateTime(summary.createdAt) : formatDateTime(summary?.showStartTime);

    setText('statusMovie', summary?.movieTitle || 'No recent booking found');
    setText('statusVenue', venueLine);
    setText('statusAmount', formatCurrency(summary?.totalAmount || 0));
    setText('statusSeatCount', `${summary?.seatCount || 0} seat${summary?.seatCount === 1 ? '' : 's'}`);
    setText('statusTimestamp', timestamp);
    setText('statusBookingId', summary?.bookingId ? `#${summary.bookingId}` : 'Unavailable');
    setText('statusOrderId', summary?.orderId || 'Not generated');
    setText('statusPaymentId', summary?.paymentId || 'Pending');
    setText('statusShowTime', formatDateTime(summary?.showStartTime));
    setText('statusCustomer', [summary?.customerName, summary?.customerEmail].filter(Boolean).join(' | ') || 'Guest checkout');

    const reason = pageStatus === 'failure'
        ? summary?.reason || 'The transaction could not be completed.'
        : 'Your payment was verified successfully and the booking is ready.';
    setText('statusNote', reason);
    setText('statusCode', summary?.code || 'None');

    const seatList = document.getElementById('statusSeats');
    seatList.innerHTML = seats.length
        ? seats.map(seat => `<span class="seat-chip">${escapeHtml(seat)}</span>`).join('')
        : '<span class="seat-chip muted">Seat details unavailable</span>';

    const retryButton = document.getElementById('retryBtn');
    if (retryButton) {
        retryButton.addEventListener('click', () => {
            window.location.href = 'checkout.html';
        });
    }

    const homeButtons = document.querySelectorAll('[data-go-home]');
    homeButtons.forEach(button => {
        button.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

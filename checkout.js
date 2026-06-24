const API_BASE = 'http://localhost:8080/api';
const BOOKING_DRAFT_KEY = 'cinesphere-booking-draft';
const ACTIVE_BOOKING_ID_KEY = 'cinesphere-active-booking-id';
const PAYMENT_RESULT_KEY = 'cinesphere-payment-result';
let paymentHoldIntervalId = null;

document.addEventListener('DOMContentLoaded', () => {
    const draft = normalizeDraft(readStoredJson(BOOKING_DRAFT_KEY));

    if (!draft) {
        window.location.href = 'index.html';
        return;
    }

    const bookingId = getStoredBookingId(draft);
    if (bookingId) setStoredBookingId(bookingId);

    renderCheckout(draft, bookingId);
    startPaymentHoldTimer(draft);
    clearMessage();

    const payButton = document.getElementById('payBtn');
    payButton.addEventListener('click', () => initiateRazorpay(draft));

    const backButton = document.getElementById('backBtn');
    backButton.addEventListener('click', () => window.history.back());
});

function readStoredJson(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
        return null;
    }
}

function writeStoredJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function normalizeDraft(rawDraft) {
    if (!rawDraft || typeof rawDraft !== 'object') return null;

    const seats = normalizeSeats(rawDraft.seats);
    const totalAmount = Number(rawDraft.totalAmount);

    return {
        ...rawDraft,
        bookingId: rawDraft.bookingId ?? rawDraft.id ?? null,
        movieTitle: rawDraft.movieTitle ?? rawDraft.movieName ?? 'Movie Night',
        movieName: rawDraft.movieName ?? rawDraft.movieTitle ?? 'Movie Night',
        theatreName: rawDraft.theatreName ?? rawDraft.theaterName ?? 'Theatre not available',
        screenName: rawDraft.screenName ?? 'Screen not available',
        showStartTime: rawDraft.showStartTime ?? rawDraft.startTime ?? rawDraft.show?.startTime ?? null,
        seats,
        seatCount: rawDraft.seatCount ?? seats.length,
        totalAmount: Number.isFinite(totalAmount)
            ? totalAmount
            : seats.reduce((sum, seat) => sum + (Number(seat.price) || 0), 0)
    };
}

function normalizeSeats(rawSeats) {
    if (!Array.isArray(rawSeats)) return [];
    return rawSeats
        .map(seat => {
            if (typeof seat === 'string') {
                return { seatLabel: seat, seatType: 'Seat', price: 0 };
            }

            if (!seat || typeof seat !== 'object') return null;

            return {
                id: seat.id ?? seat.seatId ?? null,
                seatLabel: seat.seatLabel ?? seat.label ?? seat.seatNumber ?? 'Seat',
                seatType: seat.seatType ?? seat.type ?? 'Seat',
                price: Number(seat.price) || 0,
                expiresAt: seat.expiresAt ?? null
            };
        })
        .filter(Boolean);
}

function getStoredBookingId(draft) {
    return draft?.bookingId ?? draft?.id ?? localStorage.getItem(ACTIVE_BOOKING_ID_KEY) ?? localStorage.getItem('bookingId');
}

function setStoredBookingId(bookingId) {
    if (bookingId === null || bookingId === undefined || bookingId === '') return;
    const normalized = String(bookingId);
    localStorage.setItem(ACTIVE_BOOKING_ID_KEY, normalized);
    localStorage.setItem('bookingId', normalized);
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2
    }).format(Number(amount) || 0);
}

function formatDateTime(value) {
    if (!value) return 'To be announced';
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

function formatCountdown(msRemaining) {
    const safe = Math.max(0, Math.floor(msRemaining / 1000));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getDraftHoldExpiry(draft) {
    if (!Array.isArray(draft?.seats)) return null;
    const futureExpiries = draft.seats
        .map(seat => Number(seat?.expiresAt))
        .filter(value => Number.isFinite(value) && value > Date.now());
    return futureExpiries.length ? Math.min(...futureExpiries) : null;
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function renderCheckout(draft, bookingId) {
    const seatLabels = draft.seats.map(seat => seat.seatLabel);
    const customerLine = [localStorage.getItem('userName'), localStorage.getItem('userEmail')].filter(Boolean).join(' | ');

    document.title = `${draft.movieTitle} | Checkout | CineSphere`;

    setText('displayMovie', draft.movieTitle);
    setText('displayBookingId', bookingId ? `Booking #${bookingId}` : 'Booking reference pending');
    setText('displayTheatre', `${draft.theatreName} (${draft.screenName})`);
    setText('displayShowTime', formatDateTime(draft.showStartTime));
    setText('displaySeatCount', `${draft.seatCount} seat${draft.seatCount === 1 ? '' : 's'}`);
    setText('displayAmount', formatCurrency(draft.totalAmount));
    setText('displayCustomer', customerLine || 'Guest checkout');
    setText('displaySeatSummary', seatLabels.join(', ') || 'Seat details will appear here.');
    setText('payBtnLabel', `Pay ${formatCurrency(draft.totalAmount)} with Razorpay`);

    const seatChips = document.getElementById('displaySeatChips');
    seatChips.innerHTML = seatLabels.length
        ? seatLabels.map(label => `<span class="seat-pill">${escapeHtml(label)}</span>`).join('')
        : '<span class="seat-pill muted">Seats unavailable</span>';

    const payButton = document.getElementById('payBtn');
    if (!bookingId) {
        payButton.disabled = true;
        showMessage('We could not find a booking reference for this draft. Please reselect your seats once.', 'error');
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function showMessage(message, type = 'info') {
    const messageBox = document.getElementById('checkoutMessage');
    messageBox.className = `checkout-message ${type}`;
    messageBox.textContent = message;
    messageBox.hidden = false;
}

function clearMessage() {
    const messageBox = document.getElementById('checkoutMessage');
    messageBox.hidden = true;
    messageBox.textContent = '';
    messageBox.className = 'checkout-message';
}

function authHeaders() {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function resolveOrderId(orderData) {
    if (!orderData) return null;
    if (typeof orderData === 'string') return orderData;
    return orderData.orderId ?? orderData.id ?? null;
}

function resolveOrderAmountPaise(orderData, fallbackTotal) {
    if (typeof orderData === 'object' && Number.isFinite(Number(orderData?.amount))) {
        return Number(orderData.amount);
    }

    return Math.round((Number(fallbackTotal) || 0) * 100);
}

function buildPaymentSummary(draft, extras = {}) {
    return {
        status: extras.status ?? 'PENDING',
        bookingId: extras.bookingId ?? getStoredBookingId(draft) ?? null,
        movieTitle: draft.movieTitle,
        theatreName: draft.theatreName,
        screenName: draft.screenName,
        showStartTime: draft.showStartTime ?? null,
        seats: draft.seats.map(seat => seat.seatLabel),
        seatCount: draft.seatCount ?? draft.seats.length,
        totalAmount: draft.totalAmount,
        customerName: localStorage.getItem('userName') || '',
        customerEmail: localStorage.getItem('userEmail') || '',
        orderId: extras.orderId ?? null,
        paymentId: extras.paymentId ?? null,
        reason: extras.reason ?? '',
        code: extras.code ?? '',
        createdAt: extras.createdAt ?? new Date().toISOString()
    };
}

function storePaymentSummary(summary) {
    writeStoredJson(PAYMENT_RESULT_KEY, summary);
}

function setPayButtonState(isBusy, label = '') {
    const button = document.getElementById('payBtn');
    const labelNode = document.getElementById('payBtnLabel');

    button.disabled = isBusy;
    button.classList.toggle('is-loading', isBusy);
    labelNode.textContent = label || `Pay ${document.getElementById('displayAmount').textContent} with Razorpay`;
}

function renderPaymentHoldTimer(draft) {
    const timerCard = document.getElementById('paymentHoldTimer');
    const countdownNode = document.getElementById('paymentHoldCountdown');
    const noteNode = document.getElementById('paymentHoldNote');
    const payButton = document.getElementById('payBtn');
    if (!timerCard || !countdownNode || !noteNode || !payButton) return;

    const expiry = getDraftHoldExpiry(draft);
    if (!expiry) {
        timerCard.hidden = true;
        timerCard.className = 'payment-timer-card';
        return;
    }

    const remaining = expiry - Date.now();
    timerCard.hidden = false;

    if (remaining <= 0) {
        countdownNode.textContent = 'Expired';
        noteNode.textContent = 'Your 5-minute hold ended. Please reselect seats before trying to pay again.';
        timerCard.className = 'payment-timer-card expired';
        payButton.disabled = true;
        return;
    }

    countdownNode.textContent = formatCountdown(remaining);
    noteNode.textContent = 'Finish payment before the hold expires or these seats may be released.';
    timerCard.className = remaining <= 60000 ? 'payment-timer-card warning' : 'payment-timer-card';
}

function startPaymentHoldTimer(draft) {
    renderPaymentHoldTimer(draft);
    if (paymentHoldIntervalId) window.clearInterval(paymentHoldIntervalId);
    paymentHoldIntervalId = window.setInterval(() => {
        renderPaymentHoldTimer(draft);
    }, 1000);
}

async function initiateRazorpay(draft) {
    const bookingId = getStoredBookingId(draft);

    if (!bookingId) {
        storePaymentSummary(buildPaymentSummary(draft, {
            status: 'FAILED',
            reason: 'Booking reference missing. Please select your seats again.'
        }));
        window.location.href = 'failed.html';
        return;
    }

    if (typeof Razorpay !== 'function') {
        storePaymentSummary(buildPaymentSummary(draft, {
            status: 'FAILED',
            bookingId,
            reason: 'Razorpay checkout script did not load.'
        }));
        window.location.href = 'failed.html';
        return;
    }

    clearMessage();
    setStoredBookingId(bookingId);
    setPayButtonState(true, 'Preparing secure payment...');

    try {
        const orderResponse = await fetch(`${API_BASE}/payments/create-order/${bookingId}`, {
            method: 'POST',
            headers: authHeaders()
        });
        const orderResult = await orderResponse.json();

        if (!orderResponse.ok || !orderResult?.success) {
            throw new Error(orderResult?.message || 'Could not create payment order.');
        }

        const orderId = resolveOrderId(orderResult.data);
        if (!orderId) throw new Error('Payment order id was missing from the response.');

        const options = {
            key: 'rzp_test_SYc2WglxFRFwqY',
            amount: resolveOrderAmountPaise(orderResult.data, draft.totalAmount),
            currency: orderResult?.data?.currency || 'INR',
            name: 'CineSphere',
            description: `Tickets for ${draft.movieTitle}`,
            order_id: orderId,
            handler: response => verifyPayment(response, draft, bookingId),
            prefill: {
                name: localStorage.getItem('userName') || '',
                email: localStorage.getItem('userEmail') || '',
                contact: localStorage.getItem('userPhone') || ''
            },
            notes: {
                bookingId: String(bookingId),
                movieTitle: draft.movieTitle
            },
            theme: { color: '#d1495b' },
            modal: {
                ondismiss: () => {
                    setPayButtonState(false);
                    showMessage('Payment window closed. Your seats are still saved, so you can retry anytime.', 'info');
                }
            }
        };

        const razorpay = new Razorpay(options);

        razorpay.on('payment.failed', event => {
            const error = event?.error || {};
            storePaymentSummary(buildPaymentSummary(draft, {
                status: 'FAILED',
                bookingId,
                orderId: error.metadata?.order_id ?? orderId,
                paymentId: error.metadata?.payment_id ?? null,
                code: error.code ?? '',
                reason: error.description ?? error.reason ?? 'Payment was not completed.'
            }));
            window.location.href = 'failed.html';
        });

        razorpay.open();
    } catch (error) {
        setPayButtonState(false);
        storePaymentSummary(buildPaymentSummary(draft, {
            status: 'FAILED',
            bookingId,
            reason: error.message || 'Payment initialization failed.'
        }));
        window.location.href = 'failed.html';
    }
}

async function verifyPayment(paymentData, draft, bookingId) {
    try {
        const response = await fetch(`${API_BASE}/payments/verify/${bookingId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders()
            },
            body: JSON.stringify({
                razorpayOrderId: paymentData.razorpay_order_id,
                razorpayPaymentId: paymentData.razorpay_payment_id,
                razorpaySignature: paymentData.razorpay_signature
            })
        });

        const result = await response.json();

        if (!response.ok || !result?.success) {
            throw new Error(result?.message || 'Payment verification failed.');
        }

        storePaymentSummary(buildPaymentSummary(draft, {
            status: 'SUCCESS',
            bookingId,
            orderId: paymentData.razorpay_order_id,
            paymentId: paymentData.razorpay_payment_id
        }));

        localStorage.removeItem(BOOKING_DRAFT_KEY);
        localStorage.removeItem(ACTIVE_BOOKING_ID_KEY);
        localStorage.removeItem('bookingId');

        window.location.href = 'success.html';
    } catch (error) {
        setPayButtonState(false);
        storePaymentSummary(buildPaymentSummary(draft, {
            status: 'FAILED',
            bookingId,
            orderId: paymentData?.razorpay_order_id ?? null,
            paymentId: paymentData?.razorpay_payment_id ?? null,
            reason: error.message || 'Payment verification failed.'
        }));
        window.location.href = 'failed.html';
    }
}

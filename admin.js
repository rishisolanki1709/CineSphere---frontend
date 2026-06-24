/* ============================================================
   CINESPHERE — Admin Panel Logic
   Enhanced UX: Better loading, toast system, refined UI generation
   ============================================================ */

let currentEditId = null;
let currentEditTheaterId = null;
let currentOverviewRange = 'overall';
let overviewLoadSequence = 0;

const OVERVIEW_RANGE_OPTIONS = [
    { value: 'overall', label: 'Overall' },
    { value: 'today', label: 'Today' },
    { value: 'last_week', label: 'Last Week' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'last_year', label: 'Last Year' }
];

// ── TOAST SYSTEM ──────────────────────────────────────────────
const toastContainer = document.createElement('div');
toastContainer.id = 'toast-container';
document.body.appendChild(toastContainer);

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
        <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
}

// ── UNIVERSAL API RESPONSE PROCESSOR ──────────────────────────
async function processResponse(response) {
    const apiResponse = await response.json();
    if (response.ok && apiResponse.success) {
        if (apiResponse.message) showToast(apiResponse.message, 'success');
        return apiResponse.data;
    } else {
        const errorMsg = apiResponse.message || 'Something went wrong';
        showToast(errorMsg, 'error');
        throw new Error(errorMsg);
    }
}

// ── HELPERS ────────────────────────────────────────────────────
function authHeaders() {
    return { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
}
function authJsonHeaders() {
    return { ...authHeaders(), 'Content-Type': 'application/json' };
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

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function numberValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
    return null;
}

function formatCurrency(value) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2
    }).format(numberValue(value));
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
    if (!value) return 'Not available';
    const parsed = parseDateTimeValue(value);
    if (!parsed) return String(value);
    return parsed.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function humanizeStatus(status) {
    return String(status || 'UNKNOWN').replaceAll('_', ' ');
}

function statusClass(status) {
    const normalized = String(status || '').toUpperCase();
    if (!normalized) return 'status-info';
    if (normalized.includes('SUCCESS') || normalized.includes('CONFIRMED') || normalized.includes('PAID') || normalized.includes('BOOKED') || normalized.includes('COMPLETED')) return 'status-success';
    if (normalized.includes('PENDING')) return 'status-warning';
    if (normalized.includes('FAILED') || normalized.includes('CANCEL') || normalized.includes('REFUND')) return 'status-danger';
    return 'status-info';
}

function matchesStatus(status, tokens) {
    const normalized = String(status || '').toUpperCase();
    return tokens.some(token => normalized.includes(token));
}

function renderStatusPill(status) {
    return `<span class="status-pill ${statusClass(status)}">${escapeHtml(humanizeStatus(status))}</span>`;
}

function renderMetricCards(cards) {
    return `
        <div class="stats-grid">
            ${cards.map(card => `
                <div class="stat-card">
                    <div class="card-header">
                        <span>${escapeHtml(card.label)}</span>
                        <i class="fa-solid ${escapeHtml(card.icon || 'fa-chart-line')}" style="color:${card.color || 'var(--white-faint)'}"></i>
                    </div>
                    <div class="card-value">${escapeHtml(card.value)}</div>
                    <div class="card-subtext" style="color:${card.color || 'var(--white-dim)'}">${escapeHtml(card.note || '')}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function sanitizeOverviewRange(range) {
    const normalized = String(range || '').trim().toLowerCase();
    return OVERVIEW_RANGE_OPTIONS.some(option => option.value === normalized) ? normalized : 'overall';
}

function overviewRangeLabel(range) {
    return OVERVIEW_RANGE_OPTIONS.find(option => option.value === sanitizeOverviewRange(range))?.label || 'Overall';
}

function formatOverviewDate(value, withYear = false) {
    if (!value) return 'Unknown';
    const parsed = parseDateTimeValue(value);
    if (!parsed) return String(value);
    return parsed.toLocaleDateString('en-IN', withYear
        ? { day: '2-digit', month: 'short', year: 'numeric' }
        : { day: '2-digit', month: 'short' });
}

function formatCompactNumber(value) {
    return new Intl.NumberFormat('en-IN', {
        notation: 'compact',
        maximumFractionDigits: 1
    }).format(numberValue(value));
}

function formatCompactCurrency(value) {
    return `INR ${formatCompactNumber(value)}`;
}

function truncateLabel(value, maxLength = 18) {
    const text = String(value || '');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function createSpacedIndexes(total, maxLabels = 6) {
    if (total <= 0) return [];
    if (total <= maxLabels) return Array.from({ length: total }, (_, index) => index);

    const indexes = [];
    const step = (total - 1) / (maxLabels - 1);
    for (let index = 0; index < maxLabels; index += 1) {
        indexes.push(Math.round(index * step));
    }
    return [...new Set(indexes)];
}

function normalizeOverviewRevenueData(revenueData) {
    return (Array.isArray(revenueData) ? revenueData : [])
        .map((entry, index) => {
            const rawDate = textValue(entry?.date) || `Point ${index + 1}`;
            const parsed = parseDateTimeValue(rawDate);
            return {
                date: rawDate,
                value: numberValue(entry?.totalRevenue),
                sortValue: parsed ? parsed.getTime() : Number.MAX_SAFE_INTEGER - 1000 + index
            };
        })
        .sort((left, right) => left.sortValue - right.sortValue);
}

function normalizeOverviewMovieData(movieData) {
    return (Array.isArray(movieData) ? movieData : [])
        .map((entry, index) => ({
            title: textValue(entry?.movieTitle) || `Movie ${index + 1}`,
            tickets: numberValue(entry?.ticketsSold)
        }))
        .sort((left, right) => right.tickets - left.tickets || left.title.localeCompare(right.title));
}

function groupOverviewStatusData(statusData) {
    const groups = [
        { key: 'confirmed', label: 'Confirmed', color: 'var(--green)', count: 0 },
        { key: 'cancelled', label: 'Cancelled', color: 'var(--crimson)', count: 0 },
        { key: 'refunded', label: 'Refunded', color: 'var(--amber)', count: 0 },
        { key: 'other', label: 'Other', color: 'var(--blue)', count: 0 }
    ];

    (Array.isArray(statusData) ? statusData : []).forEach(entry => {
        const count = numberValue(entry?.count);
        if (count <= 0) return;

        const status = String(entry?.status || '').toUpperCase();
        if (matchesStatus(status, ['REFUND'])) {
            groups[2].count += count;
            return;
        }
        if (matchesStatus(status, ['CANCEL', 'FAILED'])) {
            groups[1].count += count;
            return;
        }
        if (matchesStatus(status, ['CONFIRMED', 'BOOKED', 'SUCCESS', 'COMPLETED', 'PAID'])) {
            groups[0].count += count;
            return;
        }
        groups[3].count += count;
    });

    return groups.filter(group => group.count > 0);
}

function overviewChartEmptyState(icon, title, note) {
    return `
        <div class="overview-chart-empty">
            <i class="fa-solid ${escapeHtml(icon)}"></i>
            <p>${escapeHtml(title)}</p>
            ${note ? `<span>${escapeHtml(note)}</span>` : ''}
        </div>
    `;
}

function revenueTrendCopy(points, rangeLabel) {
    if (points.length < 2) return `Collecting more revenue points for ${rangeLabel.toLowerCase()}.`;

    const firstValue = points[0].value;
    const lastValue = points[points.length - 1].value;
    if (lastValue > firstValue) return `Revenue is growing across ${rangeLabel.toLowerCase()}.`;
    if (lastValue < firstValue) return `Revenue is dropping across ${rangeLabel.toLowerCase()}.`;
    return `Revenue is stable across ${rangeLabel.toLowerCase()}.`;
}

function renderRevenueLineChart(points) {
    if (!points.length) {
        return overviewChartEmptyState(
            'fa-chart-line',
            'No revenue data available for this range.',
            'Switch the range to load another revenue timeline.'
        );
    }

    const width = 780;
    const height = 320;
    const padding = { top: 18, right: 20, bottom: 58, left: 68 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(...points.map(point => point.value), 1);
    const tickCount = 4;
    const showMarkers = points.length <= 18;

    const coordinates = points.map((point, index) => {
        const x = points.length === 1
            ? padding.left + chartWidth / 2
            : padding.left + (index / (points.length - 1)) * chartWidth;
        const y = padding.top + chartHeight - (point.value / maxValue) * chartHeight;
        return { ...point, x, y };
    });

    const baseline = padding.top + chartHeight;
    const linePath = coordinates
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
        .join(' ');
    const areaPath = `${linePath} L ${coordinates[coordinates.length - 1].x.toFixed(2)} ${baseline.toFixed(2)} L ${coordinates[0].x.toFixed(2)} ${baseline.toFixed(2)} Z`;
    const labelIndexes = createSpacedIndexes(points.length, 6);
    const peakPoint = points.reduce((peak, point) => point.value > peak.value ? point : peak, points[0]);
    const latestPoint = points[points.length - 1];

    return `
        <div class="overview-chart-scroll">
            <svg class="overview-line-chart" viewBox="0 0 ${width} ${height}" aria-label="Revenue line chart">
                <defs>
                    <linearGradient id="overviewRevenueLine" x1="0%" x2="100%" y1="0%" y2="0%">
                        <stop offset="0%" stop-color="var(--gold-light)"></stop>
                        <stop offset="100%" stop-color="var(--green)"></stop>
                    </linearGradient>
                    <linearGradient id="overviewRevenueFill" x1="0%" x2="0%" y1="0%" y2="100%">
                        <stop offset="0%" stop-color="rgba(45, 212, 160, 0.28)"></stop>
                        <stop offset="100%" stop-color="rgba(45, 212, 160, 0.02)"></stop>
                    </linearGradient>
                </defs>
                ${Array.from({ length: tickCount + 1 }, (_, index) => {
                    const value = (maxValue / tickCount) * (tickCount - index);
                    const y = padding.top + (chartHeight / tickCount) * index;
                    return `
                        <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="overview-chart-gridline"></line>
                        <text x="${padding.left - 12}" y="${y + 4}" text-anchor="end" class="overview-axis-copy">${escapeHtml(formatCompactCurrency(value))}</text>
                    `;
                }).join('')}
                <line x1="${padding.left}" y1="${baseline}" x2="${width - padding.right}" y2="${baseline}" class="overview-chart-axis"></line>
                ${coordinates.length > 1 ? `<path d="${areaPath}" fill="url(#overviewRevenueFill)"></path>` : ''}
                ${coordinates.length > 1 ? `<path d="${linePath}" fill="none" stroke="url(#overviewRevenueLine)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>` : ''}
                ${coordinates.map((point, index) => `
                    ${showMarkers || index === coordinates.length - 1 ? `
                        <circle cx="${point.x}" cy="${point.y}" r="4.5" fill="var(--black)" stroke="var(--gold-light)" stroke-width="2">
                            <title>${escapeHtml(`${formatOverviewDate(point.date, true)}: ${formatCurrency(point.value)}`)}</title>
                        </circle>
                    ` : ''}
                `).join('')}
                ${labelIndexes.map(index => {
                    const point = coordinates[index];
                    return `
                        <text x="${point.x}" y="${height - 18}" text-anchor="middle" class="overview-axis-copy">${escapeHtml(formatOverviewDate(point.date))}</text>
                    `;
                }).join('')}
                <text x="${padding.left}" y="${padding.top - 2}" class="overview-axis-label">Revenue (INR)</text>
                <text x="${width - padding.right}" y="${height - 18}" text-anchor="end" class="overview-axis-label">Dates</text>
                ${coordinates.length === 1 ? `
                    <line x1="${coordinates[0].x}" y1="${padding.top}" x2="${coordinates[0].x}" y2="${baseline}" class="overview-chart-single-line"></line>
                ` : ''}
            </svg>
        </div>
        <div class="overview-insight-strip">
            <div class="overview-insight-pill">
                <span>Latest</span>
                <strong>${escapeHtml(formatCurrency(latestPoint.value))}</strong>
                <small>${escapeHtml(formatOverviewDate(latestPoint.date, true))}</small>
            </div>
            <div class="overview-insight-pill">
                <span>Peak Day</span>
                <strong>${escapeHtml(formatCurrency(peakPoint.value))}</strong>
                <small>${escapeHtml(formatOverviewDate(peakPoint.date, true))}</small>
            </div>
            <div class="overview-insight-pill">
                <span>Points</span>
                <strong>${escapeHtml(String(points.length))}</strong>
                <small>Revenue checkpoints</small>
            </div>
        </div>
    `;
}

function renderMovieBarChart(movies) {
    const topMovies = movies.slice(0, 6);
    if (!topMovies.length) {
        return overviewChartEmptyState(
            'fa-clapperboard',
            'No movie performance data available yet.',
            'Ticket sales will appear here once the API returns movie stats.'
        );
    }

    const width = Math.max(620, topMovies.length * 112);
    const height = 340;
    const padding = { top: 20, right: 16, bottom: 106, left: 58 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxTickets = Math.max(...topMovies.map(movie => movie.tickets), 1);
    const tickCount = 4;
    const slotWidth = chartWidth / topMovies.length;
    const barWidth = Math.min(56, slotWidth * 0.56);

    return `
        <div class="overview-chart-scroll">
            <svg class="overview-bar-chart" viewBox="0 0 ${width} ${height}" aria-label="Top performing movies bar chart">
                <defs>
                    <linearGradient id="overviewBarGradient" x1="0%" x2="0%" y1="0%" y2="100%">
                        <stop offset="0%" stop-color="var(--gold-light)"></stop>
                        <stop offset="100%" stop-color="var(--crimson)"></stop>
                    </linearGradient>
                </defs>
                ${Array.from({ length: tickCount + 1 }, (_, index) => {
                    const value = (maxTickets / tickCount) * (tickCount - index);
                    const y = padding.top + (chartHeight / tickCount) * index;
                    return `
                        <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="overview-chart-gridline"></line>
                        <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" class="overview-axis-copy">${escapeHtml(formatCompactNumber(value))}</text>
                    `;
                }).join('')}
                <line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${width - padding.right}" y2="${padding.top + chartHeight}" class="overview-chart-axis"></line>
                ${topMovies.map((movie, index) => {
                    const barHeight = maxTickets ? (movie.tickets / maxTickets) * chartHeight : 0;
                    const x = padding.left + slotWidth * index + (slotWidth - barWidth) / 2;
                    const y = padding.top + chartHeight - barHeight;
                    const labelX = x + barWidth / 2;
                    const labelY = padding.top + chartHeight + 26;
                    return `
                        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="8" fill="url(#overviewBarGradient)" opacity="${0.86 - index * 0.06}"></rect>
                        <text x="${labelX}" y="${Math.max(y - 10, padding.top + 12)}" text-anchor="middle" class="overview-bar-value">${escapeHtml(String(movie.tickets))}</text>
                        <text x="${labelX}" y="${labelY}" transform="rotate(-28 ${labelX} ${labelY})" text-anchor="end" class="overview-axis-copy">${escapeHtml(truncateLabel(movie.title, 18))}</text>
                    `;
                }).join('')}
                <text x="${padding.left}" y="${padding.top - 2}" class="overview-axis-label">Tickets Sold</text>
                <text x="${width - padding.right}" y="${height - 18}" text-anchor="end" class="overview-axis-label">Movie Titles</text>
            </svg>
        </div>
        <div class="overview-ranked-list">
            ${topMovies.map((movie, index) => `
                <div class="overview-ranked-item">
                    <span class="overview-ranked-index">${index + 1}</span>
                    <div class="overview-ranked-copy">
                        <strong title="${escapeHtml(movie.title)}">${escapeHtml(truncateLabel(movie.title, 28))}</strong>
                        <span>${escapeHtml(`${movie.tickets.toLocaleString('en-IN')} ticket${movie.tickets === 1 ? '' : 's'} sold`)}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderStatusPieChart(statusItems) {
    const total = statusItems.reduce((sum, item) => sum + item.count, 0);
    if (!total) {
        return overviewChartEmptyState(
            'fa-chart-pie',
            'No booking health data available for this range.',
            'Confirmed, cancelled and refunded bookings will appear here.'
        );
    }

    let currentAngle = 0;
    const segments = statusItems.map(item => {
        const start = currentAngle;
        currentAngle += (item.count / total) * 360;
        return {
            ...item,
            start,
            end: currentAngle,
            percentage: Math.round((item.count / total) * 100)
        };
    });

    const confirmedCount = statusItems.find(item => item.key === 'confirmed')?.count || 0;

    return `
        <div class="overview-pie-layout">
            <div class="overview-donut-chart" style="background: conic-gradient(${segments.map(segment => `${segment.color} ${segment.start.toFixed(2)}deg ${segment.end.toFixed(2)}deg`).join(', ')})">
                <div class="overview-donut-core">
                    <strong>${escapeHtml(String(total.toLocaleString('en-IN')))}</strong>
                    <span>Total bookings</span>
                </div>
            </div>
            <div class="overview-status-legend">
                ${segments.map(segment => `
                    <div class="overview-status-legend-item">
                        <span class="overview-status-dot" style="background:${segment.color}"></span>
                        <div class="overview-status-legend-copy">
                            <strong>${escapeHtml(segment.label)}</strong>
                            <span>${escapeHtml(`${segment.count.toLocaleString('en-IN')} bookings (${segment.percentage}%)`)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="overview-insight-strip">
            <div class="overview-insight-pill">
                <span>Confirmed</span>
                <strong>${escapeHtml(String(confirmedCount.toLocaleString('en-IN')))}</strong>
                <small>Successful bookings</small>
            </div>
            <div class="overview-insight-pill">
                <span>Health Rate</span>
                <strong>${escapeHtml(`${Math.round((confirmedCount / total) * 100)}%`)}</strong>
                <small>Confirmed ratio</small>
            </div>
        </div>
    `;
}

function renderOverviewContent(overview, range) {
    const activeRange = sanitizeOverviewRange(range);
    const rangeLabel = overviewRangeLabel(activeRange);
    const revenuePoints = normalizeOverviewRevenueData(overview?.revenueData);
    const moviePoints = normalizeOverviewMovieData(overview?.movieData);
    const statusPoints = groupOverviewStatusData(overview?.statusData);

    const totalRevenue = revenuePoints.reduce((sum, point) => sum + point.value, 0);
    const totalTickets = moviePoints.reduce((sum, point) => sum + point.tickets, 0);
    const totalBookings = statusPoints.reduce((sum, point) => sum + point.count, 0);
    const confirmedCount = statusPoints.find(point => point.key === 'confirmed')?.count || 0;
    const topMovie = moviePoints[0];
    const confirmedRatio = totalBookings ? `${Math.round((confirmedCount / totalBookings) * 100)}%` : 'No data';

    return `
        <div class="overview-toolbar">
            <div class="overview-toolbar-copy">
                <span class="overview-toolbar-kicker">Admin analytics</span>
                <h3>${escapeHtml(`${rangeLabel} overview`)}</h3>
                <p>${escapeHtml(`Revenue, movie demand and booking health filtered using range=${activeRange}.`)}</p>
            </div>
            <label class="overview-range-field">
                <span>Range</span>
                <div class="overview-range-select-wrap">
                    <select id="overview-range-select" onchange="handleOverviewRangeChange(this.value)">
                        ${OVERVIEW_RANGE_OPTIONS.map(option => `
                            <option value="${escapeHtml(option.value)}" ${option.value === activeRange ? 'selected' : ''}>${escapeHtml(option.label)}</option>
                        `).join('')}
                    </select>
                    <i class="fa-solid fa-chevron-down"></i>
                </div>
            </label>
        </div>
        ${renderMetricCards([
            {
                label: 'Revenue Collected',
                value: formatCurrency(totalRevenue),
                note: revenueTrendCopy(revenuePoints, rangeLabel),
                icon: 'fa-indian-rupee-sign',
                color: 'var(--green)'
            },
            {
                label: 'Tickets Sold',
                value: totalTickets.toLocaleString('en-IN'),
                note: `${moviePoints.length} movie entr${moviePoints.length === 1 ? 'y' : 'ies'} in this range`,
                icon: 'fa-ticket',
                color: 'var(--blue)'
            },
            {
                label: 'Top Movie',
                value: topMovie ? `${topMovie.tickets.toLocaleString('en-IN')} seats` : 'No data',
                note: topMovie ? topMovie.title : 'Waiting for movie stats from the API',
                icon: 'fa-clapperboard',
                color: 'var(--gold-light)'
            },
            {
                label: 'Confirmed Ratio',
                value: confirmedRatio,
                note: totalBookings ? `${confirmedCount.toLocaleString('en-IN')} of ${totalBookings.toLocaleString('en-IN')} bookings confirmed` : 'No booking status counts returned',
                icon: 'fa-circle-check',
                color: 'var(--purple)'
            }
        ])}
        <div class="overview-chart-grid">
            <section class="overview-chart-card overview-chart-card-wide">
                <div class="overview-chart-header">
                    <div>
                        <h4>Total Revenue</h4>
                        <p>Line chart showing whether revenue is growing or dropping over time.</p>
                    </div>
                    <span class="overview-chart-tag">${escapeHtml(rangeLabel)}</span>
                </div>
                ${renderRevenueLineChart(revenuePoints)}
            </section>
            <section class="overview-chart-card">
                <div class="overview-chart-header">
                    <div>
                        <h4>Top Performing Movies</h4>
                        <p>Bar chart showing which titles are driving the most ticket sales.</p>
                    </div>
                    <span class="overview-chart-tag">${escapeHtml(String(moviePoints.length))} movies</span>
                </div>
                ${renderMovieBarChart(moviePoints)}
            </section>
            <section class="overview-chart-card">
                <div class="overview-chart-header">
                    <div>
                        <h4>Booking Health & Refunds</h4>
                        <p>Pie chart comparing confirmed, cancelled and refunded bookings.</p>
                    </div>
                    <span class="overview-chart-tag">${escapeHtml(String(totalBookings.toLocaleString('en-IN')))} bookings</span>
                </div>
                ${renderStatusPieChart(statusPoints)}
            </section>
        </div>
    `;
}

function handleOverviewRangeChange(range) {
    showOverview(range);
}

function userLabel(user) {
    if (!user) return 'Guest user';
    return user.name || user.fullName || user.email || `User #${user.id ?? '-'}`;
}

function userSubtext(user) {
    if (!user) return 'No user details';
    return user.email || user.phone || `ID #${user.id ?? '-'}`;
}

function bookingCustomerLabel(booking) {
    return textValue(
        booking?.user?.name,
        booking?.user?.fullName,
        booking?.user?.email,
        booking?.userEmail,
        booking?.email
    ) || 'Guest user';
}

function bookingCustomerSubtext(booking) {
    if (booking?.user) return userSubtext(booking.user);
    return booking?.userEmail ? 'Email from booking summary' : 'No user details';
}

function bookingMovieTitle(booking) {
    return textValue(
        booking?.show?.movie?.title,
        booking?.show?.movieTitle,
        booking?.movieTitle,
        booking?.movieName
    ) || 'Movie unavailable';
}

function bookingVenue(booking) {
    const theatre = textValue(
        booking?.show?.screen?.theatre?.name,
        booking?.show?.theatre?.name,
        booking?.show?.theatreName,
        booking?.theatreName
    );
    const screen = textValue(
        booking?.show?.screen?.screenName,
        booking?.show?.screenName,
        booking?.screenName
    );

    if (theatre && screen) return `${theatre} (${screen})`;
    return theatre || screen || 'Venue not included';
}

function bookingShowTime(booking) {
    return booking?.show?.startTime || booking?.showTime || null;
}

function bookingSeatLabels(booking) {
    const showSeats = Array.isArray(booking?.showSeats) ? booking.showSeats : [];
    return showSeats
        .map(showSeat => showSeat?.seat?.seatLabel || showSeat?.seatLabel || showSeat?.seat?.name || showSeat?.seatName)
        .filter(Boolean);
}

function bookingSeatCount(booking) {
    const showSeats = Array.isArray(booking?.showSeats) ? booking.showSeats.length : 0;
    if (showSeats > 0) return showSeats;

    const seatCount = Number(booking?.seatCount);
    return Number.isFinite(seatCount) && seatCount > 0 ? seatCount : null;
}

function bookingSeatSummary(booking) {
    const labels = bookingSeatLabels(booking);
    if (!labels.length) return 'Seat details unavailable';
    if (labels.length <= 3) return labels.join(', ');
    return `${labels.slice(0, 3).join(', ')} +${labels.length - 3} more`;
}

function bookingAmount(booking) {
    return numberValue(booking?.amount ?? booking?.totalAmount);
}

function paymentOrderReference(payment) {
    return textValue(payment?.razorpayOrderId, payment?.orderId);
}

function paymentGatewayReference(payment) {
    return textValue(payment?.paymentId, payment?.razorpayPaymentId);
}

function paymentMovieTitle(payment) {
    return bookingMovieTitle(payment?.booking || payment);
}

function paymentVenueDetail(payment) {
    const venue = bookingVenue(payment?.booking || payment);
    return venue === 'Venue not included' ? null : venue;
}

function paymentBookingReference(payment) {
    const bookingId = payment?.booking?.id ?? payment?.bookingId;
    return bookingId !== null && bookingId !== undefined && bookingId !== ''
        ? `Booking #${bookingId}`
        : 'No booking reference included';
}

function paymentCustomerLabel(payment) {
    return bookingCustomerLabel(payment?.booking || payment);
}

function paymentCustomerSubtext(payment) {
    if (payment?.booking) return bookingCustomerSubtext(payment.booking);
    return payment?.userEmail ? 'Email from payment summary' : 'No user details';
}

function paymentCreatedSubtext(payment) {
    return payment?.booking?.bookedAt
        ? `Booking ${formatDateTime(payment.booking.bookedAt)}`
        : 'Created from payment summary';
}

function setPage(title, breadcrumb) {
    document.getElementById('page-title').innerText = title;
    document.getElementById('breadcrumb-current').innerText = breadcrumb || title;
}

function setLoading() {
    document.getElementById('dynamic-content').innerHTML = `
        <div class="loading-state">
            <div class="loader-ring"></div>
            <p>Loading…</p>
        </div>`;
}

function setError(message = 'Failed to load data.') {
    document.getElementById('dynamic-content').innerHTML = `
        <div class="empty-state">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <p>${message}</p>
        </div>`;
}

// ── NAVIGATION ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-links li a');

    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            navLinks.forEach(item => item.classList.remove('active'));
            this.classList.add('active');

            const map = {
                'nav-overview': showOverview,
                'nav-movies': showMovies,
                'nav-theaters': showTheaters,
                'nav-users': showUsers,
                'nav-shows': showManagement,
                'nav-bookings': showBookings,
                'nav-payments': showPayments,
            };

            const fn = map[this.id];
            if (fn) fn();
        });
    });

    // Default load
    showOverview();
});

function showComingSoon(name) {
    setPage(name, name);
    document.getElementById('dynamic-content').innerHTML = `
        <div class="empty-state" style="padding-top:100px;">
            <i class="fa-solid fa-hammer"></i>
            <p style="font-size:18px; color:var(--white); margin-bottom:8px;">${name}</p>
            <p>This section is coming soon.</p>
        </div>`;
}

// ── OVERVIEW ───────────────────────────────────────────────────
async function showOverview(range = currentOverviewRange) {
    const activeRange = sanitizeOverviewRange(range);
    currentOverviewRange = activeRange;
    setPage('Dashboard Overview', 'Overview');
    setLoading();

    const loadSequence = ++overviewLoadSequence;
    try {
        const dashboardUrl = new URL('http://localhost:8080/api/admin/dashboard');
        dashboardUrl.searchParams.set('range', activeRange);

        const overview = await fetchApiData(dashboardUrl.toString(), {
            headers: authHeaders()
        });

        if (loadSequence !== overviewLoadSequence) return;
        document.getElementById('dynamic-content').innerHTML = renderOverviewContent(overview, activeRange);
        /*
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="card-header">
                        <span>Total Revenue</span>
                        <i class="fa-solid fa-indian-rupee-sign icon-revenue"></i>
                    </div>
                    <div class="card-value">₹${Number(res.totalRevenue).toLocaleString('en-IN')}</div>
                    <div class="card-subtext" style="color:var(--green)">
                        <i class="fa-solid fa-arrow-trend-up" style="font-size:10px"></i> +12% from last month
                    </div>
                </div>
                <div class="stat-card">
                    <div class="card-header">
                        <span>Total Bookings</span>
                        <i class="fa-solid fa-ticket icon-bookings"></i>
                    </div>
                    <div class="card-value">${res.totalBookings}</div>
                    <div class="card-subtext" style="color:var(--blue)">
                        <i class="fa-solid fa-arrow-trend-up" style="font-size:10px"></i> +8% from last month
                    </div>
                </div>
                <div class="stat-card">
                    <div class="card-header">
                        <span>Occupancy Rate</span>
                        <i class="fa-solid fa-percent icon-users"></i>
                    </div>
                    <div class="card-value">${res.occupancyRate}%</div>
                    <div class="card-subtext" style="color:var(--purple)">Current average</div>
                </div>
                <div class="stat-card">
                    <div class="card-header">
                        <span>Active Shows</span>
                        <i class="fa-solid fa-film icon-movies"></i>
                    </div>
                    <div class="card-value">${res.activeShows}</div>
                    <div class="card-subtext" style="color:var(--amber)">Currently showing</div>
                </div>
            </div>
        */
    } catch (error) {
        if (loadSequence !== overviewLoadSequence) return;
        const message = error.message || 'Failed to load dashboard data.';
        showToast(message, 'error');
        setError(message);
    }
}

// ── MOVIES ─────────────────────────────────────────────────────
async function showMovies() {
    setPage('Movie Management', 'Movies');
    setLoading();
    try {
        const response = await fetch('http://localhost:8080/api/movies/all');
        const movies = await processResponse(response);

        const rows = movies.map(movie => `
            <tr id="main-row-${movie.id}" class="movie-row">
                <td>
                    <img src="${movie.posterUrl || 'placeholder.jpg'}" class="movie-poster-sm" alt="${movie.title}">
                </td>
                <td class="movie-title-clickable" onclick="toggleDescription(${movie.id})">
                    <div style="font-weight:600; display:flex; align-items:center;">
                        <i class="fa-solid fa-chevron-right expand-icon"></i>
                        ${movie.title}
                    </div>
                    <div style="font-size:11px; color:var(--white-dim); margin-top:2px;">${movie.genre}</div>
                </td>
                <td>${movie.durationMinutes} <span style="color:var(--white-dim);font-size:11px">mins</span></td>
                <td style="color:var(--white-dim); font-size:12px;">${movie.releaseDate}</td>
                <td>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button class="btn-action btn-edit" onclick="editMovie(${movie.id})" title="Edit">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn-action btn-delete" onclick="deleteMovie(${movie.id})" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
            <tr id="desc-row-${movie.id}" class="description-row">
                <td colspan="5">
                    <div style="display:flex; gap:8px; align-items:flex-start;">
                        <i class="fa-solid fa-align-left" style="color:var(--crimson); margin-top:2px; font-size:12px;"></i>
                        <div>${movie.description || '<em>No description available.</em>'}</div>
                    </div>
                </td>
            </tr>
        `).join('');

        document.getElementById('dynamic-content').innerHTML = `
            <div class="table-header-actions">
                <h3>All Movies <span style="color:var(--white-faint); font-size:13px; font-weight:400;">(${movies.length})</span></h3>
                <button class="date-filter-btn" onclick="openAddMovieForm()">
                    <i class="fa-solid fa-plus"></i> Add Movie
                </button>
            </div>
            <div class="admin-table-container">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Poster</th>
                            <th>Title & Genre</th>
                            <th>Duration</th>
                            <th>Release Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } catch (e) { setError('Error fetching movies. Is the API running?'); }
}

function toggleDescription(id) {
    const desc = document.getElementById(`desc-row-${id}`);
    const row = document.getElementById(`main-row-${id}`);
    if (!desc || !row) return;
    desc.classList.toggle('show');
    row.classList.toggle('expanded');
}

// ── MOVIE MODAL ────────────────────────────────────────────────
function openAddMovieForm() {
    currentEditId = null;
    document.getElementById('movie-form').reset();
    document.getElementById('movie-modal-title').innerText = 'Add New Movie';
    document.getElementById('movie-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('movie-modal').style.display = 'none';
    document.getElementById('movie-form').reset();
    currentEditId = null;
}

window.addEventListener('click', e => {
    const modal = document.getElementById('movie-modal');
    if (e.target === modal) closeModal();
});

document.getElementById('movie-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('.btn-submit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

    const formData = new FormData();
    formData.append('title', document.getElementById('movie-title').value);
    formData.append('description', document.getElementById('movie-desc').value);
    formData.append('language', document.getElementById('movie-language').value);
    formData.append('durationMinutes', parseInt(document.getElementById('movie-duration').value));
    formData.append('genre', document.getElementById('movie-genre').value);
    formData.append('releaseDate', document.getElementById('movie-date').value);

    const imageFile = document.getElementById('movie-image').files[0];
    if (imageFile) formData.append('image', imageFile);

    const url = currentEditId ? `http://localhost:8080/api/movies/id=${currentEditId}` : 'http://localhost:8080/api/movies';
    const method = currentEditId ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, { method, headers: authHeaders(), body: formData });
        await processResponse(response);
        closeModal();
        showMovies();
    } catch (err) {
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Movie';
    }
});

async function editMovie(id) {
    currentEditId = id;
    document.getElementById('movie-modal-title').innerText = 'Edit Movie';
    document.getElementById('movie-modal').style.display = 'flex';
    try {
        const response = await fetch(`http://localhost:8080/api/movies/id=${id}`, { headers: authHeaders() });
        const movie = await processResponse(response);
        document.getElementById('movie-title').value = movie.title;
        document.getElementById('movie-desc').value = movie.description;
        document.getElementById('movie-language').value = movie.language;
        document.getElementById('movie-duration').value = movie.durationMinutes;
        document.getElementById('movie-genre').value = movie.genre;
        document.getElementById('movie-date').value = movie.releaseDate;
    } catch (e) {
        showToast('Error fetching movie details', 'error');
    }
}

function deleteMovie(id) {
    if (!confirm('Are you sure you want to delete this movie?')) return;
    fetch(`http://localhost:8080/api/movies/id=${id}`, { method: 'DELETE', headers: authHeaders() })
        .then(async r => { await processResponse(r); showMovies(); })
        .catch(err => console.error(err));
}

// ── THEATERS ───────────────────────────────────────────────────
async function showTheaters() {
    setPage('Theater Management', 'Theaters');
    setLoading();
    try {
        const response = await fetch('http://localhost:8080/api/theatres/all', { headers: authHeaders() });
        const theaters = await processResponse(response);

        const cards = theaters.map(t => `
            <div class="theater-card">
                <div class="theater-card-header">
                    <div>
                        <div class="theater-name-text">${t.name}</div>
                        <div class="theater-address-text">
                            <i class="fa-solid fa-location-dot" style="color:var(--crimson); font-size:11px; margin-right:4px;"></i>
                            ${t.address}, ${t.city}
                        </div>
                    </div>
                    <button class="btn-status-toggle ${t.active ? 'status-active' : 'status-inactive'}"
                            onclick="toggleTheaterStatus(${t.id}, ${t.active})">
                        ${t.active ? 'ACTIVE' : 'INACTIVE'}
                    </button>
                </div>
                <div class="theater-card-footer">
                    <span class="screen-count">
                        <i class="fa-solid fa-tv"></i>
                        ${t.screens || 0} Screens
                    </span>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button class="btn-manage" onclick="manageScreens(${t.id})">
                            <i class="fa-solid fa-sliders"></i> Screens
                        </button>
                        <button class="btn-action btn-edit" onclick="editTheater(${t.id})" title="Edit">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn-action btn-delete" onclick="deleteTheater(${t.id})" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        document.getElementById('dynamic-content').innerHTML = `
            <div class="table-header-actions">
                <h3>All Cinemas <span style="color:var(--white-faint); font-size:13px; font-weight:400;">(${theaters.length})</span></h3>
                <button class="date-filter-btn" onclick="openAddTheaterModal()">
                    <i class="fa-solid fa-plus"></i> Add Theater
                </button>
            </div>
            <div class="stats-grid">${cards}</div>
        `;
    } catch (e) { setError('Error loading theaters.'); }
}

async function toggleTheaterStatus(id, current) {
    const newStatus = !current;
    if (!confirm(`Are you sure you want to ${newStatus ? 'activate' : 'deactivate'} this theater?`)) return;
    try {
        const response = await fetch(`http://localhost:8080/api/theatres/id=${id}/status=${newStatus}`, {
            method: 'PUT', headers: authHeaders()
        });
        await processResponse(response);
        showTheaters();
    } catch (e) { console.error(e); }
}

function openAddTheaterModal() {
    currentEditTheaterId = null;
    document.getElementById('theater-form').reset();
    document.getElementById('theater-modal-title').innerText = 'Add New Theater';
    document.getElementById('theater-modal').style.display = 'flex';
}

function closeTheaterModal() {
    document.getElementById('theater-modal').style.display = 'none';
    currentEditTheaterId = null;
}

document.getElementById('theater-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('.btn-submit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

    const data = {
        name: document.getElementById('theater-name').value,
        city: document.getElementById('theater-city').value,
        address: document.getElementById('theater-address').value,
    };
    const url = currentEditTheaterId ? `http://localhost:8080/api/theatres/edit/id=${currentEditTheaterId}` : 'http://localhost:8080/api/theatres';
    const method = currentEditTheaterId ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, { method, headers: authJsonHeaders(), body: JSON.stringify(data) });
        await processResponse(response);
        closeTheaterModal();
        showTheaters();
    } catch (e) { console.error(e); }
    finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Theater';
    }
});

async function editTheater(id) {
    currentEditTheaterId = id;
    document.getElementById('theater-modal-title').innerText = 'Edit Theater';
    try {
        const response = await fetch(`http://localhost:8080/api/theatres/id=${id}`, { headers: authHeaders() });
        const t = await processResponse(response);
        document.getElementById('theater-name').value = t.name;
        document.getElementById('theater-city').value = t.city;
        document.getElementById('theater-address').value = t.address;
        document.getElementById('theater-modal').style.display = 'flex';
    } catch (e) { showToast('Error loading theater details.', 'error'); }
}

async function deleteTheater(id) {
    if (!confirm('Deleting this theater will also remove all its screens and scheduled shows. Continue?')) return;
    try {
        const response = await fetch(`http://localhost:8080/api/theatres/id=${id}`, {
            method: 'DELETE', headers: authHeaders()
        });
        await processResponse(response);
        showTheaters();
    } catch (e) { console.error(e); }
}

// ── SCREENS ────────────────────────────────────────────────────
async function manageScreens(theatreId) {
    setPage('Screen Management', 'Screens');
    setLoading();
    try {
        const response = await fetch(`http://localhost:8080/api/screens/theatre/id=${theatreId}`, { headers: authHeaders() });
        const screens = await processResponse(response);

        const rows = screens.length > 0
            ? screens.map(s => `
                <tr>
                    <td><strong>${s.screenName}</strong></td>
                    <td><span class="badge">${s.theatreName}</span></td>
                    <td>${s.totalSeats} <span style="color:var(--white-dim);font-size:11px">seats</span></td>
                    <td>
                        <div style="display:flex; gap:6px;">
                            <button class="btn-action btn-edit" onclick="editScreen(${s.id}, ${theatreId})" title="Edit">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button class="btn-action btn-delete" onclick="deleteScreen(${s.id})" title="Delete">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('')
            : `<tr><td colspan="4"><div class="empty-state" style="padding:40px"><i class="fa-solid fa-tv"></i><p>No screens found for this theater.</p></div></td></tr>`;

        document.getElementById('dynamic-content').innerHTML = `
            <div class="table-header-actions">
                <button class="btn-cancel" style="display:inline-flex; align-items:center; gap:8px;" onclick="showTheaters()">
                    <i class="fa-solid fa-arrow-left"></i> Back to Theaters
                </button>
                <button class="date-filter-btn" onclick="redirectToDesigner(${theatreId})">
                    <i class="fa-solid fa-plus"></i> Add Screen
                </button>
            </div>
            <div class="admin-table-container">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Screen Name</th>
                            <th>Theatre</th>
                            <th>Total Seats</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } catch (e) { setError('Failed to load screens.'); }
}

function redirectToDesigner(theatreId) { window.location.href = `seatLayout.html?theatreId=${theatreId}`; }
function editScreen(screenId, theatreId) { window.location.href = `seatLayout.html?theatreId=${theatreId}&screenId=${screenId}`; }

function deleteScreen(screenId) {
    if (!confirm('Delete this screen? All scheduled shows for this screen will also be removed.')) return;
    fetch(`http://localhost:8080/api/screens/id=${screenId}`, { method: 'DELETE', headers: authHeaders() })
        .then(async r => { await processResponse(r); })
        .catch(e => console.error(e));
}

// ── USERS ──────────────────────────────────────────────────────
async function showUsers() {
    setPage('User Management', 'Users');
    setLoading();
    try {
        const response = await fetch('http://localhost:8080/api/admin/users', { headers: authHeaders() });
        const users = await processResponse(response);

        const rows = users.map(u => `
            <tr>
                <td style="color:var(--white-dim); font-size:12px;">#${u.id}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:30px;height:30px;border-radius:50%;background:var(--crimson-dim);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">
                            ${u.name.charAt(0).toUpperCase()}
                        </div>
                        <strong>${u.name}</strong>
                    </div>
                </td>
                <td style="color:var(--white-dim)">${u.email}</td>
                <td style="color:var(--white-dim)">${u.phone}</td>
                <td style="color:var(--white-dim); font-size:12px;">
                    ${new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
            </tr>
        `).join('');

        document.getElementById('dynamic-content').innerHTML = `
            <div class="table-header-actions">
                <div class="search-box-styled">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" id="userSearch" placeholder="Search by name or email…" onkeyup="filterUsers()">
                </div>
                <div class="user-stats-badge">
                    Total Users: <strong>${users.length}</strong>
                </div>
            </div>
            <div class="admin-table-container">
                <table class="admin-table" id="userTable">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Full Name</th>
                            <th>Email Address</th>
                            <th>Phone Number</th>
                            <th>Joined</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } catch (e) { setError('Error fetching users.'); }
}

function filterUsers() {
    const filter = document.getElementById('userSearch').value.toUpperCase();
    const rows = document.querySelectorAll('#userTable tbody tr');
    rows.forEach(tr => {
        const name = tr.cells[1]?.textContent || '';
        const email = tr.cells[2]?.textContent || '';
        tr.style.display = (name + email).toUpperCase().includes(filter) ? '' : 'none';
    });
}

// ── SHOWS ──────────────────────────────────────────────────────
async function showManagement() {
    setPage('Show Scheduling', 'Show Schedules');
    setLoading();
    try {
        const response = await fetch('http://localhost:8080/api/shows/all', { headers: authHeaders() });
        const shows = await processResponse(response);

        const rows = shows.map(s => `
            <tr>
                <td style="color:var(--white-dim);font-size:12px;">#${s.showId}</td>
                <td><strong>${s.movieTitle}</strong></td>
                <td style="color:var(--white-dim)">${s.theatreName}</td>
                <td><span class="badge">${s.screenName}</span></td>
                <td style="font-size:12px;color:var(--white-dim)">${new Date(s.startTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                <td>${new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td>${new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td>₹${s.regular_price}</td>
                <td>₹${s.premium_price}</td>
                <td>₹${s.vip_price}</td>
                <td>
                    <button class="btn-action btn-delete" onclick="deleteShow(${s.showId})" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        document.getElementById('dynamic-content').innerHTML = `
            <div class="table-header-actions">
                <h3>All Shows <span style="color:var(--white-faint); font-size:13px; font-weight:400;">(${shows.length})</span></h3>
                <button class="date-filter-btn" onclick="openCreateShowModal()">
                    <i class="fa-solid fa-calendar-plus"></i> Schedule Show
                </button>
            </div>
            <div class="admin-table-container" style="overflow-x:auto;">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Movie</th>
                            <th>Theatre</th>
                            <th>Screen</th>
                            <th>Date</th>
                            <th>Start</th>
                            <th>End</th>
                            <th>Regular</th>
                            <th>Premium</th>
                            <th>VIP</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } catch (e) { setError('Failed to load shows.'); }
}

async function openCreateShowModal() {
    document.getElementById('show-modal').style.display = 'flex';

    const [movieRes, theatreRes] = await Promise.all([
        fetch('http://localhost:8080/api/movies/all'),
        fetch('http://localhost:8080/api/theatres/all', { headers: authHeaders() })
    ]);

    const movies = await processResponse(movieRes);
    const theatres = await processResponse(theatreRes);

    document.getElementById('modal-movie-id').innerHTML =
        movies.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
    document.getElementById('modal-theatre-id').innerHTML =
        '<option value="">Choose a Theatre…</option>' +
        theatres.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
}

async function loadScreensForModal(theatreId) {
    if (!theatreId) return;
    const res = await fetch(`http://localhost:8080/api/screens/theatre/id=${theatreId}`, { headers: authHeaders() });
    const screens = await processResponse(res);
    document.getElementById('modal-screen-id').innerHTML =
        screens.map(s => `<option value="${s.id}">${s.screenName}</option>`).join('');
}

async function submitShowForm() {
    const movieId = document.getElementById('modal-movie-id').value;
    const screenId = document.getElementById('modal-screen-id').value;
    const startTime = document.getElementById('modal-start-time').value;
    const vipPrice = document.getElementById('modal-vip-price').value;
    const premiumPrice = document.getElementById('modal-prem-price').value;
    const regularPrice = document.getElementById('modal-reg-price').value;

    if (!movieId || !screenId || !startTime || !vipPrice || !premiumPrice || !regularPrice) {
        showToast('Please fill all fields.', 'error');
        return;
    }

    const payload = {
        movieId: parseInt(movieId),
        screenId: parseInt(screenId),
        startTime,
        vipPrice: parseFloat(vipPrice),
        premiumPrice: parseFloat(premiumPrice),
        regularPrice: parseFloat(regularPrice)
    };

    try {
        const response = await fetch('http://localhost:8080/api/shows', {
            method: 'POST',
            headers: authJsonHeaders(),
            body: JSON.stringify(payload)
        });
        await processResponse(response);
        document.getElementById('show-modal').style.display = 'none';
        showManagement();
    } catch (e) { console.error(e); }
}

async function deleteShow(showId) {
    if (!confirm(`Delete Show #${showId}? All associated seat data will be removed.`)) return;
    try {
        const response = await fetch(`http://localhost:8080/api/shows/id=${showId}`, {
            method: 'DELETE', headers: authHeaders()
        });
        await processResponse(response);
        showManagement();
    } catch (e) { console.error(e); }
}

// ── LOGOUT ─────────────────────────────────────────────────────
async function showBookings() {
    setPage('Booking Management', 'Bookings');
    setLoading();

    try {
        const bookings = normalizeCollection(await fetchApiData('http://localhost:8080/api/admin/bookings', {
            headers: authHeaders()
        }));

        const confirmed = bookings.filter(booking => matchesStatus(booking.status, ['CONFIRMED', 'BOOKED', 'SUCCESS', 'COMPLETED'])).length;
        const pending = bookings.filter(booking => matchesStatus(booking.status, ['PENDING'])).length;
        const cancelled = bookings.filter(booking => matchesStatus(booking.status, ['CANCEL', 'REFUND', 'FAILED'])).length;
        const revenue = bookings.reduce((sum, booking) => sum + bookingAmount(booking), 0);

        const rows = bookings.length
            ? bookings.map(booking => {
                const seatCount = bookingSeatCount(booking);
                const refundValue = numberValue(booking.refundAmount);
                const showTime = bookingShowTime(booking);

                return `
                    <tr>
                        <td>
                            <div class="data-title">#${escapeHtml(booking.id ?? '-')}</div>
                            <div class="data-subtitle">${renderStatusPill(booking.status)}</div>
                        </td>
                        <td>
                            <div class="data-title">${escapeHtml(bookingCustomerLabel(booking))}</div>
                            <div class="data-subtitle">${escapeHtml(bookingCustomerSubtext(booking))}</div>
                        </td>
                        <td>
                            <div class="data-title">${escapeHtml(bookingMovieTitle(booking))}</div>
                        </td>
                        <td>
                            <div class="data-title">${escapeHtml(formatCurrency(bookingAmount(booking)))}</div>
                            <div class="data-subtitle">${refundValue > 0 ? escapeHtml(`Refund ${formatCurrency(refundValue)}`) : 'No refund'}</div>
                        </td>
                        <td>
                            <div class="data-title">${escapeHtml(formatDateTime(booking.date))}</div>
                            <div class="data-subtitle">${booking.cancelledAt ? escapeHtml(`Cancelled ${formatDateTime(booking.cancelledAt)}`) : 'Active booking'}</div>
                        </td>
                    </tr>
                `;
            }).join('')
            : `<tr><td colspan="6"><div class="empty-state" style="padding:40px"><i class="fa-solid fa-ticket"></i><p>No bookings returned from /bookings.</p></div></td></tr>`;

        document.getElementById('dynamic-content').innerHTML = `
            ${renderMetricCards([
            { label: 'Total Bookings', value: String(bookings.length), note: 'Loaded from /bookings', icon: 'fa-ticket', color: 'var(--blue)' },
            { label: 'Confirmed', value: String(confirmed), note: 'Completed reservations', icon: 'fa-circle-check', color: 'var(--green)' },
            { label: 'Pending', value: String(pending), note: 'Awaiting payment or action', icon: 'fa-hourglass-half', color: 'var(--amber)' },
            { label: 'Gross Amount', value: formatCurrency(revenue), note: 'Across all listed bookings', icon: 'fa-indian-rupee-sign', color: 'var(--gold-light)' }
        ])}
            <div class="table-header-actions">
                <h3>All Bookings <span style="color:var(--white-faint); font-size:13px; font-weight:400;">(${bookings.length})</span></h3>
                <div class="user-stats-badge">Cancelled: <strong>${cancelled}</strong></div>
            </div>
            <div class="admin-table-container" style="overflow-x:auto;">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Booking</th>
                            <th>Customer</th>
                            <th>Show</th>
                            <th>Amount</th>
                            <th>Timeline</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
        showToast(`Loaded ${bookings.length} booking${bookings.length === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
        const message = error.message || 'Failed to load bookings.';
        showToast(message, 'error');
        setError(message);
    }
}

async function showPayments() {
    setPage('Payment Management', 'Payments');
    setLoading();

    try {
        const payments = normalizeCollection(await fetchApiData('http://localhost:8080/api/admin/payments', {
            headers: authHeaders()
        }));

        const successful = payments.filter(payment => matchesStatus(payment.status, ['SUCCESS', 'PAID', 'COMPLETED'])).length;
        const pending = payments.filter(payment => matchesStatus(payment.status, ['PENDING'])).length;
        const failed = payments.filter(payment => matchesStatus(payment.status, ['FAILED', 'REFUND', 'CANCEL'])).length;
        const totalAmount = payments.reduce((sum, payment) => sum + numberValue(payment.amount), 0);

        const rows = payments.length
            ? payments.map(payment => {
                const orderReference = paymentOrderReference(payment);
                const paymentReference = paymentGatewayReference(payment);
                const bookingReference = paymentBookingReference(payment);
                const venueDetail = paymentVenueDetail(payment);

                return `
                    <tr>
                        <td>
                            <div class="data-title">#${escapeHtml(payment.id ?? '-')}</div>
                            <div class="data-subtitle">${renderStatusPill(payment.status)}</div>
                        </td>
                        <td>
                            <div class="data-title">${escapeHtml(formatCurrency(payment.amount))}</div>
                            <div class="data-subtitle">Order ${escapeHtml(orderReference || 'Not created')}</div>
                            <div class="data-subtitle">${escapeHtml(paymentReference ? `Payment ${paymentReference}` : 'Payment reference not included')}</div>
                        </td>
                        <td>
                            <div class="data-title">${escapeHtml(paymentMovieTitle(payment))}</div>
                            <div class="data-subtitle">${escapeHtml(bookingReference)}</div>
                            <div class="data-subtitle">${escapeHtml(venueDetail || 'Venue not included')}</div>
                        </td>
                        <td>
                            <div class="data-title">${escapeHtml(paymentCustomerLabel(payment))}</div>
                            <div class="data-subtitle">${escapeHtml(paymentCustomerSubtext(payment))}</div>
                        </td>
                        <td>
                            <div class="data-title">${escapeHtml(formatDateTime(payment.createdAt))}</div>
                            <div class="data-subtitle">${escapeHtml(paymentCreatedSubtext(payment))}</div>
                        </td>
                    </tr>
                `;
            }).join('')
            : `<tr><td colspan="5"><div class="empty-state" style="padding:40px"><i class="fa-solid fa-money-bill-wave"></i><p>No payments returned from /payments.</p></div></td></tr>`;

        document.getElementById('dynamic-content').innerHTML = `
            ${renderMetricCards([
            { label: 'Total Payments', value: String(payments.length), note: 'Loaded from /payments', icon: 'fa-money-bill-wave', color: 'var(--blue)' },
            { label: 'Successful', value: String(successful), note: 'Verified transactions', icon: 'fa-circle-check', color: 'var(--green)' },
            { label: 'Pending', value: String(pending), note: 'Still in progress', icon: 'fa-hourglass-half', color: 'var(--amber)' },
            { label: 'Processed Amount', value: formatCurrency(totalAmount), note: 'Across listed payments', icon: 'fa-indian-rupee-sign', color: 'var(--gold-light)' }
        ])}
            <div class="table-header-actions">
                <h3>All Payments <span style="color:var(--white-faint); font-size:13px; font-weight:400;">(${payments.length})</span></h3>
                <div class="user-stats-badge">Failed: <strong>${failed}</strong></div>
            </div>
            <div class="admin-table-container" style="overflow-x:auto;">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Payment</th>
                            <th>Transaction</th>
                            <th>Details</th>
                            <th>Customer</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
        showToast(`Loaded ${payments.length} payment${payments.length === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
        const message = error.message || 'Failed to load payments.';
        showToast(message, 'error');
        setError(message);
    }
}

function handleLogout() {
    if (!confirm('Are you sure you want to sign out?')) return;
    showToast('Signing out… See you soon!', 'success');
    setTimeout(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('userName');
        localStorage.removeItem('userRole');
        window.location.href = 'index.html';
    }, 1000);
}

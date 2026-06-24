// 1. GLOBAL STATE & URL PARAMS
const urlParams = new URLSearchParams(window.location.search);
const theatreId = urlParams.get('theatreId');
const screenId = urlParams.get('screenId');
const isEditMode = screenId !== null;

let currentTool = 'REGULAR'; // Default tool
let isMouseDown = false;

// Track mouse state for "drag to paint"
document.addEventListener('mousedown', () => (isMouseDown = true));
document.addEventListener('mouseup', () => (isMouseDown = false));

// 2. INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    if (isEditMode) {
        loadExistingLayout(screenId);
    } else {
        generateGrid(); // Start with default 10x10 or whatever is in HTML
    }
});

// 3. TOOL LOGIC
function setTool(tool, btn) {
    currentTool = tool;
    document.querySelectorAll('.tool').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

// 4. GRID GENERATION (Unified)
function generateGrid() {
    const rows = parseInt(document.getElementById('rows').value) || 10;
    const cols = parseInt(document.getElementById('cols').value) || 10;
    const container = document.getElementById('grid-container');

    container.style.gridTemplateColumns = `repeat(${cols}, 40px)`;
    container.innerHTML = '';

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell empty';
            cell.dataset.row = r;
            cell.dataset.col = c;

            // Event Listeners for Painting
            cell.addEventListener('mousedown', () => paint(cell));
            cell.addEventListener('mouseover', () => { if (isMouseDown) paint(cell); });

            container.appendChild(cell);
        }
    }
    updateLabels();
}

function paint(cell) {
    const newType = cell.classList.contains(currentTool) ? '' : currentTool;

            cell.className = 'cell'; // Reset
            if (newType) cell.classList.add(newType);

            updateLabels();
}

// 5. LABELING LOGIC (A1, A2, etc.)
function updateLabels() {
    const rows = parseInt(document.getElementById('rows').value);
    const cells = document.querySelectorAll('.cell');
    let seatCounter = {};

    cells.forEach(cell => {
        const r = parseInt(cell.dataset.row);
        const rowLetter = String.fromCharCode(65 + r);

        if (!seatCounter[rowLetter]) seatCounter[rowLetter] = 1;

        // Only label actual seats, not gaps or empty cells
        if (cell.classList.contains('empty') || cell.classList.contains('GAP')) {
            cell.innerText = '';
        } else {
            cell.innerText = `${rowLetter}${seatCounter[rowLetter]}`;
            seatCounter[rowLetter]++;
        }
    });
}

// 6. EDIT MODE: LOADING DATA
async function loadExistingLayout(id) {
    console.log("Loading existing layout for screen ID:", id);
    try {
        const response = await fetch(`http://localhost:8080/api/screens/id=${id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        // Assuming your processResponse helper is available
        const res = await response.json();
        const screen = res.data;
        document.getElementById('screen-name').value = screen.screenName;
        document.getElementById('rows').value = screen.maxRows;
        document.getElementById('cols').value = screen.maxCols;

        generateGrid(); // Build the blank grid first
        renderSavedSeats(screen.seats); // Then color them in
    } catch (error) {
        console.error("Failed to load layout:", error);
    }
}

function renderSavedSeats(seats) {
    seats.forEach(seat => {
        const cell = document.querySelector(`.cell[data-row="${seat.rowIndex}"][data-col="${seat.colIndex}"]`);
        if (cell) {
            cell.className = 'cell';
            cell.classList.add(seat.seatType); // e.g., VIP
        }
    });
    updateLabels();
}

// 7. SAVE LOGIC (Handles POST and PUT)
async function saveLayout() {
    const screenName = document.getElementById('screen-name').value.trim();
    if (!screenName) return alert("Enter Screen Name");

    const rows = parseInt(document.getElementById('rows').value);
    const cols = parseInt(document.getElementById('cols').value);

    const seatData = [];
    document.querySelectorAll('.cell').forEach(cell => {
        // Filter out empty spaces and gaps
        const type = [...cell.classList].find(cls => ['VIP', 'PREMIUM', 'REGULAR'].includes(cls));

        if (type) {
            const label = cell.innerText;
            seatData.push({
                seatRow: label.charAt(0),
                seatNumber: parseInt(label.substring(1)),
                rowIndex: parseInt(cell.dataset.row), // Adjusted key to match usual Java naming
                colIndex: parseInt(cell.dataset.col),
                seatType: type
            });
        }
    });

    const payload = {
        screenName : screenName,
        theatreId: parseInt(theatreId),
        maxRows : rows,
        maxCols : cols,
        seats: seatData
    };

    const url = isEditMode ? `http://localhost:8080/api/screens/id=${screenId}` : `http://localhost:8080/api/screens`;
    const method = isEditMode ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert(isEditMode ? "Update Successful!" : "Created Successfully!");
            window.location.href = 'admin.html';
        } else {
            const err = await response.json();
            alert("Error: " + err.message);
        }
    } catch (err) {
        alert("Server connection failed");
    }
}

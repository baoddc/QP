// Configuration
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyoRmz3bzn8vrY1DkyndTdctkHLr0erKgbFFF4TtlBUE31oJaiiMcW3KheJL0bPdxFt/exec'; // Replace after deployment

// State Management
let employees = [];
let attendanceData = [];
let currentSection = 'dashboard';
let map, marker;
let historyMap, historyMarkers = [];

// DOM Elements
const sections = document.querySelectorAll('.section');
const navLinks = document.querySelectorAll('.nav-link');
const pageTitle = document.getElementById('page-title');
const currentDateEl = document.getElementById('current-date');
const employeeSelect = document.getElementById('employee-select');
const attendanceList = document.getElementById('attendance-list');
const statusMessage = document.getElementById('status-message');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    updateDateTime();
    setInterval(updateDateTime, 1000); // Update clock every second
    initChart();
    loadSettings();
    populateTimeSelects();
    setupSettingsForm();
    setupHistoryMap();

    // Check if SCRIPT_URL is set
    if (SCRIPT_URL === 'YOUR_GOOGLE_SCRIPT_WEB_APP_URL') {
        showDemoData();
    } else {
        loadData();
    }
});

function updateDateTime() {
    const now = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    
    const dateStr = now.toLocaleDateString('vi-VN', dateOptions);
    const timeStr = now.toLocaleTimeString('vi-VN', timeOptions);
    
    currentDateEl.innerHTML = `${dateStr} | <strong style="color: var(--primary);">${timeStr}</strong>`;
}

// Navigation Logic
function setupNavigation() {
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = link.getAttribute('data-section');
            switchSection(sectionId);
        });
    });
}

function switchSection(sectionId) {
    // Update Nav
    navLinks.forEach(l => l.classList.remove('active'));
    document.querySelector(`[data-section="${sectionId}"]`).classList.add('active');

    // Update View
    sections.forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');

    // Update Title
    const titles = {
        'dashboard': 'Tổng Quan Dashboard',
        'attendance': 'Thực Hiện Chấm Công',
        'reports': 'Báo Cáo & Lịch Sử',
        'settings': 'Cài Đặt Hệ Thống'
    };
    pageTitle.textContent = titles[sectionId];
    currentSection = sectionId;
}

// API Calls
async function loadData() {
    try {
        const [empRes, statsRes, attRes] = await Promise.all([
            fetch(`${SCRIPT_URL}?action=getEmployees`),
            fetch(`${SCRIPT_URL}?action=getStats`),
            fetch(`${SCRIPT_URL}?action=getAttendance`)
        ]);

        employees = await empRes.json();
        const stats = await statsRes.json();
        attendanceData = await attRes.json();

        updateStats(stats);
        populateEmployees();
        renderAttendanceTable();
    } catch (error) {
        console.error('Error loading data:', error);
        showStatus('Lỗi kết nối server!', 'danger');
    }
}

function updateStats(stats) {
    document.getElementById('stat-total').textContent = stats.total || 0;
    document.getElementById('stat-present').textContent = stats.present || 0;
    document.getElementById('stat-late').textContent = stats.late || 0;
    document.getElementById('stat-leave').textContent = stats.leave || 0;
}

function populateEmployees() {
    employeeSelect.innerHTML = '<option value="">-- Chọn nhân viên --</option>';
    employees.forEach(emp => {
        const option = document.createElement('option');
        option.value = emp.id;
        option.textContent = `${emp.id} - ${emp.name}`;
        option.dataset.name = emp.name;
        employeeSelect.appendChild(option);
    });
}

function renderAttendanceTable() {
    attendanceList.innerHTML = '';
    attendanceData.reverse().forEach(record => {
        const tr = document.createElement('tr');
        const statusClass = record.status === 'Late' ? 'status-out' : 'status-in';

        // Check for coordinates (supporting old and new header names, and DMS format)
        const lat = parseDMSToDecimal(record.checkin_lat || record.latitude || record.lat);
        const lng = parseDMSToDecimal(record.checkin_lng || record.longitude || record.lng);
        const outLat = parseDMSToDecimal(record.checkout_lat);
        const outLng = parseDMSToDecimal(record.checkout_lng);

        let locationHtml = '-';
        if (lat && lng) {
            locationHtml = `
                <div style="display: flex; gap: 8px; align-items: center;">
                    <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" class="status-badge" style="background: rgba(99, 102, 241, 0.1); color: var(--primary); text-decoration: none;" title="Vị trí Check-in">
                        <i class="fas fa-map-marker-alt"></i> Vào
                    </a>
                    ${outLat ? `
                    <a href="https://www.google.com/maps?q=${outLat},${outLng}" target="_blank" class="status-badge" style="background: rgba(16, 185, 129, 0.1); color: var(--success); text-decoration: none;" title="Vị trí Check-out">
                        <i class="fas fa-map-marker-alt"></i> Ra
                    </a>` : ''}
                </div>
            `;
        }

        tr.innerHTML = `
            <td>
                <div style="font-weight: 600; color: #818cf8;">${record.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${record.id}</div>
            </td>
            <td>${record.date}</td>
            <td>${record.checkin || '--:--'}</td>
            <td>${record.checkout || '--:--'}</td>
            <td><span class="status-badge ${statusClass}">${record.status}</span></td>
            <td>${locationHtml}</td>
            <td>${record.note || '-'}</td>
        `;
        attendanceList.appendChild(tr);
    });
}

// Attendance Actions
document.getElementById('btn-checkin').addEventListener('click', () => handleAttendance('checkin'));
document.getElementById('btn-checkout').addEventListener('click', () => handleAttendance('checkout'));

async function handleAttendance(action) {
    const empId = employeeSelect.value;
    if (!empId) {
        showStatus('Vui lòng chọn nhân viên!', 'warning');
        return;
    }

    const empName = employeeSelect.options[employeeSelect.selectedIndex].dataset.name;
    const btnIn = document.getElementById('btn-checkin');
    const btnOut = document.getElementById('btn-checkout');

    // Show Loading state
    const originalInText = btnIn.innerHTML;
    const originalOutText = btnOut.innerHTML;
    btnIn.disabled = true;
    btnOut.disabled = true;
    if (action === 'checkin') btnIn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang Check-in...';
    else btnOut.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang Check-out...';

    // Geolocation Handling
    let lat = null, lng = null, address = '', accuracy = 0;
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { 
                enableHighAccuracy: true, 
                timeout: 10000,
                maximumAge: 0 
            });
        });
        lat = position.coords.latitude;
        lng = position.coords.longitude;
        accuracy = position.coords.accuracy;

        // Geofencing Check
        const settings = JSON.parse(localStorage.getItem('attendanceSettings')) || {};
        if (settings.companyLat && settings.companyLng) {
            const companyLat = parseDMSToDecimal(settings.companyLat);
            const companyLng = parseDMSToDecimal(settings.companyLng);
            
            if (companyLat !== null && companyLng !== null) {
                const rawDistance = getDistance(lat, lng, companyLat, companyLng);
                const allowedRadius = parseFloat(settings.companyRadius) || 200;
                
                // Subtract accuracy to be more lenient (Common geofencing practice)
                const distance = Math.max(0, rawDistance - accuracy);

                if (distance > allowedRadius) {
                    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${companyLat},${companyLng}&travelmode=walking`;
                    showStatus(`Lỗi: Bạn đang ở quá xa (${Math.round(rawDistance)}m). Giới hạn: ${allowedRadius}m.`, 'danger');
                    
                    // Add a temporary link to verify on Google Maps
                    const statusEl = document.getElementById('status-message');
                    statusEl.innerHTML += `<br><a href="${googleMapsUrl}" target="_blank" style="color: var(--primary); text-decoration: underline; font-size: 0.8rem;">[Bấm vào đây để kiểm tra trên Google Maps]</a>`;
                    
                    btnIn.disabled = false;
                    btnOut.disabled = false;
                    btnIn.innerHTML = originalInText;
                    btnOut.innerHTML = originalOutText;
                    return;
                }
            }
        }
        
        try {
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const geoData = await geoRes.json();
            address = geoData.display_name;
        } catch (e) { console.error('Address lookup failed', e); }

    } catch (error) {
        console.warn('Geolocation failed:', error);
        showStatus('Không thể lấy vị trí chính xác. Vui lòng bật GPS để chấm công!', 'danger');
        btnIn.disabled = false;
        btnOut.disabled = false;
        btnIn.innerHTML = originalInText;
        btnOut.innerHTML = originalOutText;
        return;
    }

    if (SCRIPT_URL === 'YOUR_GOOGLE_SCRIPT_WEB_APP_URL') {
        setTimeout(() => {
            showStatus(`${action === 'checkin' ? 'Check-in' : 'Check-out'} thành công (Demo Mode)`, 'success');
            btnIn.disabled = false;
            btnOut.disabled = false;
            btnIn.innerHTML = originalInText;
            btnOut.innerHTML = originalOutText;
        }, 1000);
        return;
    }

    try {
        const settings = JSON.parse(localStorage.getItem('attendanceSettings')) || { startTime: '08:30' };
        
        const params = new URLSearchParams({
            action: action,
            employeeId: empId,
            employeeName: empName,
            configStartTime: settings.startTime,
            lat: lat || '',
            lng: lng || ''
        });

        const res = await fetch(`${SCRIPT_URL}?${params.toString()}`);
        const result = await res.json();

        if (result.success) {
            showStatus(result.message, 'success');
            if (lat && lng) showMap(lat, lng, accuracy, address, empName);
            setTimeout(() => loadData(), 1000);
        } else {
            showStatus(result.message, 'warning');
        }
    } catch (error) {
        console.error('Attendance error:', error);
        showStatus('Lỗi kết nối hoặc phiên làm việc đã đóng!', 'danger');
    } finally {
        btnIn.disabled = false;
        btnOut.disabled = false;
        btnIn.innerHTML = originalInText;
        btnOut.innerHTML = originalOutText;
    }
}

function showStatus(msg, type) {
    statusMessage.textContent = msg;
    statusMessage.style.color = type === 'danger' ? 'var(--danger)' : (type === 'warning' ? 'var(--warning)' : 'var(--success)');
    setTimeout(() => { statusMessage.textContent = ''; }, 4000);
}

// Chart.js
function initChart() {
    const ctx = document.getElementById('attendanceChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Nhân viên có mặt',
                data: [45, 48, 42, 50, 47, 30, 10],
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

// Demo Data
function showDemoData() {
    employees = [
        { id: 'NV001', name: 'Nguyễn Văn A', dept: 'IT' },
        { id: 'NV002', name: 'Trần Thị B', dept: 'HR' },
        { id: 'NV003', name: 'Lê Văn C', dept: 'Sales' }
    ];

    attendanceData = [
        { id: 'NV001', name: 'Nguyễn Văn A', date: '27/04/2024', checkin: '08:00:15', checkout: '17:30:22', status: 'On Time', note: '', latitude: '10.762622', longitude: '106.660172' },
        { id: 'NV002', name: 'Trần Thị B', date: '27/04/2024', checkin: '08:45:10', checkout: '18:15:00', status: 'Late', note: 'Kẹt xe', latitude: '10.772622', longitude: '106.670172' },
        { id: 'NV003', name: 'Lê Văn C', date: '27/04/2024', checkin: '09:00:00', checkout: '', status: 'Late', note: '', latitude: '10.782622', longitude: '106.680172' }
    ];

    updateStats({ total: 150, present: 142, late: 8, leave: 5 });
    populateEmployees();
    renderAttendanceTable();
}

// Map Logic
let accuracyCircle;
function showMap(lat, lng, accuracy, addr, name) {
    const container = document.getElementById('map-container');
    const info = document.getElementById('location-info');
    container.style.display = 'block';
    info.innerHTML = `
        <div style="font-weight: 600; color: var(--text-main); margin-bottom: 5px;">Nhân viên: <span style="color: var(--primary);">${name}</span></div>
        <div style="font-weight: 600; color: var(--text-main); margin-bottom: 5px;">Địa chỉ thực tế:</div>
        <div style="margin-bottom: 8px;">${addr || 'Không xác định được địa chỉ'}</div>
        <div style="font-size: 0.75rem; color: ${accuracy > 100 ? 'var(--danger)' : 'var(--success)'};">
            <i class="fas fa-crosshairs"></i> Độ chính xác: +/- ${Math.round(accuracy)} mét
        </div>
    `;

    if (!map) {
        map = L.map('map').setView([lat, lng], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);
        marker = L.marker([lat, lng]).addTo(map);
        marker.bindPopup(`<b>${name}</b><br>Đang ở đây`).openPopup();
        accuracyCircle = L.circle([lat, lng], { radius: accuracy, color: '#6366f1', fillOpacity: 0.1 }).addTo(map);
    } else {
        map.setView([lat, lng], 16);
        marker.setLatLng([lat, lng]);
        marker.setPopupContent(`<b>${name}</b><br>Đang ở đây`).openPopup();
        if (accuracyCircle) map.removeLayer(accuracyCircle);
        accuracyCircle = L.circle([lat, lng], { radius: accuracy, color: '#6366f1', fillOpacity: 0.1 }).addTo(map);
    }
}

// Settings Management
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('attendanceSettings')) || { 
        startTime: '08:30', 
        endTime: '17:30',
        companyLat: '',
        companyLng: '',
        companyRadius: '200'
    };
    
    const [startH, startM] = (settings.startTime || '08:30').split(':');
    const [endH, endM] = (settings.endTime || '17:30').split(':');
    
    document.getElementById('setting-start-hour').value = startH;
    document.getElementById('setting-start-minute').value = startM;
    document.getElementById('setting-end-hour').value = endH;
    document.getElementById('setting-end-minute').value = endM;

    // Load company location
    document.getElementById('setting-company-lat').value = settings.companyLat || '';
    document.getElementById('setting-company-lng').value = settings.companyLng || '';
    document.getElementById('setting-company-radius').value = settings.companyRadius || '200';
}

function populateTimeSelects() {
    const hours = document.querySelectorAll('#setting-start-hour, #setting-end-hour');
    const minutes = document.querySelectorAll('#setting-start-minute, #setting-end-minute');

    hours.forEach(select => {
        for (let i = 0; i < 24; i++) {
            const h = i.toString().padStart(2, '0');
            select.innerHTML += `<option value="${h}">${h}</option>`;
        }
    });

    minutes.forEach(select => {
        for (let i = 0; i < 60; i += 5) { // Increments of 5 for convenience
            const m = i.toString().padStart(2, '0');
            select.innerHTML += `<option value="${m}">${m}</option>`;
        }
    });
    
    // Initial load again to set the values after options are created
    loadSettings();
}

function setupHistoryMap() {
    const btnViewMap = document.getElementById('btn-view-map');
    const btnCloseMap = document.getElementById('btn-close-history-map');
    const container = document.getElementById('history-map-container');

    btnViewMap.addEventListener('click', () => {
        container.style.display = 'block';
        renderHistoryMap();
        // Smooth scroll to map
        container.scrollIntoView({ behavior: 'smooth' });
    });

    btnCloseMap.addEventListener('click', () => {
        container.style.display = 'none';
    });
}

function renderHistoryMap() {
    if (!historyMap) {
        historyMap = L.map('history-map').setView([10.762622, 106.660172], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(historyMap);
    }

    // Clear existing markers
    historyMarkers.forEach(m => historyMap.removeLayer(m));
    historyMarkers = [];

    const bounds = [];
    attendanceData.forEach(record => {
        const lat = parseDMSToDecimal(record.checkin_lat || record.latitude || record.lat);
        const lng = parseDMSToDecimal(record.checkin_lng || record.longitude || record.lng);
        
        if (!isNaN(lat) && !isNaN(lng) && lat !== null && lng !== null) {
            const m = L.marker([lat, lng])
                .bindPopup(`<b>${record.name}</b><br>Giờ vào: ${record.checkin || '-'}<br>Ngày: ${record.date}`)
                .addTo(historyMap);
            historyMarkers.push(m);
            bounds.push([lat, lng]);
        }
    });

    if (bounds.length > 0) {
        historyMap.fitBounds(bounds, { padding: [50, 50] });
    } else {
        alert('Không có dữ liệu định vị cho ngày này!');
    }
}

function setupSettingsForm() {
    const form = document.getElementById('settings-form');
    const status = document.getElementById('settings-status');

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const settings = {
            startTime: `${document.getElementById('setting-start-hour').value}:${document.getElementById('setting-start-minute').value}`,
            endTime: `${document.getElementById('setting-end-hour').value}:${document.getElementById('setting-end-minute').value}`,
            companyLat: document.getElementById('setting-company-lat').value,
            companyLng: document.getElementById('setting-company-lng').value,
            companyRadius: document.getElementById('setting-company-radius').value
        };
        localStorage.setItem('attendanceSettings', JSON.stringify(settings));
        
        status.textContent = 'Cấu hình đã được lưu!';
        status.style.color = 'var(--success)';
        setTimeout(() => { status.textContent = ''; }, 3000);
    });

    // Get current location button
    document.getElementById('btn-get-current-loc').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lấy vị trí...';
        
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
            });
            document.getElementById('setting-company-lat').value = position.coords.latitude;
            document.getElementById('setting-company-lng').value = position.coords.longitude;
            alert('Đã lấy tọa độ hiện tại thành công!');
        } catch (error) {
            alert('Không thể lấy vị trí. Vui lòng kiểm tra quyền truy cập GPS!');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
}

/**
 * Calculates distance between two points in meters using Haversine formula
 */
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6378137; // Earth radius in meters (WGS84 standard)
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in meters
}

/**
 * Parses DMS coordinate string (e.g., 10°49'12.7"N) back to Decimal Degrees
 */
/**
 * Parses DMS coordinate string (e.g., 10°49'12.7"N) back to Decimal Degrees
 */
function parseDMSToDecimal(dms) {
    if (!dms) return null;
    if (typeof dms === 'number') return dms;
    
    // Convert comma to dot for Vietnamese locale support
    const str = dms.toString().trim().replace(',', '.');
    
    // If it's already a decimal string, parse it
    if (!isNaN(parseFloat(str)) && !str.includes('°')) {
        return parseFloat(str);
    }

    try {
        // Robust regex to handle spaces and different formats
        // Matches: 10°45'45.4"N, 10° 45' 45.4" N, etc.
        const regex = /(\d+)\s*°\s*(\d+)\s*'\s*([\d.]+)\s*"\s*([NSEW])/i;
        const parts = str.match(regex);
        
        if (!parts) {
            const val = parseFloat(str);
            return isNaN(val) ? null : val;
        }

        const degrees = parseFloat(parts[1]);
        const minutes = parseFloat(parts[2]);
        const seconds = parseFloat(parts[3]);
        const direction = parts[4].toUpperCase();

        let dd = degrees + minutes / 60 + seconds / 3600;

        if (direction === 'S' || direction === 'W') {
            dd = dd * -1;
        }

        return dd;
    } catch (e) {
        console.error('Error parsing DMS:', dms, e);
        return null;
    }
}

const API_BASE = '/api';

async function apiRequest(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const config = {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        ...options
    };

    try {
        const response = await fetch(url, config);
        const contentType = response.headers.get('content-type') || '';

        if (!contentType.includes('application/json')) {
            if (!response.ok) {
                throw new Error(`Server error (${response.status}). Please try again.`);
            }
            throw new Error('Unexpected server response. Please try again.');
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Request failed with status ${response.status}`);
        }

        return data;
    } catch (error) {
        if (error.message === 'Failed to fetch') {
            throw new Error('Network error. Please check your connection.');
        }
        throw error;
    }
}

function showAlert(elementId, message, type = 'error') {
    const alert = document.getElementById(elementId);
    if (!alert) return;
    alert.textContent = message;
    alert.className = `alert alert-${type} show`;
    if (type === 'success') {
        setTimeout(() => { alert.classList.remove('show'); }, 3000);
    }
}

function hideAlert(elementId) {
    const alert = document.getElementById(elementId);
    if (alert) alert.classList.remove('show');
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatRelativeTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    return formatDate(dateStr);
}

function getStatusBadge(status) {
    const map = {
        active: 'success',
        success: 'success',
        running: 'info',
        building: 'info',
        pending: 'warning',
        failed: 'danger',
        cancelled: 'danger',
        archived: 'warning'
    };
    return `<span class="badge badge-${map[status] || 'info'}">${status}</span>`;
}

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
}

async function checkAuth() {
    try {
        const data = await apiRequest('/auth/me');
        return data.user;
    } catch (e) {
        return null;
    }
}

async function requireAuth() {
    const user = await checkAuth();
    if (!user) {
        window.location.href = '/login';
        return null;
    }
    return user;
}

function setupNav(user) {
    const navUser = document.querySelector('.nav-user');
    if (!navUser || !user) return;

    navUser.innerHTML = `
        <span class="nav-username" style="font-size:0.875rem;color:var(--text-secondary)">${user.username}</span>
        <div class="avatar">${getInitials(user.username)}</div>
        <a href="#" onclick="logout()" style="font-size:0.8125rem;color:var(--text-muted)">Logout</a>
    `;

    const adminLink = document.querySelector('.nav-admin-link');
    if (adminLink) {
        adminLink.style.display = user.role === 'admin' ? 'inline' : 'none';
    }
}

async function logout() {
    try {
        await apiRequest('/auth/logout', { method: 'POST' });
    } catch (e) { }
    window.location.href = '/login';
}

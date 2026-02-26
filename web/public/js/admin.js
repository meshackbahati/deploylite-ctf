document.addEventListener('DOMContentLoaded', async () => {
    const user = await requireAuth();
    if (!user) return;

    if (user.role !== 'admin') {
        window.location.href = '/dashboard';
        return;
    }

    setupNav(user);
    loadStats();
    loadAuditLogs();
});

async function loadStats() {
    try {
        const data = await apiRequest('/admin/stats');
        const s = data.stats;
        document.getElementById('sUsers').textContent = s.totalUsers;
        document.getElementById('sProjects').textContent = s.totalProjects;
        document.getElementById('sBuilds').textContent = s.totalBuilds;
        document.getElementById('sSuccess').textContent = s.successfulBuilds;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

async function loadAuditLogs() {
    try {
        const filter = document.getElementById('auditFilter')?.value || '';
        const params = filter ? `?action=${filter}` : '';
        const data = await apiRequest(`/admin/audit-logs${params}`);
        const logs = data.logs || [];
        const container = document.getElementById('auditLogList');

        if (logs.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No audit logs found.</p></div>';
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Details</th>
                        <th>IP</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map(log => `
                        <tr>
                            <td style="white-space:nowrap">${formatDate(log.created_at)}</td>
                            <td><span style="color:var(--accent)">${escapeHtml(log.username || 'System')}</span></td>
                            <td><span class="badge ${getActionBadge(log.action)}">${log.action}</span></td>
                            <td style="font-size:0.8125rem;color:var(--text-muted)">${formatDetails(log.details)}</td>
                            <td style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:var(--text-muted)">${log.ip_address || '—'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        document.getElementById('auditLogList').innerHTML = `<div class="alert alert-error show">${error.message}</div>`;
    }
}

async function loadUsers() {
    try {
        const data = await apiRequest('/admin/users');
        const users = data.users || [];
        const container = document.getElementById('userList');

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Company</th>
                        <th>Joined</th>
                        <th>Last Login</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => `
                        <tr>
                            <td style="font-weight:500">${escapeHtml(u.username)}</td>
                            <td style="color:var(--text-secondary)">${escapeHtml(u.email)}</td>
                            <td><span class="badge badge-${u.role === 'admin' ? 'warning' : 'info'}">${u.role}</span></td>
                            <td style="color:var(--text-muted)">${escapeHtml(u.company || '—')}</td>
                            <td style="color:var(--text-muted)">${formatDate(u.created_at)}</td>
                            <td style="color:var(--text-muted)">${u.last_login ? formatRelativeTime(u.last_login) : 'Never'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        document.getElementById('userList').innerHTML = `<div class="alert alert-error show">${error.message}</div>`;
    }
}

function switchAdminTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');

    if (tabName === 'users') loadUsers();
}

function getActionBadge(action) {
    if (action.includes('login_failed')) return 'badge-danger';
    if (action.includes('login') || action.includes('register')) return 'badge-info';
    if (action.includes('build')) return 'badge-warning';
    if (action.includes('delete')) return 'badge-danger';
    return 'badge-success';
}

function formatDetails(details) {
    if (!details || typeof details !== 'object') return '—';
    return Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(', ');
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

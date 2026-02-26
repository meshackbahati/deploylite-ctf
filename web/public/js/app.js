document.addEventListener('DOMContentLoaded', async () => {
    const user = await requireAuth();
    if (!user) return;
    setupNav(user);
    loadProjects();
});

async function loadProjects() {
    try {
        const data = await apiRequest('/projects');
        const projects = data.projects || [];

        document.getElementById('totalProjects').textContent = projects.length;
        document.getElementById('activeBuilds').textContent = projects.filter(p => p.status === 'building').length;
        document.getElementById('totalDeploys').textContent = projects.filter(p => p.status === 'active').length;

        const successCount = projects.filter(p => p.status === 'active').length;
        const rate = projects.length > 0 ? Math.round((successCount / projects.length) * 100) : 0;
        document.getElementById('successRate').textContent = rate + '%';

        const container = document.getElementById('projectList');

        if (projects.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7M3 7l9 6 9-6M3 7c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2"/></svg>
                    <h3>No projects yet</h3>
                    <p>Create your first project to get started with DeployLite.</p>
                    <button class="btn btn-primary" onclick="openCreateModal()">Create Project</button>
                </div>
            `;
            return;
        }

        container.innerHTML = projects.map(p => `
            <div class="card project-card fade-in" onclick="window.location.href='/project?id=${p.id}'">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
                    <h3>${escapeHtml(p.name)}</h3>
                    ${getStatusBadge(p.status)}
                </div>
                <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:0.75rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(p.description || 'No description provided')}</p>
                <div class="tech-stack">${escapeHtml(p.tech_stack || '')}</div>
                <div class="project-meta">
                    <span>${p.owner_name || 'Unknown'}</span>
                    <span>${formatRelativeTime(p.updated_at)}</span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        document.getElementById('projectList').innerHTML = `
            <div class="alert alert-error show" style="grid-column:1/-1">${error.message}</div>
        `;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function openCreateModal() {
    document.getElementById('createModal').classList.add('active');
}

function closeCreateModal() {
    document.getElementById('createModal').classList.remove('active');
    document.getElementById('createForm').reset();
    hideAlert('createAlert');
}

document.getElementById('createForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('createBtn');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
        const project = {
            name: document.getElementById('projectName').value,
            description: document.getElementById('projectDesc').value,
            repo_url: document.getElementById('projectRepo').value,
            tech_stack: document.getElementById('projectTech').value,
            is_public: document.getElementById('projectPublic').checked
        };

        await apiRequest('/projects', {
            method: 'POST',
            body: JSON.stringify(project)
        });

        closeCreateModal();
        loadProjects();
    } catch (error) {
        showAlert('createAlert', error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create Project';
    }
});

document.getElementById('createModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) closeCreateModal();
});

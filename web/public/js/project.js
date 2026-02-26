let currentProject = null;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;
    setupNav(currentUser);

    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('id');

    if (!projectId) {
        window.location.href = '/dashboard';
        return;
    }

    loadProject(projectId);
});

async function loadProject(projectId) {
    try {
        const data = await apiRequest(`/projects/${projectId}`);
        currentProject = data.project;
        document.title = `${currentProject.name} — DeployLite`;
        renderProject();
        loadBuilds(projectId);
    } catch (error) {
        document.getElementById('projectContent').innerHTML = `
            <div class="alert alert-error show">${error.message}</div>
            <a href="/dashboard" class="btn btn-secondary" style="margin-top:1rem">← Back to Dashboard</a>
        `;
    }
}

function renderProject() {
    const p = currentProject;
    const contentEl = document.getElementById('projectContent');

    contentEl.innerHTML = `
        <div class="project-detail-header">
            <div>
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem">
                    <h1>${escapeHtml(p.name)}</h1>
                    ${getStatusBadge(p.status)}
                    ${p.is_public ? '<span class="badge badge-info">Public</span>' : ''}
                </div>
                <p style="color:var(--text-muted);font-size:0.875rem">
                    ${escapeHtml(p.tech_stack || '')} · Created ${formatDate(p.created_at)} · ${p.owner_name || 'Unknown'}
                </p>
            </div>
            <div class="project-actions">
                <button class="btn btn-primary" onclick="openBuildModal()">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 14,8 5,13"/></svg>
                    Run Build
                </button>
                <button class="btn btn-secondary" onclick="shareProject()">Share</button>
                <button class="btn btn-danger btn-sm" onclick="deleteProject()">Delete</button>
            </div>
        </div>

        <div class="tabs">
            <button class="tab active" onclick="switchTab('overview')">Overview</button>
            <button class="tab" onclick="switchTab('builds')">Build History</button>
            <button class="tab" onclick="switchTab('settings')">Settings</button>
        </div>

        <div id="tab-overview" class="tab-content active">
            <div class="card" style="margin-bottom:1.5rem">
                <h3 style="font-size:0.875rem;color:var(--text-muted);margin-bottom:0.75rem">Description</h3>
                <div class="description-content" id="projectDescription">${p.description || '<em style="color:var(--text-muted)">No description provided</em>'}</div>
            </div>

            ${p.repo_url ? `
            <div class="card" style="margin-bottom:1.5rem">
                <h3 style="font-size:0.875rem;color:var(--text-muted);margin-bottom:0.5rem">Repository</h3>
                <a href="${escapeHtml(p.repo_url)}" target="_blank" style="font-size:0.875rem">${escapeHtml(p.repo_url)}</a>
            </div>` : ''}

            ${p.preview_url ? `
            <div class="card" style="margin-bottom:1.5rem">
                <h3 style="font-size:0.875rem;color:var(--text-muted);margin-bottom:0.5rem">Preview</h3>
                <a href="${escapeHtml(p.preview_url)}" target="_blank" style="font-size:0.875rem">${escapeHtml(p.preview_url)}</a>
            </div>` : ''}
        </div>

        <div id="tab-builds" class="tab-content">
            <div class="card">
                <h3 style="font-size:0.875rem;color:var(--text-muted);margin-bottom:1rem">Recent Builds</h3>
                <div id="buildList"><div class="loading">Loading builds...</div></div>
            </div>
        </div>

        <div id="tab-settings" class="tab-content">
            <div class="card">
                <h3 style="margin-bottom:1.25rem">Project Settings</h3>
                <form id="settingsForm">
                    <div class="input-group">
                        <label>Project Name</label>
                        <input type="text" id="settingName" value="${escapeHtml(p.name)}">
                    </div>
                    <div class="input-group">
                        <label>Description</label>
                        <textarea id="settingDesc" rows="4">${escapeHtml(p.description || '')}</textarea>
                    </div>
                    <div class="input-group">
                        <label>Repository URL</label>
                        <input type="url" id="settingRepo" value="${escapeHtml(p.repo_url || '')}">
                    </div>
                    <div class="input-group">
                        <label>Tech Stack</label>
                        <input type="text" id="settingTech" value="${escapeHtml(p.tech_stack || '')}">
                    </div>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </form>
            </div>
        </div>
    `;

    document.getElementById('settingsForm')?.addEventListener('submit', saveSettings);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

async function loadBuilds(projectId) {
    try {
        const data = await apiRequest(`/builds/${projectId}`);
        const builds = data.builds || [];
        const container = document.getElementById('buildList');

        if (builds.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No builds yet. Trigger your first build to get started.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = builds.map(b => `
            <div class="build-entry" onclick="window.location.href='/build-logs?id=${b.id}'">
                <div class="build-info">
                    ${getStatusBadge(b.status)}
                    <span style="font-weight:500">${b.branch || 'main'}</span>
                    <span style="color:var(--text-muted)">${b.commit_sha ? b.commit_sha.substring(0, 7) : '—'}</span>
                </div>
                <div style="display:flex;align-items:center;gap:1rem;color:var(--text-muted)">
                    <span>${b.duration_ms ? (b.duration_ms / 1000).toFixed(1) + 's' : '—'}</span>
                    <span>${formatRelativeTime(b.created_at)}</span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        document.getElementById('buildList').innerHTML = `<div class="alert alert-error show">${error.message}</div>`;
    }
}

function openBuildModal() {
    if (currentProject?.repo_url) {
        document.getElementById('buildRepo').value = currentProject.repo_url;
    }
    document.getElementById('buildModal').classList.add('active');
}

function closeBuildModal() {
    document.getElementById('buildModal').classList.remove('active');
    hideAlert('buildAlert');
}

document.getElementById('buildForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('triggerBtn');
    btn.disabled = true;
    btn.textContent = 'Building...';

    try {
        const payload = {
            project_id: currentProject.id,
            repo_url: document.getElementById('buildRepo').value,
            build_script: document.getElementById('buildScript').value,
            branch: document.getElementById('buildBranch').value
        };

        const result = await apiRequest('/builds/trigger', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        closeBuildModal();

        if (result.build) {
            window.location.href = `/build-logs?id=${result.build.id}`;
        } else {
            loadBuilds(currentProject.id);
        }
    } catch (error) {
        showAlert('buildAlert', error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Run Build';
    }
});

document.getElementById('buildModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) closeBuildModal();
});

async function saveSettings(e) {
    e.preventDefault();
    try {
        await apiRequest(`/projects/${currentProject.id}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: document.getElementById('settingName').value,
                description: document.getElementById('settingDesc').value,
                repo_url: document.getElementById('settingRepo').value,
                tech_stack: document.getElementById('settingTech').value
            })
        });
        loadProject(currentProject.id);
    } catch (error) {
        alert(error.message);
    }
}

async function deleteProject() {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) return;
    try {
        await apiRequest(`/projects/${currentProject.id}`, { method: 'DELETE' });
        window.location.href = '/dashboard';
    } catch (error) {
        alert(error.message);
    }
}

async function shareProject() {
    try {
        const data = await apiRequest(`/projects/${currentProject.id}/share`);
        prompt('Share this preview link:', data.shareUrl);
    } catch (error) {
        alert(error.message);
    }
}

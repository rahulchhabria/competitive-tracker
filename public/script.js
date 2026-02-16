const API_BASE = 'http://localhost:3000/api';

let editingIndex = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkApiKey();
    loadCompetitors();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('addCompetitorBtn').addEventListener('click', openAddModal);
    document.getElementById('competitorForm').addEventListener('submit', handleCompetitorSubmit);
    document.getElementById('runDigestBtn').addEventListener('click', runDigest);
    document.getElementById('cancelDigestBtn').addEventListener('click', cancelDigest);
}

// API Key Check
async function checkApiKey() {
    try {
        const response = await fetch(`${API_BASE}/config/check`);
        const data = await response.json();

        const warning = document.getElementById('apiKeyWarning');
        const runBtn = document.getElementById('runDigestBtn');

        if (!data.hasApiKey) {
            warning.classList.remove('hidden');
            runBtn.disabled = true;
        } else {
            warning.classList.add('hidden');
            runBtn.disabled = false;
        }
    } catch (error) {
        console.error('Failed to check API key:', error);
    }
}

// Competitors
async function loadCompetitors() {
    try {
        const response = await fetch(`${API_BASE}/competitors`);
        const competitors = await response.json();

        const list = document.getElementById('competitorsList');

        if (competitors.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>No competitors added yet. Click "Add Competitor" to get started!</p></div>';
            return;
        }

        list.innerHTML = competitors.map((comp, index) => `
            <div class="competitor-item">
                <div class="competitor-info">
                    <div class="competitor-name">
                        ${comp.name}
                        <span class="competitor-status ${comp.enabled ? 'enabled' : 'disabled'}">
                            ${comp.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                    <div class="competitor-url">${comp.websiteUrl}</div>
                    <div class="competitor-feeds">${comp.feedUrls.length} RSS feed(s) • Blog: ${comp.blogUrl ? 'Yes' : 'No'}</div>
                </div>
                <div class="competitor-actions">
                    <button class="btn btn-danger btn-small" onclick="deleteCompetitor(${index})">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load competitors:', error);
        alert('Failed to load competitors');
    }
}

function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Add Competitor';
    document.getElementById('competitorForm').reset();
    document.getElementById('discoveryStatus').classList.add('hidden');
    document.getElementById('submitBtn').disabled = false;
    document.getElementById('competitorModal').classList.remove('hidden');
}

async function deleteCompetitor(index) {
    if (!confirm('Are you sure you want to delete this competitor?')) {
        return;
    }

    try {
        await fetch(`${API_BASE}/competitors/${index}`, {
            method: 'DELETE'
        });
        loadCompetitors();
    } catch (error) {
        console.error('Failed to delete competitor:', error);
        alert('Failed to delete competitor');
    }
}

async function handleCompetitorSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const name = formData.get('name');
    const domain = formData.get('domain');

    // Show discovery status
    const discoveryStatus = document.getElementById('discoveryStatus');
    const submitBtn = document.getElementById('submitBtn');
    discoveryStatus.classList.remove('hidden');
    submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/competitors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, domain })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add competitor');
        }

        closeModal();
        loadCompetitors();
    } catch (error) {
        console.error('Failed to save competitor:', error);
        alert(error.message || 'Failed to add competitor. Please check the domain and try again.');
        discoveryStatus.classList.add('hidden');
        submitBtn.disabled = false;
    }
}

function closeModal() {
    document.getElementById('competitorModal').classList.add('hidden');
    editingIndex = null;
}

// Run Digest
async function runDigest() {
    const runBtn = document.getElementById('runDigestBtn');
    const cancelBtn = document.getElementById('cancelDigestBtn');
    const progressSection = document.getElementById('progressSection');
    const progressFill = document.getElementById('progressFill');
    const progressMessage = document.getElementById('progressMessage');
    const progressLogs = document.getElementById('progressLogs');
    const digestResult = document.getElementById('digestResult');

    runBtn.disabled = true;
    runBtn.classList.add('hidden');
    cancelBtn.classList.remove('hidden');
    cancelBtn.disabled = false;
    progressSection.classList.remove('hidden');
    digestResult.classList.add('hidden');
    progressFill.style.width = '0%';
    progressMessage.textContent = 'Starting...';
    progressLogs.innerHTML = '';

    try {
        // Start the digest generation
        await fetch(`${API_BASE}/run-digest`, {
            method: 'POST'
        });

        // Poll for progress
        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${API_BASE}/run-digest/progress`);
                const progress = await response.json();

                progressFill.style.width = `${progress.progress}%`;
                progressMessage.textContent = progress.message;

                // Update logs
                if (progress.logs && progress.logs.length > 0) {
                    progressLogs.innerHTML = progress.logs
                        .map(log => `<div>${escapeHtml(log)}</div>`)
                        .join('');
                    progressLogs.scrollTop = progressLogs.scrollHeight;
                }

                // Check if complete
                if (!progress.isRunning) {
                    clearInterval(pollInterval);
                    runBtn.disabled = false;
                    runBtn.classList.remove('hidden');
                    cancelBtn.classList.add('hidden');

                    if (progress.stage === 'complete') {
                        // Show success message with link to markdown file
                        digestResult.classList.remove('hidden');

                        // Get the latest digest date from the logs
                        const today = new Date().toISOString().split('T')[0];
                        const digestLink = document.getElementById('digestLink');
                        digestLink.href = `/api/digest/${today}`;
                    }
                }
            } catch (error) {
                console.error('Failed to check progress:', error);
                clearInterval(pollInterval);
                runBtn.disabled = false;
                runBtn.classList.remove('hidden');
                cancelBtn.classList.add('hidden');
            }
        }, 1000);
    } catch (error) {
        console.error('Failed to start digest generation:', error);
        alert('Failed to start digest generation');
        runBtn.disabled = false;
        runBtn.classList.remove('hidden');
        cancelBtn.classList.add('hidden');
        progressSection.classList.add('hidden');
    }
}

// Cancel Digest
async function cancelDigest() {
    const cancelBtn = document.getElementById('cancelDigestBtn');

    if (!confirm('Are you sure you want to cancel the digest generation?')) {
        return;
    }

    try {
        cancelBtn.disabled = true;
        const response = await fetch(`${API_BASE}/run-digest/cancel`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            console.log(data.message);
        }
    } catch (error) {
        console.error('Failed to cancel digest generation:', error);
        alert('Failed to cancel digest generation');
        cancelBtn.disabled = false;
    }
}

// Utilities
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

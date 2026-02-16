const API_BASE = 'http://localhost:3000/api';

let editingIndex = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkApiKey();
    loadCompetitors();
    setupEventListeners();
    setupKeyboardShortcuts();
});

function setupEventListeners() {
    document.getElementById('addCompetitorBtn').addEventListener('click', openAddModal);
    document.getElementById('competitorForm').addEventListener('submit', handleCompetitorSubmit);
    document.getElementById('runDigestBtn').addEventListener('click', runDigest);
    document.getElementById('cancelDigestBtn').addEventListener('click', cancelDigest);

    // Close modal on backdrop click
    document.getElementById('competitorModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Escape to close modal
        if (e.key === 'Escape') closeModal();
    });
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
        const countEl = document.getElementById('competitorCount');

        if (competitors.length === 0) {
            countEl.textContent = '';
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </div>
                    <p>No competitors tracked yet. Add a company to start monitoring.</p>
                </div>`;
            return;
        }

        countEl.textContent = `${competitors.length} ${competitors.length === 1 ? 'company' : 'companies'}`;

        list.innerHTML = competitors.map((comp, index) => {
            const initial = comp.name.charAt(0).toUpperCase();
            const feedCount = comp.feedUrls.length;
            const hasBlog = comp.blogUrl ? true : false;

            return `
            <div class="competitor-item">
                <div class="competitor-info">
                    <div class="competitor-avatar">${escapeHtml(initial)}</div>
                    <div class="competitor-details">
                        <div class="competitor-name">
                            ${escapeHtml(comp.name)}
                            <span class="badge ${comp.enabled ? 'badge-success' : 'badge-error'}">
                                <span class="badge-dot"></span>
                                ${comp.enabled ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                        <div class="competitor-meta">
                            <span>${escapeHtml(comp.websiteUrl)}</span>
                            <span class="dot"></span>
                            <span>${feedCount} feed${feedCount !== 1 ? 's' : ''}</span>
                            ${hasBlog ? '<span class="dot"></span><span>Blog</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="competitor-actions">
                    <button class="btn btn-danger btn-small" onclick="deleteCompetitor(${index})">Remove</button>
                </div>
            </div>`;
        }).join('');
    } catch (error) {
        console.error('Failed to load competitors:', error);
    }
}

function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Add Competitor';
    document.getElementById('competitorForm').reset();
    document.getElementById('discoveryStatus').classList.add('hidden');
    document.getElementById('submitBtn').disabled = false;
    document.getElementById('competitorModal').classList.remove('hidden');

    // Focus the first input
    setTimeout(() => document.getElementById('name').focus(), 100);
}

async function deleteCompetitor(index) {
    if (!confirm('Remove this competitor? This action cannot be undone.')) {
        return;
    }

    try {
        await fetch(`${API_BASE}/competitors/${index}`, {
            method: 'DELETE'
        });
        loadCompetitors();
    } catch (error) {
        console.error('Failed to delete competitor:', error);
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
    submitBtn.textContent = 'Adding...';

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
        submitBtn.textContent = 'Add Competitor';
    }
}

function closeModal() {
    document.getElementById('competitorModal').classList.add('hidden');
    document.getElementById('submitBtn').textContent = 'Add Competitor';
    editingIndex = null;
}

// Run Digest
let logLineCount = 0;

async function runDigest() {
    const runBtn = document.getElementById('runDigestBtn');
    const cancelBtn = document.getElementById('cancelDigestBtn');
    const progressSection = document.getElementById('progressSection');
    const progressFill = document.getElementById('progressFill');
    const progressMessage = document.getElementById('progressMessage');
    const progressLogs = document.getElementById('progressLogs');
    const digestResult = document.getElementById('digestResult');

    logLineCount = 0;
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

                // Update logs with line numbers
                if (progress.logs && progress.logs.length > 0) {
                    progressLogs.innerHTML = progress.logs
                        .map((log, i) => `<div data-line="${i + 1}">${escapeHtml(log)}</div>`)
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
                        digestResult.classList.remove('hidden');

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
        runBtn.disabled = false;
        runBtn.classList.remove('hidden');
        cancelBtn.classList.add('hidden');
        progressSection.classList.add('hidden');
    }
}

// Cancel Digest
async function cancelDigest() {
    const cancelBtn = document.getElementById('cancelDigestBtn');

    if (!confirm('Cancel the digest generation?')) {
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
        cancelBtn.disabled = false;
    }
}

// Utilities
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

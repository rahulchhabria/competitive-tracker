const API_BASE = 'http://localhost:3000/api';

let editingIndex = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkApiKey();
    loadSettings();
    loadCompanyProfile();
    loadCompetitors();
    setupEventListeners();
    setupKeyboardShortcuts();
    checkForRunningDigest();
    initializeDatePickers();
});

// Initialize date pickers with defaults
function initializeDatePickers() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Default to last 30 days

    document.getElementById('endDate').valueAsDate = endDate;
    document.getElementById('startDate').valueAsDate = startDate;
}

function setupEventListeners() {
    document.getElementById('addCompetitorBtn').addEventListener('click', openAddModal);
    document.getElementById('competitorForm').addEventListener('submit', handleCompetitorSubmit);
    document.getElementById('runDigestBtn').addEventListener('click', runDigest);
    document.getElementById('cancelDigestBtn').addEventListener('click', cancelDigest);

    // Company profile event listeners
    document.getElementById('setupCompanyProfileBtn').addEventListener('click', openCompanyProfileModal);
    document.getElementById('editCompanyProfileBtn').addEventListener('click', openEditCompanyProfileModal);
    document.getElementById('companyProfileModalForm').addEventListener('submit', handleCompanyProfileSubmit);

    // Settings event listeners
    document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
    document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);

    // Close modals on backdrop click
    document.getElementById('competitorModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });
    document.getElementById('companyProfileModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeCompanyModal();
    });
    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeSettingsModal();
    });
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Escape to close modals
        if (e.key === 'Escape') {
            closeModal();
            closeCompanyModal();
            closeSettingsModal();
        }
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

// Company Profile Functions
async function loadCompanyProfile() {
    try {
        const response = await fetch(`${API_BASE}/company-profile`);
        const profile = await response.json();

        if (profile) {
            displayCompanyProfile(profile);
        } else {
            showCompanyProfileEmpty();
        }
    } catch (error) {
        console.error('Failed to load company profile:', error);
        showCompanyProfileEmpty();
    }
}

function showCompanyProfileEmpty() {
    document.getElementById('companyProfileEmpty').classList.remove('hidden');
    document.getElementById('companyProfileDisplay').classList.add('hidden');
    document.getElementById('editCompanyProfileBtn').classList.add('hidden');
}

function displayCompanyProfile(profile) {
    document.getElementById('companyProfileEmpty').classList.add('hidden');
    document.getElementById('companyProfileDisplay').classList.remove('hidden');
    document.getElementById('editCompanyProfileBtn').classList.remove('hidden');

    // Set company name
    document.getElementById('profileName').textContent = profile.name;

    // Set description
    if (profile.description) {
        document.getElementById('profileDescriptionField').classList.remove('hidden');
        document.getElementById('profileDescription').textContent = profile.description;
    } else {
        document.getElementById('profileDescriptionField').classList.add('hidden');
    }

    // Set products
    if (profile.products && profile.products.length > 0) {
        document.getElementById('profileProductsField').classList.remove('hidden');
        const productsContainer = document.getElementById('profileProducts');
        productsContainer.innerHTML = profile.products.map(p => `<span class="tag">${p}</span>`).join('');
    } else {
        document.getElementById('profileProductsField').classList.add('hidden');
    }

    // Set target market
    if (profile.targetMarket) {
        document.getElementById('profileTargetMarketField').classList.remove('hidden');
        document.getElementById('profileTargetMarket').textContent = profile.targetMarket;
    } else {
        document.getElementById('profileTargetMarketField').classList.add('hidden');
    }

    // Set differentiators
    if (profile.differentiators && profile.differentiators.length > 0) {
        document.getElementById('profileDifferentiatorsField').classList.remove('hidden');
        const diffContainer = document.getElementById('profileDifferentiators');
        diffContainer.innerHTML = profile.differentiators.map(d => `<span class="tag">${d}</span>`).join('');
    } else {
        document.getElementById('profileDifferentiatorsField').classList.add('hidden');
    }
}

function openCompanyProfileModal() {
    document.getElementById('companyModalTitle').textContent = 'Set Up Your Company';
    document.getElementById('companyNameInput').value = '';
    document.getElementById('companyDomainInput').value = '';
    document.getElementById('companyProfileModal').classList.remove('hidden');
}

async function openEditCompanyProfileModal() {
    try {
        const response = await fetch(`${API_BASE}/company-profile`);
        const profile = await response.json();

        if (profile) {
            document.getElementById('companyModalTitle').textContent = 'Edit Company Profile';
            document.getElementById('companyNameInput').value = profile.name || '';
            // For edit, we can extract domain from profile if we had it, or leave blank
            document.getElementById('companyDomainInput').value = '';
            document.getElementById('companyProfileModal').classList.remove('hidden');
        }
    } catch (error) {
        console.error('Failed to load profile for editing:', error);
        openCompanyProfileModal();
    }
}

function closeCompanyModal() {
    document.getElementById('companyProfileModal').classList.add('hidden');
    document.getElementById('companyDiscoveryStatus').classList.add('hidden');
}

async function handleCompanyProfileSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('companyNameInput').value.trim();
    const domain = document.getElementById('companyDomainInput').value.trim();

    if (!name || !domain) {
        alert('Both name and domain are required');
        return;
    }

    // Show loading state
    const submitBtn = document.getElementById('companySubmitBtn');
    const statusDiv = document.getElementById('companyDiscoveryStatus');
    submitBtn.disabled = true;
    statusDiv.classList.remove('hidden');

    try {
        const response = await fetch(`${API_BASE}/company-profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, domain })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to set up company profile');
        }

        const profile = await response.json();

        // Close modal and display profile
        closeCompanyModal();
        displayCompanyProfile(profile);
    } catch (error) {
        console.error('Failed to set up company profile:', error);
        alert('Failed to set up profile: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        statusDiv.classList.add('hidden');
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
                    <button class="btn btn-primary btn-large" onclick="openAddModal()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add Competitor
                    </button>
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
            const errorData = await response.json();

            // Show detailed error for no feeds found
            if (errorData.error === 'no_feeds_found') {
                showNoFeedsError(errorData);
            } else {
                throw new Error(errorData.message || errorData.error || 'Failed to add competitor');
            }
            return;
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

function showNoFeedsError(errorData) {
    // Reset form state
    document.getElementById('discoveryStatus').classList.add('hidden');
    document.getElementById('submitBtn').disabled = false;
    document.getElementById('submitBtn').textContent = 'Add Competitor';

    // Build error message
    let message = `⚠️ ${errorData.message}\n\n`;
    message += `${errorData.suggestion}\n\n`;

    errorData.options.forEach((option, i) => {
        message += `${i + 1}. ${option}\n`;
    });

    if (errorData.details?.blogUrl) {
        message += `\n\n📝 Found blog: ${errorData.details.blogUrl}`;
        message += `\n   Try visiting this URL to look for an RSS/feed link.`;
    }

    message += `\n\n💡 Companies with RSS feeds: Sentry, Datadog, Linear, Notion, Asana`;

    alert(message);
}

// Run Digest
let logLineCount = 0;
let currentPollInterval = null;

// Check for running digest on page load
async function checkForRunningDigest() {
    try {
        const response = await fetch(`${API_BASE}/run-digest/progress`);
        const progress = await response.json();

        if (progress.isRunning) {
            // Resume showing the running digest
            const runBtn = document.getElementById('runDigestBtn');
            const cancelBtn = document.getElementById('cancelDigestBtn');
            const progressSection = document.getElementById('progressSection');
            const progressStatus = document.querySelector('.progress-status');

            runBtn.disabled = true;
            runBtn.classList.add('hidden');
            cancelBtn.classList.remove('hidden');
            cancelBtn.disabled = false;
            progressSection.classList.remove('hidden');

            // Show spinner and warning
            const spinner = progressStatus.querySelector('.spinner-inline');
            if (spinner) {
                spinner.style.display = 'block';
            }

            const progressWarning = document.querySelector('.progress-warning');
            if (progressWarning) {
                progressWarning.style.display = 'flex';
            }

            // Start polling
            startProgressPolling();
        }
    } catch (error) {
        console.error('Failed to check for running digest:', error);
    }
}

function startProgressPolling() {
    const progressFill = document.getElementById('progressFill');
    const progressMessage = document.getElementById('progressMessage');
    const progressEstimate = document.getElementById('progressEstimate');
    const progressLogs = document.getElementById('progressLogs');
    const digestResult = document.getElementById('digestResult');
    const runBtn = document.getElementById('runDigestBtn');
    const cancelBtn = document.getElementById('cancelDigestBtn');
    const progressStatus = document.querySelector('.progress-status');

    currentPollInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/run-digest/progress`);
            const progress = await response.json();

            progressFill.style.width = `${progress.progress}%`;
            progressMessage.textContent = progress.message;

            // Update time estimates
            if (progress.estimatedMinutesRemaining && progress.estimatedCompletionTime) {
                progressEstimate.innerHTML = `
                    <div class="time-remaining">~${progress.estimatedMinutesRemaining} min remaining</div>
                    <div class="completion-time">Est. completion: ${progress.estimatedCompletionTime}</div>
                `;
            } else {
                progressEstimate.innerHTML = '';
            }

            // Update logs with line numbers
            if (progress.logs && progress.logs.length > 0) {
                progressLogs.innerHTML = progress.logs
                    .map((log, i) => `<div data-line="${i + 1}">${escapeHtml(log)}</div>`)
                    .join('');
                progressLogs.scrollTop = progressLogs.scrollHeight;
            }

            // Check if complete
            if (!progress.isRunning) {
                clearInterval(currentPollInterval);
                currentPollInterval = null;
                runBtn.disabled = false;
                runBtn.classList.remove('hidden');
                cancelBtn.classList.add('hidden');

                // Hide spinner when complete
                const spinner = progressStatus.querySelector('.spinner-inline');
                if (spinner) {
                    spinner.style.display = 'none';
                }

                // Hide warning when complete
                const progressWarning = document.querySelector('.progress-warning');
                if (progressWarning) {
                    progressWarning.style.display = 'none';
                }

                // Clear time estimates
                progressEstimate.innerHTML = '';

                if (progress.stage === 'complete') {
                    digestResult.classList.remove('hidden');

                    // Use the digest date from the server (week start date)
                    const digestDate = progress.digestDate || new Date().toISOString().split('T')[0];
                    const digestLink = document.getElementById('digestLink');
                    digestLink.href = `/api/digest/${digestDate}`;

                    // Display the file path
                    const digestFilePath = document.getElementById('digestFilePath');
                    // Use the file path from server, or construct it from the digest date
                    const filePath = progress.filePath || `/Users/rahulchhabria/Documents/GitHub/competitive-tracker/exports/digest_${digestDate}.md`;
                    digestFilePath.textContent = filePath;
                    // Store the path globally for the copy function
                    window.currentDigestPath = filePath;
                }
            }
        } catch (error) {
            console.error('Failed to check progress:', error);
            clearInterval(currentPollInterval);
            currentPollInterval = null;
            runBtn.disabled = false;
            runBtn.classList.remove('hidden');
            cancelBtn.classList.add('hidden');

            // Hide spinner on error
            const spinner = progressStatus.querySelector('.spinner-inline');
            if (spinner) {
                spinner.style.display = 'none';
            }
        }
    }, 1000);
}

async function runDigest() {
    const runBtn = document.getElementById('runDigestBtn');
    const cancelBtn = document.getElementById('cancelDigestBtn');
    const progressSection = document.getElementById('progressSection');
    const progressFill = document.getElementById('progressFill');
    const progressMessage = document.getElementById('progressMessage');
    const progressLogs = document.getElementById('progressLogs');
    const digestResult = document.getElementById('digestResult');
    const progressStatus = document.querySelector('.progress-status');

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

    // Show spinner and warning
    const spinner = progressStatus.querySelector('.spinner-inline');
    if (spinner) {
        spinner.style.display = 'block';
    }

    const progressWarning = document.querySelector('.progress-warning');
    if (progressWarning) {
        progressWarning.style.display = 'flex';
    }

    try {
        // Get date range from inputs
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        // Start the digest generation with date range
        await fetch(`${API_BASE}/run-digest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate, endDate })
        });

        // Start polling
        startProgressPolling();
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
    const runBtn = document.getElementById('runDigestBtn');
    const cancelBtn = document.getElementById('cancelDigestBtn');
    const progressMessage = document.getElementById('progressMessage');
    const progressLogs = document.getElementById('progressLogs');
    const progressFill = document.getElementById('progressFill');
    const progressEstimate = document.getElementById('progressEstimate');
    const progressStatus = document.querySelector('.progress-status');
    const progressSection = document.getElementById('progressSection');

    if (!confirm('Cancel the digest generation?')) {
        return;
    }

    try {
        cancelBtn.disabled = true;

        // Call the cancel API
        const response = await fetch(`${API_BASE}/run-digest/cancel`, {
            method: 'POST'
        });

        if (response.ok) {
            // Immediately stop polling
            if (currentPollInterval) {
                clearInterval(currentPollInterval);
                currentPollInterval = null;
            }

            // Hide spinner
            const spinner = progressStatus.querySelector('.spinner-inline');
            if (spinner) {
                spinner.style.display = 'none';
            }

            // Clear time estimates
            progressEstimate.innerHTML = '';

            // Update UI to show cancellation
            progressMessage.textContent = 'Cancelled';
            progressFill.style.width = '0%';

            // Add cancellation message to logs
            const currentLogs = progressLogs.innerHTML;
            progressLogs.innerHTML = currentLogs + `<div data-line="${progressLogs.children.length + 1}">\n⚠️  Digest generation cancelled by user.</div>`;
            progressLogs.scrollTop = progressLogs.scrollHeight;

            // Reset buttons and hide progress after a moment
            setTimeout(() => {
                runBtn.disabled = false;
                runBtn.classList.remove('hidden');
                cancelBtn.classList.add('hidden');
                progressSection.classList.add('hidden');
            }, 1500);
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

// Copy file path to clipboard
function copyFilePath() {
    let filePath = window.currentDigestPath;

    // If no path from current session, try to construct from digest date
    if (!filePath) {
        const digestFilePath = document.getElementById('digestFilePath');
        if (digestFilePath && digestFilePath.textContent) {
            filePath = digestFilePath.textContent;
        }
    }

    if (!filePath) {
        alert('No file path available. Please generate a new digest to see the file location.');
        return;
    }

    navigator.clipboard.writeText(filePath).then(() => {
        const btn = document.getElementById('openFolderBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
        btn.classList.add('btn-success');

        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove('btn-success');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy path:', err);
        alert('Failed to copy path to clipboard');
    });
}

// Settings Functions
async function loadSettings() {
    try {
        const response = await fetch(`${API_BASE}/settings`);
        const settings = await response.json();

        // Show getting started banner if not dismissed
        const banner = document.getElementById('gettingStartedBanner');
        const dismissed = localStorage.getItem('gettingStartedDismissed');
        if (!dismissed) {
            banner.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function openSettingsModal() {
    try {
        const response = await fetch(`${API_BASE}/settings`);
        const settings = await response.json();

        document.getElementById('digestOutputDir').value = settings.digestOutputDir || '~/Documents/Competitive Digests';

        document.getElementById('settingsModal').classList.remove('hidden');
    } catch (error) {
        console.error('Failed to load settings:', error);
        document.getElementById('settingsModal').classList.remove('hidden');
    }
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}

async function handleSettingsSubmit(e) {
    e.preventDefault();

    const settings = {
        digestOutputDir: document.getElementById('digestOutputDir').value.trim()
    };

    try {
        const response = await fetch(`${API_BASE}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        if (!response.ok) {
            throw new Error('Failed to save settings');
        }

        closeSettingsModal();
        alert('Settings saved successfully!');
    } catch (error) {
        console.error('Failed to save settings:', error);
        alert('Failed to save settings: ' + error.message);
    }
}

function dismissGettingStarted() {
    const banner = document.getElementById('gettingStartedBanner');
    banner.classList.add('hidden');
    // Save to localStorage so it stays dismissed
    localStorage.setItem('gettingStartedDismissed', 'true');
}

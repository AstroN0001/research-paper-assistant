document.addEventListener('DOMContentLoaded', () => {
    // ---- Auth Guard ----
    const token = localStorage.getItem('pm_token');
    if (!token) { window.location.href = '/auth.html'; return; }

    fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => { if (r.status === 401) { localStorage.removeItem('pm_token'); localStorage.removeItem('pm_user'); window.location.href = '/auth.html'; return null; } return r.ok ? r.json() : null; })
        .then(data => { if (!data) return; const u = data.user; if ($('userName')) $('userName').textContent = u.name; if ($('userAvatar')) $('userAvatar').textContent = u.name.charAt(0).toUpperCase(); })
        .catch(() => {});

    // ---- Globals ----
    let sessionId = sessionStorage.getItem('sessionId') || (() => { const s = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); sessionStorage.setItem('sessionId', s); return s; })();
    const authHeaders = (extra = {}) => ({ 'Authorization': `Bearer ${token}`, 'x-session-id': sessionId, ...extra });
    const $ = id => document.getElementById(id);

    const chatForm = $('chatForm'), chatInput = $('chatInput'), chatHistory = $('chatHistory');
    const sidebar = $('sidebar'), uploadModal = $('uploadModal'), dropZone = $('dropZone');
    const fileInput = $('pdfFiles'), fileList = $('fileList');
    const progressCircle = $('progressCircle'), progressPercent = $('progressPercent'), progressStatus = $('progressStatus');
    let hasMessages = false, progressInterval, uploadedFiles = [], savedNoteIds = new Set();
    let activeNoteId = null, currentCitations = null, currentFormat = 'apa';

    // ---- Sidebar ----
    const toggleSidebar = (collapse) => {
        sidebar.classList.toggle('collapsed', collapse);
        $('sidebarToggle').classList.toggle('visible', collapse);
        $('sidebarOverlay').classList.toggle('active', !collapse);
    };
    $('sidebarClose').addEventListener('click', () => toggleSidebar(true));
    $('sidebarToggle').addEventListener('click', () => toggleSidebar(false));
    $('sidebarOverlay').addEventListener('click', () => toggleSidebar(true));
    document.querySelector('.main-content').addEventListener('click', () => { if (window.innerWidth <= 768 && !sidebar.classList.contains('collapsed')) toggleSidebar(true); });

    // Sidebar tab switching
    document.querySelectorAll('.sidebar-tab').forEach(tab => tab.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active'); $(tab.dataset.panel).classList.add('active');
    }));

    // ---- Theme ----
    const themeBtn = $('themeToggleBtn'), sunIcon = themeBtn.querySelector('.sun-icon'), moonIcon = themeBtn.querySelector('.moon-icon');
    function setTheme(theme) {
        const isLight = theme === 'light';
        document.documentElement.toggleAttribute('data-theme', false);
        isLight ? document.documentElement.setAttribute('data-theme', 'light') : document.documentElement.removeAttribute('data-theme');
        sunIcon.style.display = isLight ? 'none' : 'block';
        moonIcon.style.display = isLight ? 'block' : 'none';
        localStorage.setItem('pm_theme', theme);
    }
    setTheme(localStorage.getItem('pm_theme') || 'light');
    themeBtn.addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'));

    // ---- Logout ----
    $('logoutBtn').addEventListener('click', () => { localStorage.removeItem('pm_token'); localStorage.removeItem('pm_user'); sessionStorage.removeItem('sessionId'); window.location.href = '/auth.html'; });

    // ---- Drag & Drop ----
    ['dragenter','dragover'].forEach(e => dropZone.addEventListener(e, ev => { ev.preventDefault(); dropZone.classList.add('drag-over'); }));
    ['dragleave','drop'].forEach(e => dropZone.addEventListener(e, ev => { ev.preventDefault(); dropZone.classList.remove('drag-over'); }));
    dropZone.addEventListener('drop', e => { if (e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; fileInput.dispatchEvent(new Event('change')); } });

    // Suggestion Chips
    document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => { chatInput.value = c.dataset.query; chatForm.dispatchEvent(new Event('submit')); }));

    // File list preview
    fileInput.addEventListener('change', () => {
        fileList.innerHTML = '';
        Array.from(fileInput.files).forEach((f, i) => {
            const el = document.createElement('div'); el.className = 'file-item'; el.style.animationDelay = `${i * 0.06}s`;
            el.innerHTML = `<svg class="file-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span class="file-item-name">${f.name}</span><span class="file-item-size">${formatBytes(f.size)}</span>`;
            fileList.appendChild(el);
        });
    });

    // ---- Upload ----
    $('uploadForm').addEventListener('submit', async e => {
        e.preventDefault();
        if (!fileInput.files.length) return showToast('error', 'No files', 'Select at least one PDF.');
        const formData = new FormData();
        Array.from(fileInput.files).forEach(f => formData.append('files', f));
        $('submitBtn').disabled = true; showUploadModal();
        try {
            const res = await fetch('/api/documents/upload', { method: 'POST', headers: authHeaders(), body: formData });
            const data = await res.json(); hideUploadModal();
            if (res.ok) {
                showToast('success', 'Upload Complete', `${data.files.length} file(s) vectorized.`);
                data.files.forEach(f => { if (!uploadedFiles.find(uf => uf.name === f.originalName)) uploadedFiles.push({ name: f.originalName, savedName: f.savedFilename }); });
                renderUploadedDocs(); $('uploadForm').reset(); fileList.innerHTML = '';
                addMsg('System', `✅ ${data.files.length} document(s) ready.`, 'system-message');
            } else if (res.status === 401) { localStorage.removeItem('pm_token'); window.location.href = '/auth.html'; }
            else showToast('error', 'Failed', data.error || 'Upload error.');
        } catch { hideUploadModal(); showToast('error', 'Network Error', 'Server unreachable.'); }
        finally { $('submitBtn').disabled = false; }
    });

    // ---- Chat ----
    chatForm.addEventListener('submit', async e => {
        e.preventDefault();
        const query = chatInput.value.trim(); if (!query) return;
        if (!hasMessages) { hasMessages = true; $('welcomeState').classList.add('hidden'); }
        addMsg('User', query, 'message-user');
        chatInput.value = ''; chatInput.disabled = $('chatSubmitBtn').disabled = true;
        const tid = addMsg('AI', '<div class="thinking-dots"><span></span><span></span><span></span></div>', 'message-ai', true);
        try {
            const res = await fetch('/api/documents/ask', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ query }) });
            const data = await res.json(); removeMsg(tid);
            if (res.ok) addMsg('AI', data.answer, 'message-ai', false, data.sources, query);
            else if (res.status === 401) { localStorage.removeItem('pm_token'); window.location.href = '/auth.html'; }
            else addMsg('Error', data.error || 'An error occurred.', 'error-message');
        } catch { removeMsg(tid); addMsg('Error', 'Network connection failed.', 'error-message'); }
        finally { chatInput.disabled = $('chatSubmitBtn').disabled = false; chatInput.focus(); }
    });

    // ---- Helpers ----
    function formatBytes(b) { if (!+b) return '0 B'; const i = Math.floor(Math.log(b) / Math.log(1024)); return `${(b / Math.pow(1024, i)).toFixed(1)} ${['B','KB','MB','GB'][i]}`; }
    function removeMsg(id) { $(id)?.remove(); }
    function getSourceName(s) { return s?.match(/[^\\/]+$/)?.[0] || s; }

    function renderUploadedDocs() {
        const section = $('uploadedDocsSection'), list = $('uploadedDocsList');
        if (!uploadedFiles.length) { section.style.display = 'none'; return; }
        section.style.display = 'block'; list.innerHTML = '';
        uploadedFiles.forEach((file, i) => {
            const el = document.createElement('div'); el.className = 'uploaded-doc'; el.style.animationDelay = `${i * 0.05}s`;
            el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                <span class="uploaded-doc-name" title="${file.name}">${file.name}</span><span class="uploaded-doc-badge">Ready</span>
                <button class="view-pdf-btn" title="View PDF"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>`;
            el.querySelector('.view-pdf-btn').addEventListener('click', () => openPdf(file.savedName, file.name));
            list.appendChild(el);
        });
    }

    // ---- PDF Viewer ----
    async function openPdf(savedName, originalName) {
        showToast('info', 'Loading PDF...', 'Securing document stream.');
        try {
            const res = await fetch(`/api/documents/view/${savedName}`, { headers: authHeaders() });
            if (!res.ok) throw new Error();
            const url = URL.createObjectURL(await res.blob());
            $('pdfEmbed').src = url; $('pdfViewerTitle').textContent = originalName;
            $('pdfViewerPane').classList.remove('hidden');
        } catch { showToast('error', 'Error', 'Could not open PDF viewer.'); }
    }
    $('pdfViewerClose').addEventListener('click', () => {
        $('pdfViewerPane').classList.add('hidden');
        setTimeout(() => { URL.revokeObjectURL($('pdfEmbed').src); $('pdfEmbed').src = ''; }, 300);
    });

    // ---- Messages ----
    function addMsg(sender, content, cls, isHtml = false, sources = null, query = '') {
        const msg = document.createElement('div');
        const id = 'msg-' + Date.now() + (Math.random() * 1000 | 0);
        msg.className = `message ${cls}`; msg.id = id;
        const div = document.createElement('div'); div.className = 'message-content';
        if (isHtml) div.innerHTML = content;
        else if (sender === 'AI' && typeof marked !== 'undefined') div.innerHTML = marked.parse(content);
        else div.textContent = content;
        msg.appendChild(div);

        // Star button for AI messages
        if (sender === 'AI' && !isHtml) {
            const btn = document.createElement('button'); btn.className = 'save-to-notebook-btn'; btn.title = 'Save to Notebook'; btn.dataset.noteId = '';
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/></svg>`;
            btn.addEventListener('click', () => btn.dataset.noteId ? deleteNote(btn.dataset.noteId) : saveToNotebook(div.innerHTML, sources || [], query, btn));
            msg.appendChild(btn);
        }

        // Source badges
        if (sources?.length) {
            const unique = [...new Set(sources.map(s => s.source))].filter(Boolean);
            if (unique.length) {
                const sc = document.createElement('div'); sc.className = 'sources-container';
                unique.forEach(s => {
                    const name = getSourceName(s);
                    sc.innerHTML += `<span class="source-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><i>${name}</i></span>`;
                    const citeBtn = document.createElement('button'); citeBtn.className = 'cite-btn';
                    citeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>Cite`;
                    citeBtn.addEventListener('click', () => openCitationModal(s, name));
                    sc.appendChild(citeBtn);
                });
                msg.appendChild(sc);
            }
        }
        chatHistory.appendChild(msg);
        document.querySelector('.chat-wrapper').scrollTop = 1e9;
        return id;
    }

    // ---- Toasts ----
    function showToast(type, title, message) {
        const icons = { success: '✓', error: '✕', info: 'ℹ' };
        const t = document.createElement('div'); t.className = `toast toast-${type}`;
        t.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div><button class="toast-close">✕</button>`;
        t.querySelector('.toast-close').addEventListener('click', () => dismiss(t));
        $('toastContainer').appendChild(t);
        setTimeout(() => dismiss(t), 5000);
    }
    function dismiss(t) { if (!t.parentNode) return; t.classList.add('removing'); setTimeout(() => t.remove(), 300); }

    // ---- Upload Modal ----
    function showUploadModal() {
        uploadModal.style.display = 'flex'; let p = 0;
        progressCircle.style.strokeDashoffset = 213.6; progressPercent.textContent = '0%';
        const stages = [[40, 8, 'Uploading files...'], [75, 4, 'Extracting text...'], [92, 2, 'Generating embeddings...'], [100, 0.5, 'Storing vectors...']];
        progressInterval = setInterval(() => {
            const stage = stages.find(s => p < s[0]) || stages[stages.length - 1];
            p = Math.min(p + Math.random() * stage[1], 95);
            progressStatus.textContent = stage[2];
            progressCircle.style.strokeDashoffset = 213.6 - (213.6 * p / 100);
            progressPercent.textContent = `${Math.round(p)}%`;
        }, 200);
    }
    function hideUploadModal() {
        clearInterval(progressInterval);
        progressCircle.style.strokeDashoffset = 0; progressPercent.textContent = '100%'; progressStatus.textContent = 'Complete!';
        setTimeout(() => uploadModal.style.display = 'none', 600);
    }

    // ---- Citation System ----
    $('citationClose').addEventListener('click', () => $('citationModal').style.display = 'none');
    $('citationModal').addEventListener('click', e => { if (e.target === $('citationModal')) $('citationModal').style.display = 'none'; });

    document.querySelectorAll('.citation-tab').forEach(tab => tab.addEventListener('click', () => {
        document.querySelectorAll('.citation-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active'); currentFormat = tab.dataset.format;
        if (currentCitations) $('citationText').innerHTML = (currentCitations[currentFormat] || '').replace(/\*([^*]+)\*/g, '<em>$1</em>');
    }));

    $('citationCopy').addEventListener('click', async () => {
        if (!currentCitations) return;
        try {
            await navigator.clipboard.writeText(currentCitations[currentFormat].replace(/\*/g, ''));
            $('citationCopy').classList.add('copied'); $('citationCopy').querySelector('span').textContent = 'Copied!';
            setTimeout(() => { $('citationCopy').classList.remove('copied'); $('citationCopy').querySelector('span').textContent = 'Copy Citation'; }, 2000);
        } catch { showToast('error', 'Copy Failed', 'Could not copy to clipboard.'); }
    });

    async function openCitationModal(sourceFullPath, displayName) {
        const modal = $('citationModal');
        modal.style.display = 'flex'; $('citationLoading').style.display = 'block'; $('citationContent').style.display = 'none';
        $('citationSource').textContent = displayName; currentCitations = null; currentFormat = 'apa';
        document.querySelectorAll('.citation-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.citation-tab[data-format="apa"]').classList.add('active');
        try {
            const res = await fetch('/api/documents/cite', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ source: sourceFullPath }) });
            const data = await res.json(); if (!res.ok) throw new Error(data.error);
            currentCitations = data.citations; $('citationLoading').style.display = 'none'; $('citationContent').style.display = 'block';
            $('citationText').innerHTML = (currentCitations[currentFormat] || '').replace(/\*([^*]+)\*/g, '<em>$1</em>');
        } catch (err) { modal.style.display = 'none'; showToast('error', 'Citation Error', err.message || 'Failed to generate citation.'); }
    }

    // ---- Notebook System ----
    async function loadNotebook() {
        try {
            const res = await fetch('/api/notebook', { headers: authHeaders() }); if (!res.ok) return;
            const data = await res.json(); savedNoteIds.clear(); data.notes.forEach(n => savedNoteIds.add(n.id));
            renderNotebook(data.notes);
        } catch {}
    }
    loadNotebook();

    function renderNotebook(notes) {
        $('notebookBadge').style.display = notes.length > 0 ? 'inline-flex' : 'none';
        $('notebookBadge').textContent = notes.length;
        $('notebookEmpty').style.display = notes.length === 0 ? 'flex' : 'none';
        $('notebookList').innerHTML = '';
        notes.forEach((note, i) => {
            const card = document.createElement('div'); card.className = 'notebook-card'; card.id = `nc-${note.id}`;
            card.style.animationDelay = `${i * 0.06}s`;
            if (note.id === activeNoteId) card.classList.add('active-card');
            const date = new Date(note.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const srcChips = [...new Set((note.sources || []).map(s => getSourceName(s.source)).filter(Boolean))].slice(0, 2).map(s => `<span class="notebook-src-chip">${s}</span>`).join('');
            card.innerHTML = `<div class="notebook-card-header"><div class="notebook-card-query">${note.query || 'Saved insight'}</div><button class="notebook-card-delete" title="Remove"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="notebook-card-footer"><span class="notebook-card-date">${date}</span><div class="notebook-card-sources">${srcChips}</div></div>`;
            card.addEventListener('click', e => { if (!e.target.closest('.notebook-card-delete')) openNoteView(note); });
            card.querySelector('.notebook-card-delete').addEventListener('click', e => { e.stopPropagation(); deleteNote(note.id); });
            $('notebookList').appendChild(card);
        });
    }

    function openNoteView(note) {
        activeNoteId = note.id;
        $('notebookViewQuery').textContent = note.query || 'Saved insight';
        $('notebookViewDate').textContent = new Date(note.savedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        $('notebookViewContent').innerHTML = note.content;
        const srcNames = [...new Set((note.sources || []).map(s => getSourceName(s.source)).filter(Boolean))];
        $('notebookViewSources').innerHTML = srcNames.length ? srcNames.map(s => `<span class="notebook-view-src-chip">${s}</span>`).join('') : '';
        $('notebookViewDelete').onclick = () => deleteNote(note.id, true);
        $('notebookView').classList.remove('hidden'); document.querySelector('.main-content').classList.add('notebook-open');
        document.querySelectorAll('.notebook-card').forEach(c => c.classList.toggle('active-card', c.id === `nc-${note.id}`));
    }

    function closeNoteView() {
        activeNoteId = null; $('notebookView').classList.add('hidden');
        document.querySelector('.main-content').classList.remove('notebook-open');
        document.querySelectorAll('.notebook-card').forEach(c => c.classList.remove('active-card'));
    }
    $('notebookBackBtn').addEventListener('click', closeNoteView);

    async function deleteNote(id, fromView = false) {
        try {
            const res = await fetch(`/api/notebook/${id}`, { method: 'DELETE', headers: authHeaders() }); if (!res.ok) throw new Error();
            savedNoteIds.delete(id);
            const starBtn = document.querySelector(`.save-to-notebook-btn[data-note-id="${id}"]`);
            if (starBtn) { starBtn.classList.remove('saved'); starBtn.dataset.noteId = ''; }
            if (fromView || id === activeNoteId) closeNoteView();
            await loadNotebook(); showToast('info', 'Removed', 'Insight removed from notebook.');
        } catch { showToast('error', 'Error', 'Could not delete note.'); }
    }

    async function saveToNotebook(content, sources, query, starBtn) {
        try {
            starBtn.disabled = true;
            const res = await fetch('/api/notebook', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ content, sources, query }) });
            const data = await res.json(); if (!res.ok) throw new Error(data.error);
            savedNoteIds.add(data.note.id); starBtn.classList.add('saved', 'star-pop'); starBtn.dataset.noteId = data.note.id;
            setTimeout(() => starBtn.classList.remove('star-pop'), 300);
            await loadNotebook(); showToast('success', 'Saved!', 'Insight added to your Notebook.');
        } catch { showToast('error', 'Error', 'Could not save to notebook.'); }
        finally { starBtn.disabled = false; }
    }
});

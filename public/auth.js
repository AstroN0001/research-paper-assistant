document.addEventListener('DOMContentLoaded', () => {
    // If already logged in, go straight to the app
    if (localStorage.getItem('pm_token')) {
        window.location.href = '/';
        return;
    }

    // Apply Theme
    const savedTheme = localStorage.getItem('pm_theme');
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else if (savedTheme === 'dark') {
        document.documentElement.removeAttribute('data-theme');
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        document.documentElement.setAttribute('data-theme', 'light');
    }

    const $ = id => document.getElementById(id);

    // Elements
    const loginTab = $('loginTab'), signupTab = $('signupTab');
    const loginForm = $('loginForm'), signupForm = $('signupForm');
    const loginError = $('loginError'), signupError = $('signupError');
    const loginBtn = $('loginBtn'), signupBtn = $('signupBtn');
    const strengthFill = $('strengthFill'), strengthText = $('strengthText');
    const tabSwitcher = document.querySelector('.tab-switcher');

    // ---- Tab Switching ----
    loginTab.addEventListener('click', () => switchTab('login'));
    signupTab.addEventListener('click', () => switchTab('signup'));

    function switchTab(tab) {
        loginTab.classList.toggle('active', tab === 'login');
        signupTab.classList.toggle('active', tab === 'signup');
        loginForm.classList.toggle('active', tab === 'login');
        signupForm.classList.toggle('active', tab === 'signup');
        tabSwitcher.classList.toggle('signup', tab === 'signup');
        hideError(loginError); hideError(signupError);
    }

    // ---- Password Visibility Toggle ----
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = $(btn.dataset.target);
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.querySelector('.eye-open').style.display = isPassword ? 'none' : 'block';
            btn.querySelector('.eye-closed').style.display = isPassword ? 'block' : 'none';
        });
    });

    // ---- Password Strength Meter ----
    $('signupPassword').addEventListener('input', e => {
        const val = e.target.value;
        let score = 0;
        if (val.length >= 8) score++;
        if (/[a-z]/.test(val) && /[A-Z]/.test(val)) score++;
        if (/\d/.test(val)) score++;
        if (/[^a-zA-Z0-9]/.test(val)) score++;

        const levels = [
            { w: '0%', c: 'transparent', t: '' },
            { w: '25%', c: '#f87171', t: 'Weak' },
            { w: '50%', c: '#fbbf24', t: 'Fair' },
            { w: '75%', c: '#60a5fa', t: 'Good' },
            { w: '100%', c: '#34d399', t: 'Strong' }
        ];
        const l = levels[score];
        strengthFill.style.width = l.w;
        strengthFill.style.background = l.c;
        strengthText.textContent = l.t;
        strengthText.style.color = l.c;
    });

    // ---- Login ----
    loginForm.addEventListener('submit', async e => {
        e.preventDefault();
        hideError(loginError);
        const email = $('loginEmail').value.trim();
        const password = $('loginPassword').value;

        if (!email || !password) return showError(loginError, 'Please fill in all fields.');

        setLoading(loginBtn, true);
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) return showError(loginError, data.error);

            // Store token & user info, redirect
            localStorage.setItem('pm_token', data.token);
            localStorage.setItem('pm_user', JSON.stringify(data.user));
            window.location.href = '/';
        } catch {
            showError(loginError, 'Network error. Is the server running?');
        } finally {
            setLoading(loginBtn, false);
        }
    });

    // ---- Signup ----
    signupForm.addEventListener('submit', async e => {
        e.preventDefault();
        hideError(signupError);
        const name = $('signupName').value.trim();
        const email = $('signupEmail').value.trim();
        const password = $('signupPassword').value;

        if (!name || !email || !password) return showError(signupError, 'Please fill in all fields.');
        if (!email.endsWith('@nitkkr.ac.in')) return showError(signupError, 'Only @nitkkr.ac.in emails are allowed.');
        if (password.length < 8) return showError(signupError, 'Password must be at least 8 characters.');

        setLoading(signupBtn, true);
        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            const data = await res.json();
            if (!res.ok) return showError(signupError, data.error);

            localStorage.setItem('pm_token', data.token);
            localStorage.setItem('pm_user', JSON.stringify(data.user));
            window.location.href = '/';
        } catch {
            showError(signupError, 'Network error. Is the server running?');
        } finally {
            setLoading(signupBtn, false);
        }
    });

    // ---- Helpers ----
    function showError(el, msg) { el.textContent = msg; el.classList.add('visible'); }
    function hideError(el) { el.classList.remove('visible'); }
    function setLoading(btn, loading) {
        btn.disabled = loading;
        const span = btn.querySelector('span');
        if (loading) {
            span.dataset.original = span.textContent;
            span.textContent = 'Please wait...';
        } else {
            span.textContent = span.dataset.original || span.textContent;
        }
    }
});

import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the JSON "database" for users
const USERS_FILE = path.join(__dirname, '../../data/users.json');

// JWT config — read lazily inside functions to avoid ESM import hoisting issues with dotenv
const JWT_EXPIRES_IN = '7d';
function getJWTSecret() { return process.env.JWT_SECRET || 'papermind_secret_key_2026'; }

// Allowed email domain
const ALLOWED_DOMAIN = 'nitkkr.ac.in';

// ---- Utility: Read / Write Users File ----
function readUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
            fs.writeFileSync(USERS_FILE, '[]', 'utf-8');
        }
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch {
        return [];
    }
}

function writeUsers(users) {
    fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

// ---- Validation Helpers ----
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function isAllowedDomain(email) {
    return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

function validatePassword(password) {
    // Minimum 8 chars, at least one letter and one number
    return password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

// =============================================
// POST /api/auth/register
// =============================================
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // --- Validation ---
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const trimmedName = name.trim();
        const trimmedEmail = email.trim().toLowerCase();

        if (trimmedName.length < 2) {
            return res.status(400).json({ error: 'Name must be at least 2 characters.' });
        }

        if (!validateEmail(trimmedEmail)) {
            return res.status(400).json({ error: 'Please enter a valid email address.' });
        }

        if (!isAllowedDomain(trimmedEmail)) {
            return res.status(403).json({ error: `Only @${ALLOWED_DOMAIN} email addresses are allowed to register.` });
        }

        if (!validatePassword(password)) {
            return res.status(400).json({ error: 'Password must be at least 8 characters with at least one letter and one number.' });
        }

        // --- Check for duplicates ---
        const users = readUsers();
        const existingUser = users.find(u => u.email === trimmedEmail);
        if (existingUser) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        // --- Hash password & save ---
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = {
            id: 'user_' + Date.now(),
            name: trimmedName,
            email: trimmedEmail,
            password: hashedPassword,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        writeUsers(users);

        // --- Issue JWT ---
        const token = jwt.sign(
            { id: newUser.id, name: newUser.name, email: newUser.email },
            getJWTSecret(),
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.status(201).json({
            message: 'Account created successfully!',
            token,
            user: { id: newUser.id, name: newUser.name, email: newUser.email }
        });

    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

// =============================================
// POST /api/auth/login
// =============================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const trimmedEmail = email.trim().toLowerCase();

        if (!validateEmail(trimmedEmail)) {
            return res.status(400).json({ error: 'Please enter a valid email address.' });
        }

        // --- Find user ---
        const users = readUsers();
        const user = users.find(u => u.email === trimmedEmail);

        if (!user) {
            // Generic message to prevent email enumeration
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // --- Verify password ---
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // --- Issue JWT ---
        const token = jwt.sign(
            { id: user.id, name: user.name, email: user.email },
            getJWTSecret(),
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.json({
            message: 'Login successful!',
            token,
            user: { id: user.id, name: user.name, email: user.email }
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// =============================================
// GET /api/auth/me — Verify token & get user info
// =============================================
router.get('/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, getJWTSecret());
        res.json({ user: { id: decoded.id, name: decoded.name, email: decoded.email } });
    } catch {
        res.status(401).json({ error: 'Invalid or expired token.' });
    }
});

export default router;

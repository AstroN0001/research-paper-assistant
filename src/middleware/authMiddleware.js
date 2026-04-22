import jwt from 'jsonwebtoken';

/**
 * Express middleware to protect routes behind JWT authentication.
 * Expects: Authorization: Bearer <token>
 * Attaches decoded user payload to req.user on success.
 */
export function requireAuth(req, res, next) {
    const JWT_SECRET = process.env.JWT_SECRET || 'papermind_secret_key_2026';
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Session expired. Please log in again.' });
        }
        return res.status(401).json({ error: 'Invalid token. Please log in again.' });
    }
}

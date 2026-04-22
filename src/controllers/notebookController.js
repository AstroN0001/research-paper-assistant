import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NOTEBOOKS_DIR = path.join(__dirname, '../../data/notebooks');

function getUserNotebookPath(userId) {
    fs.mkdirSync(NOTEBOOKS_DIR, { recursive: true });
    return path.join(NOTEBOOKS_DIR, `${userId}.json`);
}

function readNotes(userId) {
    const file = getUserNotebookPath(userId);
    if (!fs.existsSync(file)) return [];
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return []; }
}

function writeNotes(userId, notes) {
    fs.writeFileSync(getUserNotebookPath(userId), JSON.stringify(notes, null, 2), 'utf-8');
}

// GET /api/notebook — fetch all saved notes for the logged-in user
export const getNotes = (req, res) => {
    const notes = readNotes(req.user.id);
    res.json({ notes });
};

// POST /api/notebook — save a new note
export const saveNote = (req, res) => {
    const { content, sources, query } = req.body;
    if (!content) return res.status(400).json({ error: 'Note content is required.' });

    const notes = readNotes(req.user.id);
    const note = {
        id: 'note_' + Date.now(),
        content,
        sources: sources || [],
        query: query || '',
        savedAt: new Date().toISOString()
    };
    notes.unshift(note); // newest first
    writeNotes(req.user.id, notes);
    res.status(201).json({ message: 'Note saved.', note });
};

// DELETE /api/notebook/:id — remove a single note
export const deleteNote = (req, res) => {
    const { id } = req.params;
    let notes = readNotes(req.user.id);
    const before = notes.length;
    notes = notes.filter(n => n.id !== id);
    if (notes.length === before) return res.status(404).json({ error: 'Note not found.' });
    writeNotes(req.user.id, notes);
    res.json({ message: 'Note deleted.' });
};

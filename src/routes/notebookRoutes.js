import express from 'express';
import { getNotes, saveNote, deleteNote } from '../controllers/notebookController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// All notebook routes require auth
router.use(requireAuth);

router.get('/', getNotes);
router.post('/', saveNote);
router.delete('/:id', deleteNote);

export default router;

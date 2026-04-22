import express from 'express';
import { uploadDocuments, askDocument, getCitation, viewDocument } from '../controllers/documentController.js';
import uploadMiddleware from '../middleware/uploadMiddleware.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// All document routes are protected — must have valid JWT
router.use(requireAuth);

// Route for uploading massive arrays of PDF files
router.post('/upload', uploadMiddleware.array('files', 50), uploadDocuments);

// Route for asking strict conversational QA queries
router.post('/ask', askDocument);

// Route for generating academic citations
router.post('/cite', getCitation);

// Route for viewing/downloading the raw PDF file
router.get('/view/:filename', viewDocument);

export default router;

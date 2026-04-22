import { processAndStorePDFs, askQuestion, generateCitation } from '../services/langchainService.js';
import fs from 'fs';

export const uploadDocuments = async (req, res) => {
  try {
    // 1. Check if multer successfully parsed any files
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files were uploaded.' });
    }

    // Extract basic metadata for response validation
    const uploadedFiles = req.files.map(file => ({
      originalName: file.originalname,
      savedFilename: file.filename,
      filePath: file.path,
      size: file.size,
      mimetype: file.mimetype
    }));

    // 2. Map absolute/relative file paths to pass to LangChain PDFLoader
    const filePaths = req.files.map(file => file.path);

    // 3. Hand off to the core LangChain/Gemini service
    try {
      const sessionId = req.headers['x-session-id'] || 'default_session';
      await processAndStorePDFs(filePaths, sessionId);
      
      // Note: Auto-cleanup removed to permanently store PDFs for split-screen viewing
      // Files are preserved in the uploads/ directory.
    } catch (llmError) {
      console.error('RAG Vectorization Failed:', llmError);

      // We no longer fallback delete files, as they should be retained.

      return res.status(500).json({ 
        error: 'Vectorization failed. You may have hit a temporary API rate limit with Google. Please try again.',
        details: llmError.message
      });
    }

    // 4. Send comprehensive success response
    return res.status(200).json({
      message: 'Files successfully uploaded and processed into the Gemini AI vector space.',
      files: uploadedFiles,
      vectorized: true
    });
    
  } catch (error) {
    console.error('Express Upload Error:', error);
    return res.status(500).json({ error: 'Failed to complete file upload and processing.' });
  }
};

export const askDocument = async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return res.status(400).json({ error: 'Please provide a valid query string in the request body.' });
    }

    // Intercept with our LangChain / Gemini Chat Model
    const sessionId = req.headers['x-session-id'] || 'default_session';
    const result = await askQuestion(query, sessionId);

    return res.status(200).json({
      message: 'Query processed successfully',
      answer: result.answer,
      sources: result.sources
    });

  } catch (error) {
    console.error('Ask Endpoint Error:', error);
    
    // Explicitly bubble up the missing memory vector store exception so UI can guide the user
    if (error.message === "Please upload documents first.") {
      return res.status(400).json({ error: error.message });
    }
    
    return res.status(500).json({ error: 'An unexpected error occurred while communicating with the AI. Check connection and keys.' });
  }
};

export const getCitation = async (req, res) => {
  try {
    const { source } = req.body;

    if (!source || typeof source !== 'string') {
      return res.status(400).json({ error: 'Please provide a valid source filename.' });
    }

    const sessionId = req.headers['x-session-id'] || 'default_session';
    const result = await generateCitation(sessionId, source);

    return res.status(200).json({
      message: 'Citation generated successfully',
      metadata: result.metadata,
      citations: result.citations
    });

  } catch (error) {
    console.error('Citation Endpoint Error:', error);

    if (error.message.includes('upload documents') || error.message.includes('not found')) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to generate citation. Please try again.' });
  }
};

export const viewDocument = async (req, res) => {
  try {
    const filename = req.params.filename;
    // Validate filename structure to prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const { fileURLToPath } = await import('url');
    const path = await import('path');
    const fs = await import('fs');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const filePath = path.join(__dirname, '..', '..', 'uploads', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Document not found or has been deleted.' });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Express View Doc Error:', error);
    res.status(500).json({ error: 'Failed to retrieve document.' });
  }
};

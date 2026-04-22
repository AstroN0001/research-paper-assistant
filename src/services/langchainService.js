import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Session-scoped robust persistence layer implementation
const DATA_DIR = './data/vectors';
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const HISTORY_DIR = './data/history';
if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

/**
 * Processes PDF files, breaks them into overlapping text chunks,
 * generates Google Gemini embeddings, and caches them in memory.
 * 
 * @param {string[]} filePaths - Array of file paths to uploaded PDFs.
 * @returns {Promise<MemoryVectorStore>} - The populated in-memory vector store.
 */
export const processAndStorePDFs = async (filePaths, sessionId = 'default_session') => {
  try {
    if (!filePaths || filePaths.length === 0) {
      throw new Error("No file paths provided for processing.");
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_api_key_here') {
      throw new Error("Valid GEMINI_API_KEY environment variable is missing.");
    }

    const allDocs = [];

    // 1. Load and extract text from each PDF sequentially
    for (const filePath of filePaths) {
      try {
        const loader = new PDFLoader(filePath);
        const docs = await loader.load();
        allDocs.push(...docs);
      } catch (err) {
        console.error(`Failed to load PDF at ${filePath}:`, err);
        throw new Error(`PDF Load Error: ${filePath}`);
      }
    }

    // 2. Split extracted text into logical, overlapping chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const splitDocs = await textSplitter.splitDocuments(allDocs);

    // 3. Configure Gemini Embeddings model (text-embedding-004 is recommended)
    const embeddings = new GoogleGenerativeAIEmbeddings({
      model: "gemini-embedding-001",
    });

    // 4. Generate embeddings for the chunks and store them in memory
    const vectorStore = await MemoryVectorStore.fromDocuments(
      splitDocs,
      embeddings
    );

    // Serialize cleanly to disk isolating this to the browser's Session UUID
    const cacheFile = path.join(DATA_DIR, `${sessionId}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(vectorStore.memoryVectors));

    console.log(`Successfully embedded ${splitDocs.length} chunks into MemoryVectorStore.`);
    return vectorStore;

  } catch (error) {
    console.error("Vector Processing Engine Error:", error);
    throw error;
  }
};

/**
 * Performs a similarity search over the global vector store and queries
 * the Gemini LLM with the retrieved context to answer a user's question.
 * 
 * @param {string} query - The user's typed question.
 * @returns {Promise<Object>} - Object containing { answer: string, sources: array }
 */
export const askQuestion = async (query, sessionId = 'default_session') => {
  try {
    // Prevent querying if no offline disk vector cache has been generated for this session
    const cacheFile = path.join(DATA_DIR, `${sessionId}.json`);
    if (!fs.existsSync(cacheFile)) {
      throw new Error("Please upload documents first.");
    }

    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
      throw new Error("Valid GROQ_API_KEY environment variable is missing. Please add it to your .env file.");
    }

    // Instantly hydrate persistent vectors from disk directly into memory seamlessly
    const embeddings = new GoogleGenerativeAIEmbeddings({ model: "gemini-embedding-001" });
    const globalVectorStore = new MemoryVectorStore(embeddings);
    globalVectorStore.memoryVectors = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));

    // 1. Perform similarity search to extract a broad range of relevant chunks
    // Fetching 12 chunks (instead of 4) is crucial when dealing with a large corpus of multiple PDFs
    const relevantDocs = await globalVectorStore.similaritySearch(query, 12);

    // 2. Format the context string and collect source metadata
    const context = relevantDocs.map((doc) => `--- Source: ${doc.metadata.source || "Document"} ---\n${doc.pageContent}`).join('\n\n');
    const sources = relevantDocs.map(doc => doc.metadata);

    // 3. Initialize Groq Chat Model emphasizing zero temperature for factual grounding
    const llm = new ChatGroq({
      model: "llama-3.3-70b-versatile", // Current generation highly capable Llama 3.3 model
      temperature: 0,
      maxRetries: 1,
    });

    // 4. Construct an intelligent system prompt forcing the LLM to rely on context but allowing deductive reasoning
    const prompt = `
You are an intelligent and expert Research Paper Assistant.
Answer the user's question comprehensively by synthesizing information across the provided Document Context extracts below.
- Draw logical connections. If the user asks about a term but the papers use related terminology, deduce the relationship naturally.
- DO NOT reference internal system formatting like "According to Chunk 1" or "Source:...". Instead, weave the knowledge naturally into your explanation.
- If the answer absolutely cannot be logically inferred from the context, state that you don't know rather than hallucinating external facts.

You have access to the user's conversation history mathematically. Respond fluidly.

Document Context:
${context}
`;

    // 5. Fetch Session Chat History
    const historyFile = path.join(HISTORY_DIR, `${sessionId}.json`);
    let chatHistory = [];
    if (fs.existsSync(historyFile)) {
        chatHistory = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    }

    // 6. Build the message array with Short-Term Memory
    const messages = [
        ["system", prompt],
        ...chatHistory,
        ["human", query]
    ];

    // 7. Query the LLM holistically
    const response = await llm.invoke(messages);

    // 8. Commit interaction to persistent Short-Term Memory
    chatHistory.push(["human", query]);
    chatHistory.push(["ai", response.content]);
    fs.writeFileSync(historyFile, JSON.stringify(chatHistory));

    // Format successful output
    return {
      answer: response.content,
      sources: sources
    };

  } catch (error) {
    console.error("Question Synthesis Error:", error);
    throw error;
  }
};

/**
 * Generates academic citations for a specific source PDF by extracting
 * metadata from its vectorized content using LLM intelligence.
 *
 * @param {string} sessionId - The user's session ID
 * @param {string} sourceFilename - The source filename to cite (from metadata)
 * @returns {Promise<Object>} - { metadata, citations: { apa, mla, ieee, chicago } }
 */
export const generateCitation = async (sessionId, sourceFilename) => {
  try {
    const cacheFile = path.join(DATA_DIR, `${sessionId}.json`);
    if (!fs.existsSync(cacheFile)) {
      throw new Error("No documents found. Please upload documents first.");
    }

    // Hydrate vectors and filter to chunks from this specific source
    const embeddings = new GoogleGenerativeAIEmbeddings({ model: "gemini-embedding-001" });
    const vectorStore = new MemoryVectorStore(embeddings);
    vectorStore.memoryVectors = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));

    // Filter chunks that match this source filename
    const allVectors = vectorStore.memoryVectors;
    const matchingChunks = allVectors.filter(v => {
      const src = v.metadata?.source || '';
      return src.includes(sourceFilename) || src.endsWith(sourceFilename);
    });

    if (!matchingChunks.length) {
      throw new Error("Source document not found in vector store.");
    }

    // Take the first few chunks (likely first pages with metadata)
    const contextChunks = matchingChunks.slice(0, 5).map(v => v.content).join('\n\n');

    const llm = new ChatGroq({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      maxRetries: 2,
    });

    const prompt = `You are an academic citation extraction expert. Analyze the following text content from the FIRST PAGES of a research paper and extract the metadata needed for citations.

Text from paper:
${contextChunks}

You MUST respond in EXACTLY this JSON format and nothing else — no markdown fences, no explanation, just pure JSON:
{
  "title": "Full paper title",
  "authors": ["Author One", "Author Two"],
  "year": "2024",
  "journal": "Journal or Conference Name (or empty string if not found)",
  "volume": "Volume number (or empty string)",
  "issue": "Issue number (or empty string)",
  "pages": "Page range like 1-15 (or empty string)",
  "doi": "DOI if found (or empty string)",
  "publisher": "Publisher name (or empty string)",
  "url": "URL if found (or empty string)"
}

Rules:
- Extract REAL metadata strictly from the text. Do NOT invent or hallucinate.
- If a field is not found, use an empty string "".
- Authors should be full names like "John Smith", not abbreviations.
- The year should be the publication year, not the current year.`;

    const response = await llm.invoke([["human", prompt]]);

    // Parse the JSON response
    let metadata;
    try {
      // Clean potential markdown fences
      const cleaned = response.content.replace(/```json\n?|\n?```/g, '').trim();
      metadata = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse citation metadata:", response.content);
      throw new Error("Could not extract citation metadata from this document.");
    }

    // Generate formatted citations from the extracted metadata
    const citations = formatCitations(metadata);

    return { metadata, citations };

  } catch (error) {
    console.error("Citation Generation Error:", error);
    throw error;
  }
};

/**
 * Formats extracted metadata into APA, MLA, IEEE, and Chicago citation styles.
 */
function formatCitations(m) {
  const authors = m.authors || [];
  const title = m.title || 'Untitled';
  const year = m.year || 'n.d.';
  const journal = m.journal || '';
  const volume = m.volume || '';
  const issue = m.issue || '';
  const pages = m.pages || '';
  const doi = m.doi || '';

  // --- APA 7th Edition ---
  let apaAuthors = '';
  if (authors.length === 1) {
    const parts = authors[0].split(' ');
    apaAuthors = `${parts[parts.length - 1]}, ${parts.slice(0, -1).map(n => n[0] + '.').join(' ')}`;
  } else if (authors.length === 2) {
    apaAuthors = authors.map(a => {
      const p = a.split(' ');
      return `${p[p.length - 1]}, ${p.slice(0, -1).map(n => n[0] + '.').join(' ')}`;
    }).join(' & ');
  } else if (authors.length > 2) {
    const p = authors[0].split(' ');
    apaAuthors = `${p[p.length - 1]}, ${p.slice(0, -1).map(n => n[0] + '.').join(' ')} et al.`;
  }
  let apa = `${apaAuthors} (${year}). ${title}.`;
  if (journal) {
    apa += ` *${journal}*`;
    if (volume) apa += `, *${volume}*`;
    if (issue) apa += `(${issue})`;
    if (pages) apa += `, ${pages}`;
    apa += '.';
  }
  if (doi) apa += ` https://doi.org/${doi.replace(/^https?:\/\/doi\.org\//, '')}`;

  // --- MLA 9th Edition ---
  let mlaAuthors = '';
  if (authors.length === 1) mlaAuthors = (() => { const p = authors[0].split(' '); return `${p[p.length - 1]}, ${p.slice(0, -1).join(' ')}`; })();
  else if (authors.length === 2) mlaAuthors = (() => { const p1 = authors[0].split(' '); return `${p1[p1.length - 1]}, ${p1.slice(0, -1).join(' ')}, and ${authors[1]}`; })();
  else if (authors.length > 2) mlaAuthors = (() => { const p1 = authors[0].split(' '); return `${p1[p1.length - 1]}, ${p1.slice(0, -1).join(' ')}, et al.`; })();
  let mla = `${mlaAuthors}. "${title}."`;
  if (journal) {
    mla += ` *${journal}*`;
    if (volume) mla += `, vol. ${volume}`;
    if (issue) mla += `, no. ${issue}`;
    mla += `, ${year}`;
    if (pages) mla += `, pp. ${pages}`;
    mla += '.';
  }
  if (doi) mla += ` https://doi.org/${doi.replace(/^https?:\/\/doi\.org\//, '')}`;

  // --- IEEE ---
  let ieeeAuthors = authors.map(a => {
    const p = a.split(' ');
    return `${p.slice(0, -1).map(n => n[0] + '.').join(' ')} ${p[p.length - 1]}`;
  }).join(', ');
  if (authors.length > 1) {
    const last = ieeeAuthors.lastIndexOf(', ');
    if (last !== -1) ieeeAuthors = ieeeAuthors.substring(0, last) + ' and ' + ieeeAuthors.substring(last + 2);
  }
  let ieee = `${ieeeAuthors}, "${title},"`;
  if (journal) {
    ieee += ` *${journal}*`;
    if (volume) ieee += `, vol. ${volume}`;
    if (issue) ieee += `, no. ${issue}`;
    if (pages) ieee += `, pp. ${pages}`;
    ieee += `, ${year}`;
    ieee += '.';
  }
  if (doi) ieee += ` doi: ${doi.replace(/^https?:\/\/doi\.org\//, '')}`;

  // --- Chicago 17th ---
  let chicagoAuthors = '';
  if (authors.length === 1) chicagoAuthors = (() => { const p = authors[0].split(' '); return `${p[p.length - 1]}, ${p.slice(0, -1).join(' ')}`; })();
  else if (authors.length === 2) chicagoAuthors = (() => { const p1 = authors[0].split(' '); return `${p1[p1.length - 1]}, ${p1.slice(0, -1).join(' ')}, and ${authors[1]}`; })();
  else if (authors.length > 2) chicagoAuthors = (() => { const p1 = authors[0].split(' '); return `${p1[p1.length - 1]}, ${p1.slice(0, -1).join(' ')}, et al.`; })();
  let chicago = `${chicagoAuthors}. "${title}."`;
  if (journal) {
    chicago += ` *${journal}*`;
    if (volume) chicago += ` ${volume}`;
    if (issue) chicago += `, no. ${issue}`;
    chicago += ` (${year})`;
    if (pages) chicago += `: ${pages}`;
    chicago += '.';
  }
  if (doi) chicago += ` https://doi.org/${doi.replace(/^https?:\/\/doi\.org\//, '')}`;

  return { apa, mla, ieee, chicago };
}

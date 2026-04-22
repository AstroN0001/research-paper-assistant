<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/LangChain.js-RAG-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white" />
  <img src="https://img.shields.io/badge/Gemini-Embeddings-4285F4?style=for-the-badge&logo=google&logoColor=white" />
  <img src="https://img.shields.io/badge/Groq-Llama_3.3-F55036?style=for-the-badge&logo=groq&logoColor=white" />
  <img src="https://img.shields.io/badge/Render-Deployed-46E3B7?style=for-the-badge&logo=render&logoColor=white" />
</p>

# 📚 PaperMind — AI Research Paper Assistant

An intelligent **Retrieval-Augmented Generation (RAG)** web application that lets researchers upload academic papers and have natural, context-aware conversations about their content. Built with LangChain.js, Google Gemini embeddings, and Groq's Llama 3.3 70B model.

> Upload PDFs → AI reads & indexes them → Ask anything → Get cited answers

---

## ✨ Features

| Feature | Description |
|---|---|
| 📄 **Multi-PDF Upload** | Drag & drop or browse to upload multiple research papers simultaneously |
| 🧠 **RAG Pipeline** | Documents are chunked, embedded, and stored in a vector database for semantic retrieval |
| 💬 **Conversational AI** | Ask follow-up questions with full chat history context |
| 📑 **Auto-Citations** | Generate APA, MLA, IEEE, and Chicago citations by extracting metadata from papers |
| 📖 **Split-Screen PDF Viewer** | Read your uploaded papers side-by-side with the AI chat |
| ⭐ **Notebook System** | Save important AI insights to a personal notebook for later review |
| 🔐 **JWT Authentication** | Secure user accounts with bcrypt password hashing and JWT tokens |
| 🌗 **Dark / Light Theme** | Toggle between themes with system preference auto-detection |
| 📱 **Responsive Design** | Works across desktop, tablet, and mobile viewports |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      FRONTEND                           │
│  Vanilla HTML/CSS/JS  •  Marked.js (Markdown)           │
│  Dark/Light Themes    •  Split-Screen PDF Viewer         │
└────────────────────────┬────────────────────────────────┘
                         │ REST API (fetch)
┌────────────────────────▼────────────────────────────────┐
│                   EXPRESS SERVER                         │
│  Routes: /api/auth  •  /api/documents  •  /api/notebook  │
│  Middleware: JWT Auth  •  Multer (PDF uploads)            │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│               RAG PIPELINE (LangChain.js)                │
│                                                          │
│  1. PDF Loading ──► langchain/PDFLoader                  │
│  2. Text Splitting ──► RecursiveCharacterTextSplitter    │
│     (chunk_size=1000, overlap=200)                       │
│  3. Embeddings ──► Google Gemini (gemini-embedding-001)  │
│  4. Vector Store ──► MemoryVectorStore (serialized JSON) │
│  5. Retrieval ──► Similarity Search (top-12 chunks)      │
│  6. Generation ──► Groq Llama 3.3 70B (temp=0)          │
└─────────────────────────────────────────────────────────┘
```

### How the RAG Pipeline Works

1. **Document Ingestion** — Uploaded PDFs are parsed using LangChain's `PDFLoader` to extract raw text
2. **Chunking** — Text is split into overlapping 1000-character chunks (200-char overlap) using `RecursiveCharacterTextSplitter` to preserve context across boundaries
3. **Embedding** — Each chunk is converted to a 768-dimensional vector using Google's `gemini-embedding-001` model
4. **Storage** — Vectors are stored in a `MemoryVectorStore` and serialized to disk as JSON for session persistence
5. **Retrieval** — When a user asks a question, the query is embedded and the 12 most semantically similar chunks are retrieved via cosine similarity
6. **Generation** — Retrieved chunks are injected as context into a system prompt, along with chat history, and sent to Groq's Llama 3.3 70B model for answer synthesis

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | HTML, CSS, JavaScript | UI with responsive design and micro-animations |
| **Markdown Rendering** | Marked.js | Renders AI responses as formatted Markdown |
| **Backend** | Node.js + Express | REST API server |
| **Authentication** | JWT + bcryptjs | Stateless auth with hashed passwords |
| **File Handling** | Multer | Multi-file PDF upload middleware |
| **RAG Framework** | LangChain.js | Document loading, chunking, retrieval chain |
| **Embeddings** | Google Gemini (`gemini-embedding-001`) | Semantic vector representations |
| **LLM** | Groq (`llama-3.3-70b-versatile`) | Fast inference for answer generation |
| **Vector Store** | LangChain MemoryVectorStore | In-memory similarity search with disk persistence |
| **Deployment** | Render | Cloud hosting for Node.js web services |

---

## 📁 Project Structure

```
research-paper-assistant/
├── public/                    # Frontend (served as static files)
│   ├── index.html             # Main app — chat, sidebar, PDF viewer
│   ├── style.css              # Design system with dark/light themes
│   ├── app.js                 # Client-side logic (chat, upload, notebook)
│   ├── auth.html              # Login / Signup page
│   ├── auth.css               # Auth page styles
│   └── auth.js                # Auth form handling & validation
├── src/
│   ├── controllers/
│   │   ├── documentController.js   # Upload, ask, cite, view endpoints
│   │   └── notebookController.js   # Save/delete/list notebook entries
│   ├── middleware/
│   │   ├── authMiddleware.js       # JWT token verification
│   │   └── uploadMiddleware.js     # Multer config for PDF uploads
│   ├── routes/
│   │   ├── authRoutes.js           # POST /register, /login, GET /me
│   │   ├── documentRoutes.js       # POST /upload, /ask, /cite
│   │   └── notebookRoutes.js       # GET/POST/DELETE /notebook
│   └── services/
│       └── langchainService.js     # Core RAG pipeline logic
├── data/                      # Runtime data (gitignored)
│   ├── vectors/               # Serialized vector stores per session
│   ├── history/               # Chat history per session
│   └── notebooks/             # Saved notebook entries per user
├── uploads/                   # Uploaded PDFs (gitignored)
├── server.js                  # Express app entry point
├── package.json
├── .env.example               # Required environment variables
└── .npmrc                     # Dependency resolution config
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18 or higher
- **Google AI API Key** — [Get one here](https://aistudio.google.com/apikey)
- **Groq API Key** — [Get one here](https://console.groq.com/keys)

### Installation

```bash
# Clone the repository
git clone https://github.com/AstroN0001/research-paper-assistant.git
cd research-paper-assistant

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your API keys

# Start the development server
npm run dev
```

The app will be running at `http://localhost:3000`

### Environment Variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio API key for embeddings |
| `GOOGLE_API_KEY` | Same as GEMINI_API_KEY (used by LangChain) |
| `GROQ_API_KEY` | Groq API key for Llama 3.3 chat model |
| `JWT_SECRET` | Secret string for signing JWT tokens |
| `PORT` | Server port (default: 3000) |

---

## 📡 API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | ❌ | Create a new user account |
| `POST` | `/api/auth/login` | ❌ | Login and receive JWT |
| `GET` | `/api/auth/me` | ✅ | Get current user info |
| `POST` | `/api/documents/upload` | ✅ | Upload & vectorize PDFs |
| `POST` | `/api/documents/ask` | ✅ | Ask a question about uploaded papers |
| `POST` | `/api/documents/cite` | ✅ | Generate citations for a source |
| `GET` | `/api/documents/view/:filename` | ✅ | Stream a PDF for viewing |
| `GET` | `/api/notebook` | ✅ | List saved notebook entries |
| `POST` | `/api/notebook` | ✅ | Save an insight to notebook |
| `DELETE` | `/api/notebook/:id` | ✅ | Remove a notebook entry |

---

## 🌐 Deployment

This app is deployed on **Render** as a Web Service.

**Live Demo:** [research-paper-assistant.onrender.com](https://research-paper-assistant.onrender.com)

> **Note:** The free tier spins down after 15 minutes of inactivity. First load may take ~30 seconds for a cold start.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

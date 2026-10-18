"""Deterministic text chunking for the knowledge corpus.

Uses LangChain's standalone recursive splitter (the only LangChain piece
this codebase adopts — the service layer stays the system of record, per
docs/langchain-rag-implementation-plan-2026-06-28.md).
"""

from langchain_text_splitters import RecursiveCharacterTextSplitter

# ~1200 chars ≈ 250-300 tokens: large enough for a coherent JD section
# (responsibilities, requirements), small enough for precise retrieval.
CHUNK_SIZE = 1200
CHUNK_OVERLAP = 150

# Hard cap on input size before chunking. A single oversized corpus document
# (~2.5M chars ≈ 2000+ chunks) would otherwise produce unbounded chunks and
# embeddings — memory/time blow-up. 2.5MB of extracted text is far beyond any
# real JD; anything larger is truncated rather than ingested wholesale.
MAX_INPUT_CHARS = 2_500_000

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    separators=["\n\n", "\n", ". ", " ", ""],
)


def chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks. Deterministic: identical input
    always yields identical chunk boundaries (verified by tests)."""
    if len(text) > MAX_INPUT_CHARS:
        text = text[:MAX_INPUT_CHARS]
    return [chunk.strip() for chunk in _splitter.split_text(text) if chunk.strip()]

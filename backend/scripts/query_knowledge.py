#!/usr/bin/env python
"""Spot-check retrieval quality of the RAG knowledge corpus.

Usage (inside the backend container):

    python scripts/query_knowledge.py "backend engineer with kafka" --top-k 5
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.session import AsyncSessionFactory  # noqa: E402
from app.services.rag import embedding_provider, retrieval_service  # noqa: E402


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--source-type", default="jd_corpus")
    args = parser.parse_args()

    try:
        embedding_provider.require_embeddings_enabled()
    except embedding_provider.EmbeddingError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    async with AsyncSessionFactory() as db:
        hits = await retrieval_service.search(
            db, args.query, top_k=args.top_k, source_type=args.source_type or None
        )

    if not hits:
        print("No results — is the corpus ingested and embedded?")
        return 1

    for rank, hit in enumerate(hits, start=1):
        print(f"\n#{rank}  score={hit.score:.4f}  {hit.document_title}")
        print(f"    file: {hit.filename}  (chunk {hit.chunk_index})")
        snippet = " ".join(hit.content.split())
        print(f"    {snippet[:300]}{'…' if len(snippet) > 300 else ''}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

---
name: Knowledge management
description: Hybrid pgvector + BM25 RAG with scope weighting, per-doc pinning, optional LLM reranker, and full retrieval analytics
type: feature
---
The RAG layer uses hybrid pgvector + BM25 retrieval (`match_knowledge_chunks`) with per-scope weighting applied AFTER retrieval (Project 1.0 / Client 0.85 / Activation 0.75 / Agency 0.6) and per-document `priority_weight` baked into the SQL hybrid_score. Pinned documents (`is_pinned = true`) are force-injected into every retrieval as one chunk regardless of score and rendered with a ★ tag in the prompt. An optional LLM reranker (Gemini 2.5 Flash Lite) re-scores the top 20 candidates when callers pass `rerank: true`. Every retrieval is logged to `rag_query_log` with scopes, returned chunk IDs, duration, and pinned/reranked flags for audit. The shared helper (`supabase/functions/_shared/rag-helper.ts`) is wired into all 6 generation edge functions and the standalone `rag-retrieve` endpoint. The Knowledge Base UI exposes a pin toggle per document; the KB Health admin tab surfaces totals, scope distribution, and failed embeddings with retry.

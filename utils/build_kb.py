"""
RAG knowledge base: embed JD files from data/jds into ChromaDB per role.
Single responsibility: build and query vector store; no parsing or rewriting.
"""

import warnings

# Reduce noise from urllib3/Google when running on older Python
warnings.filterwarnings("ignore", message=".*OpenSSL.*")
warnings.filterwarnings("ignore", message=".*non-supported Python version.*")
warnings.filterwarnings("ignore", message=".*Python version 3.9 past its end of life.*")
warnings.filterwarnings("ignore", category=FutureWarning, module="google.")

from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings
try:
    # Newer LangChain splitters package (1.x)
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    # Backwards compatibility with older LangChain versions
    from langchain.text_splitter import RecursiveCharacterTextSplitter

from utils.paths import resolve_path

load_dotenv()

# Resolved at import so paths work from any cwd
JDS_DIR = resolve_path("data/jds")
CHROMA_DIR = resolve_path("data/chroma_db")

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
# Current Gemini embedding model (models/embedding-001 is deprecated)
EMBEDDING_MODEL = "models/gemini-embedding-001"


def _load_jd_documents(base_dir: Path) -> list[tuple[str, list[str], list[dict]]]:
    """
    Load all .txt JDs under role folders. Returns list of
    (collection_name, chunks, metadatas) for each role.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    role_data = []

    for role_folder in sorted(base_dir.iterdir()):
        if not role_folder.is_dir() or role_folder.name.startswith("."):
            continue

        collection_name = role_folder.name
        chunks = []
        metadatas = []

        for jd_file in sorted(role_folder.glob("*.txt")):
            text = jd_file.read_text(encoding="utf-8")
            doc_chunks = splitter.split_text(text)
            chunks.extend(doc_chunks)
            metadatas.extend(
                [{"role": collection_name, "source": jd_file.name}] * len(doc_chunks)
            )

        if chunks:
            role_data.append((collection_name, chunks, metadatas))

    return role_data


def build_knowledge_base(
    jds_dir: Optional[Path] = None, chroma_dir: Optional[Path] = None
) -> None:
    """
    Build ChromaDB collections from JDs organised by role folder.
    One collection per role (e.g. java_developer).

    Args:
        jds_dir: Root directory containing role subdirs with .txt JDs. Default: data/jds.
        chroma_dir: Where to persist ChromaDB. Default: data/chroma_db.
    """
    base = jds_dir or JDS_DIR
    persist = chroma_dir or CHROMA_DIR

    if not base.exists():
        raise FileNotFoundError(f"JDs directory not found: {base}")

    persist.mkdir(parents=True, exist_ok=True)
    embeddings = GoogleGenerativeAIEmbeddings(model=EMBEDDING_MODEL)
    role_data = _load_jd_documents(base)

    if not role_data:
        print(f"No .txt files found under {base}")
        return

    for collection_name, chunks, metadatas in role_data:
        vectorstore = Chroma(
            collection_name=collection_name,
            persist_directory=str(persist),
            embedding_function=embeddings,
        )
        vectorstore.add_texts(texts=chunks, metadatas=metadatas)
        print(f"Built: {collection_name} ({len(chunks)} chunks)")

    print(f"Knowledge base persisted → {persist}")


def query_kb(
    query: str,
    collection_name: str = "java_developer",
    k: int = 3,
    chroma_dir: Optional[Path] = None,
) -> list[str]:
    """
    Query a role collection in ChromaDB. Returns list of chunk texts.

    Args:
        query: Search query (e.g. job title + skills).
        collection_name: Role collection to search. Default: java_developer.
        k: Max number of chunks to return.
        chroma_dir: Chroma persist directory. Default: data/chroma_db.

    Returns:
        List of retrieved chunk strings.
    """
    persist = chroma_dir or CHROMA_DIR
    embeddings = GoogleGenerativeAIEmbeddings(model=EMBEDDING_MODEL)
    vectorstore = Chroma(
        collection_name=collection_name,
        persist_directory=str(persist),
        embedding_function=embeddings,
    )
    results = vectorstore.similarity_search(query, k=k)
    return [r.page_content for r in results]


if __name__ == "__main__":
    build_knowledge_base()

    print("\nSample retrieval (java_developer):")
    results = query_kb("senior software engineer microservices Java Spring", k=3)
    for i, r in enumerate(results, 1):
        preview = r[:200] + "..." if len(r) > 200 else r
        print(f"\n[{i}] {preview}")

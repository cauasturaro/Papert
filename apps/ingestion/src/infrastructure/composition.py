"""Composition of production adapters shared by the Lambda and local entry points."""

from src.domain.ports import Ports
from src.infrastructure.control import RpcControl
from src.infrastructure.embeddings import OpenAIEmbeddings
from src.infrastructure.extraction import DocumentExtractor
from src.infrastructure.fake_embedder import FakeEmbedder
from src.infrastructure.model_provider import model_provider
from src.infrastructure.objects import S3Objects, S3Renditions
from src.infrastructure.store import SourceStore
from src.infrastructure.tracing import IngestionTrace


def build_ports(control, connection, deadline=None) -> Ports:
    embeddings = (
        FakeEmbedder() if model_provider() == "fake" else OpenAIEmbeddings(deadline=deadline)
    )

    return Ports(
        control=RpcControl(control),
        objects=S3Objects(),
        store=SourceStore(connection),
        embeddings=embeddings,
        trace=IngestionTrace(),
        extractor=DocumentExtractor(deadline=deadline),
        renditions=S3Renditions(),
    )

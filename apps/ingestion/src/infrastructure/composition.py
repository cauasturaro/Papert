"""Composition of production adapters shared by the Lambda and local entry points."""

from src.application.ports import Ports
from src.infrastructure.control import RpcControl
from src.infrastructure.embeddings import OpenAIEmbeddings
from src.infrastructure.extraction import DocumentExtractor
from src.infrastructure.objects import S3Objects, S3Renditions
from src.infrastructure.store import SourceStore
from src.infrastructure.tracing import IngestionTrace


def build_ports(control, connection) -> Ports:
    return Ports(
        control=RpcControl(control),
        objects=S3Objects(),
        store=SourceStore(connection),
        embeddings=OpenAIEmbeddings(),
        trace=IngestionTrace(),
        extractor=DocumentExtractor(),
        renditions=S3Renditions(),
    )

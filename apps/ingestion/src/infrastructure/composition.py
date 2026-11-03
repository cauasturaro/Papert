"""Composition of production adapters shared by the Lambda and local entry points."""

from src.application.ports import Control, Ports
from src.infrastructure.embeddings import OpenAIEmbeddings
from src.infrastructure.objects import S3Objects
from src.infrastructure.store import SourceStore
from src.infrastructure.tracing import IngestionTrace


def build_ports(control: Control, connection) -> Ports:
    return Ports(
        control=control,
        objects=S3Objects(),
        store=SourceStore(connection),
        embeddings=OpenAIEmbeddings(),
        trace=IngestionTrace(),
    )

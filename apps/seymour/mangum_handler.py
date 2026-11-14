"""HTTP API adapter; Gateway applies IAM before reaching the internal API."""

from mangum import Mangum

from main import app

handler = Mangum(app, lifespan="off")

import type { CatalogItem } from "./types.ts";

export const pythonCatalog: CatalogItem[] = [
  {
    label: "pytest-fixture",
    insertText: `@pytest.fixture
def \${1:sample}():
    return \${2:None}`,
    documentation: "Reusable test fixture.",
    framework: "pytest",
    imports: ["import pytest"],
  },
  {
    label: "pytest-parametrize",
    insertText: `@pytest.mark.parametrize("\${1:value, expected}", [(\${2:1, 1})])
def test_\${3:example}(\${1:value, expected}):
    assert \${4:value} == expected`,
    documentation: "Parameterized test cases.",
    framework: "pytest",
    imports: ["import pytest"],
  },
  {
    label: "pytest-raises",
    insertText: `with pytest.raises(\${1:ValueError}, match="\${2:message}"):
    \${3:operation}()`,
    documentation: "Assert an expected exception.",
    framework: "pytest",
    imports: ["import pytest"],
  },
  {
    label: "fastapi-test-client",
    insertText: `with TestClient(\${1:app}) as client:
    response = client.get("\${2:/items}")

assert response.status_code == \${3:200}`,
    documentation: "Exercise a FastAPI app, including its lifespan.",
    framework: "fastapi",
    imports: ["from fastapi.testclient import TestClient"],
  },
  {
    label: "requests-get",
    insertText: `response = requests.get("\${1:https://example.com}", timeout=\${2:10})
response.raise_for_status()
data = response.json()`,
    documentation: "HTTP request with timeout and status validation.",
    framework: "requests",
    imports: ["import requests"],
  },
  {
    label: "httpx-async",
    insertText: `async with httpx.AsyncClient(timeout=\${1:10}) as client:
    response = await client.get("\${2:https://example.com}")
    response.raise_for_status()
    data = response.json()`,
    documentation: "Async HTTP request with status validation.",
    framework: "httpx",
    imports: ["import httpx"],
  },
  {
    label: "async-main",
    insertText: `async def main():
    \${1:await asyncio.sleep(0)}

if __name__ == "__main__":
    asyncio.run(main())`,
    documentation: "Async Python entry point.",
    imports: ["import asyncio"],
  },
  {
    label: "async-gather",
    insertText: "results = await asyncio.gather(${1:first()}, ${2:second()})",
    documentation: "Await independent coroutines together.",
    imports: ["import asyncio"],
  },
  {
    label: "dataclass",
    insertText: `@dataclass
class \${1:Item}:
    \${2:name}: str
    \${3:quantity}: int = 1`,
    documentation: "A typed data container.",
    imports: ["from dataclasses import dataclass"],
  },
  {
    label: "typed-dict",
    insertText: `class \${1:Payload}(TypedDict):
    \${2:name}: str`,
    documentation: "Describe a dictionary schema.",
    imports: ["from typing import TypedDict"],
  },
  {
    label: "typing-protocol",
    insertText: `class \${1:Repository}(Protocol):
    def \${2:get}(self, \${3:item_id}: int) -> \${4:str}:
        ...`,
    documentation: "Structural typing contract.",
    imports: ["from typing import Protocol"],
  },
];

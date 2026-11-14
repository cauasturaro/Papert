import { calledName } from "./catalog-helpers.ts";
import type { CatalogItem } from "./types.ts";

const routeMethods = ["get", "post", "put", "patch", "delete"];

function routerMethod(receiver: string, insertText: string): CatalogItem {
  const label = calledName(insertText);

  return {
    label,
    insertText,
    documentation: "FastAPI path operation or router method.",
    framework: "fastapi",
    context: "member",
    receiver,
    kind: "Method",
  };
}

function routerMethods(receiver: string): CatalogItem[] {
  const routes = routeMethods.map((method) =>
    routerMethod(receiver, `${method}("\${1:/items}")`),
  );

  return [...routes, routerMethod(receiver, "include_router(${1:router})")];
}

function pathOperation(method: string): CatalogItem {
  return {
    label: `fastapi-${method}`,
    insertText: `@\${1:app}.${method}("\${2:/items}")
async def \${3:handler}():
    return \${4:None}`,
    documentation: "Async path operation.",
    framework: "fastapi",
  };
}

export const fastapiCatalog: CatalogItem[] = [
  {
    label: "fastapi-app",
    insertText: "app = FastAPI()",
    documentation: "Create an ASGI application.",
    framework: "fastapi",
    imports: ["from fastapi import FastAPI"],
  },
  {
    label: "fastapi-router",
    insertText: 'router = APIRouter(prefix="${1:/items}", tags=["${2:items}"])',
    documentation: "Create a modular API router.",
    framework: "fastapi",
    imports: ["from fastapi import APIRouter"],
  },
  {
    label: "fastapi-dependency",
    insertText: `def \${1:get_service}():
    return \${2:service}

@\${3:app}.get("\${4:/items}")
def \${5:list_items}(service: Annotated[\${6:Service}, Depends(\${1:get_service})]):
    return service.\${7:list}()`,
    documentation: "Inject a dependency using Annotated.",
    framework: "fastapi",
    imports: ["from typing import Annotated", "from fastapi import Depends"],
  },
  {
    label: "fastapi-http-exception",
    insertText:
      'raise HTTPException(status_code=${1:404}, detail="${2:Not found}")',
    documentation: "Return an HTTP error.",
    framework: "fastapi",
    imports: ["from fastapi import HTTPException"],
  },
  {
    label: "fastapi-request-response",
    insertText: `class \${1:ItemRequest}(BaseModel):
    name: str

class \${2:ItemResponse}(BaseModel):
    id: int
    name: str

@\${3:app}.post("\${4:/items}", response_model=\${2:ItemResponse}, status_code=status.HTTP_201_CREATED)
def \${5:create_item}(payload: \${1:ItemRequest}):
    return \${2:ItemResponse}(id=\${6:1}, name=payload.name)`,
    documentation: "Validated request and response models.",
    framework: "fastapi",
    imports: ["from pydantic import BaseModel", "from fastapi import status"],
  },
  {
    label: "fastapi-lifespan",
    insertText: `@asynccontextmanager
async def lifespan(app: FastAPI):
    \${1:pass}

    yield

    \${2:pass}

app = FastAPI(lifespan=lifespan)`,
    documentation: "Manage startup and shutdown with lifespan.",
    framework: "fastapi",
    imports: [
      "from contextlib import asynccontextmanager",
      "from fastapi import FastAPI",
    ],
  },
  {
    label: "fastapi-include-router",
    insertText: "${1:app}.include_router(${2:router})",
    documentation: "Mount API routes.",
    framework: "fastapi",
  },
  {
    label: "fastapi-status",
    insertText: "status.HTTP_${1:201_CREATED}",
    documentation: "Named HTTP status code.",
    framework: "fastapi",
    imports: ["from fastapi import status"],
  },
  ...routerMethods("FastAPI"),
  ...routerMethods("APIRouter"),
  ...routeMethods.map(pathOperation),
];

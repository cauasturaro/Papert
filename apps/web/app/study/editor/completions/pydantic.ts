import type { CatalogItem } from "./types.ts";

export const pydanticCatalog: CatalogItem[] = [
  {
    label: "pydantic-model",
    insertText: `class \${1:Item}(BaseModel):
    \${2:name}: str
    \${3:quantity}: int = Field(default=1, ge=1)`,
    documentation: "Pydantic v2 model with field constraints.",
    framework: "pydantic",
    imports: ["from pydantic import BaseModel, Field"],
  },
  {
    label: "pydantic-field",
    insertText: 'Field(default=${1:None}, description="${2:Description}")',
    documentation: "Field metadata and validation.",
    framework: "pydantic",
    imports: ["from pydantic import Field"],
  },
  {
    label: "pydantic-validator",
    insertText: `@field_validator("\${1:name}")
@classmethod
def \${2:validate_name}(cls, value: str) -> str:
    if not value.strip():
        raise ValueError("\${3:Must not be blank}")

    return value`,
    documentation: "Pydantic v2 field validator.",
    framework: "pydantic",
    imports: ["from pydantic import field_validator"],
  },
  {
    label: "pydantic-config",
    insertText:
      'model_config = ConfigDict(from_attributes=True, extra="forbid")',
    documentation: "Pydantic v2 model configuration.",
    framework: "pydantic",
    imports: ["from pydantic import ConfigDict"],
  },
];

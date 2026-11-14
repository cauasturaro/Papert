export type Framework =
  | "spring"
  | "spring-web"
  | "spring-jpa"
  | "spring-security"
  | "spring-validation"
  | "spring-test"
  | "flask"
  | "fastapi"
  | "django"
  | "drf"
  | "pydantic"
  | "sqlalchemy"
  | "langchain"
  | "langchain-openai"
  | "langchain-anthropic"
  | "langgraph"
  | "pytest"
  | "requests"
  | "httpx";

export type CatalogItem = {
  label: string;
  insertText: string;
  documentation: string;
  framework?: Framework;
  context?: "annotation" | "member";
  receiver?: string;
  imports?: string[];
  kind?:
    | "Class"
    | "Function"
    | "Method"
    | "Property"
    | "Snippet"
    | "Module"
    | "Constant";
};

export type ImportModule = {
  module: string;
  exports: string[];
  framework?: Framework;
};

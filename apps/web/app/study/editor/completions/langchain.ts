import type { CatalogItem } from "./types.ts";

export const langchainCatalog: CatalogItem[] = [
  {
    label: "langchain-openai",
    insertText: 'model = ChatOpenAI(model="${1:gpt-4.1-mini}")',
    documentation: "OpenAI chat model from the provider package.",
    framework: "langchain-openai",
    imports: ["from langchain_openai import ChatOpenAI"],
  },
  {
    label: "langchain-anthropic",
    insertText: 'model = ChatAnthropic(model="${1:claude-sonnet-4-5}")',
    documentation: "Anthropic chat model from the provider package.",
    framework: "langchain-anthropic",
    imports: ["from langchain_anthropic import ChatAnthropic"],
  },
  {
    label: "langchain-prompt",
    insertText: `prompt = ChatPromptTemplate.from_messages([
    ("system", "\${1:You are a helpful assistant.}"),
    ("human", "{question}"),
])`,
    documentation: "Reusable chat prompt template.",
    framework: "langchain",
    imports: ["from langchain_core.prompts import ChatPromptTemplate"],
  },
  {
    label: "langchain-parser",
    insertText: "parser = StrOutputParser()",
    documentation: "Parse chat model output into text.",
    framework: "langchain",
    imports: ["from langchain_core.output_parsers import StrOutputParser"],
  },
  {
    label: "langchain-lcel",
    insertText: `chain = \${1:prompt} | \${2:model} | StrOutputParser()
result = chain.invoke({"\${3:question}": "\${4:Hello}"})`,
    documentation: "Compose a runnable pipeline with LCEL.",
    framework: "langchain",
    imports: ["from langchain_core.output_parsers import StrOutputParser"],
  },
  {
    label: "langchain-tool",
    insertText: `@tool
def \${1:search}(\${2:query}: str) -> str:
    """\${3:Search for information.}"""
    return \${4:query}`,
    documentation: "A typed tool with a description.",
    framework: "langchain",
    imports: ["from langchain_core.tools import tool"],
  },
  {
    label: "langchain-structured-output",
    insertText: `structured_model = \${1:model}.with_structured_output(\${2:ResponseModel})
result = structured_model.invoke("\${3:Question}")`,
    documentation: "Request schema-validated model output.",
    framework: "langchain",
  },
  {
    label: "langgraph-state-graph",
    insertText: `class \${1:State}(TypedDict):
    \${2:message}: str

def \${3:process}(state: \${1:State}):
    return {"\${2:message}": state["\${2:message}"]}

builder = StateGraph(\${1:State})
builder.add_node("\${3:process}", \${3:process})
builder.add_edge(START, "\${3:process}")
builder.add_edge("\${3:process}", END)
graph = builder.compile()`,
    documentation: "Build and compile a state graph.",
    framework: "langgraph",
    imports: [
      "from typing import TypedDict",
      "from langgraph.graph import StateGraph, START, END",
    ],
  },
];

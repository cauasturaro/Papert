import test from "node:test";
import assert from "node:assert/strict";
import { SnippetParser } from "monaco-editor/editor/contrib/snippet/browser/snippetParser.js";
import { configCatalog } from "./config.ts";
import { completionContext } from "./cursor-context.ts";
import {
  isManifest,
  manifestFrameworks,
  sourceFrameworks,
  workspacePrefix,
} from "./frameworks.ts";
import { javaImportEdit } from "./java-imports.ts";
import { javaCatalog } from "./java.ts";
import { allPythonItems } from "./languages.ts";
import { pythonModules } from "./python-modules.ts";
import { receiverType } from "./python-receivers.ts";
import { registerFrameworkCompletions } from "./index.ts";

function model(path, content = "") {
  return {
    id: path,
    content,
    version: 1,
    reads: 0,
    uri: { path: `/papert/${path}`, toString: () => `file:///papert/${path}` },
    getValue() {
      this.reads += 1;

      return this.content;
    },
    getVersionId() {
      return this.version;
    },
    getLineContent(line) {
      return this.content.split("\n")[line - 1];
    },
    getWordUntilPosition(position) {
      const line = this.getLineContent(position.lineNumber);
      const before = line.slice(0, position.column - 1);
      const word = /\w*$/.exec(before)[0];

      return {
        word,
        startColumn: position.column - word.length,
        endColumn: position.column,
      };
    },
  };
}

function harness(models) {
  const providers = new Map();
  const monaco = {
    editor: { getModels: () => models },
    languages: {
      CompletionItemKind: {
        Snippet: 1,
        Property: 2,
        Class: 3,
        Method: 4,
        Function: 5,
      },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      registerCompletionItemProvider(language, provider) {
        assert.ok(!providers.has(language));
        providers.set(language, provider);
      },
    },
  };
  registerFrameworkCompletions(monaco);
  registerFrameworkCompletions(monaco);

  return (language, target, line = target.content.split("\n").length) => {
    const column = target.getLineContent(line).length + 1;

    return providers
      .get(language)
      .provideCompletionItems(target, { lineNumber: line, column }).suggestions;
  };
}

test("detects Spring modules in Maven and both Gradle manifests", () => {
  const dependencies = ["web", "data-jpa", "security", "validation", "test"]
    .map((name) => `spring-boot-starter-${name}`)
    .join("\n");

  for (const path of ["pom.xml", "build.gradle", "build.gradle.kts"]) {
    const frameworks = manifestFrameworks([{ path, content: dependencies }]);

    assert.deepEqual([...frameworks].sort(), [
      "spring",
      "spring-jpa",
      "spring-security",
      "spring-test",
      "spring-validation",
      "spring-web",
    ]);
  }
});

test("detects Python packages in every supported manifest and infers dependencies", () => {
  const dependencies =
    "Flask FastAPI Django djangorestframework SQLAlchemy langchain-core langchain-openai langchain-anthropic langgraph pytest requests httpx";

  for (const path of [
    "requirements.txt",
    "requirements-dev.txt",
    "pyproject.toml",
    "Pipfile",
    "setup.cfg",
  ]) {
    const frameworks = manifestFrameworks([{ path, content: dependencies }]);

    for (const expected of [
      "flask",
      "fastapi",
      "django",
      "drf",
      "pydantic",
      "sqlalchemy",
      "langchain",
      "langchain-openai",
      "langchain-anthropic",
      "langgraph",
      "pytest",
      "requests",
      "httpx",
    ]) {
      assert.ok(frameworks.has(expected), `${path}: ${expected}`);
    }
  }
});

test("uses current imports and ignores ordinary code and commented dependencies", () => {
  const source =
    "from fastapi import FastAPI\nfrom langchain_openai import ChatOpenAI\nimport org.springframework.web.bind.annotation.RestController;";

  const detected = sourceFrameworks(source);
  const absent = new Set([
    ...manifestFrameworks([{ path: "requirements.txt", content: "# flask\n" }]),
    ...sourceFrameworks("# import django\nmessage = 'sqlalchemy'\n"),
  ]);

  assert.ok(detected.has("fastapi"));
  assert.ok(detected.has("pydantic"));
  assert.ok(detected.has("langchain-openai"));
  assert.ok(detected.has("spring-web"));
  assert.equal(absent.size, 0);
  assert.equal(isManifest("docs/requirements-dev.txt"), true);
  assert.equal(isManifest("src/app.py"), false);
  assert.equal(
    workspacePrefix("file:///papert/one/src/app.py"),
    "file:///papert/one/",
  );
  assert.equal(workspacePrefix("file:///elsewhere/app.py"), undefined);
});

test("recognizes annotations, module imports, exports and receiver contexts", () => {
  assert.deepEqual(completionContext("  @Res", "java"), { kind: "annotation" });
  assert.deepEqual(completionContext("from fastapi import ", "python"), {
    kind: "imports",
    module: "fastapi",
    prefix: "",
  });
  assert.deepEqual(
    completionContext("from fastapi import FastAPI, Dep", "python"),
    { kind: "imports", module: "fastapi", prefix: "Dep" },
  );
  assert.deepEqual(completionContext("from langchain_core.pr", "python"), {
    kind: "imports",
    prefix: "langchain_core.pr",
  });
  assert.deepEqual(completionContext("import org.springframework.", "java"), {
    kind: "imports",
    prefix: "org.springframework.",
  });
  assert.deepEqual(completionContext("@app.ge", "python"), {
    kind: "member",
    receiver: "app",
  });
  assert.deepEqual(completionContext("ResponseEntity.", "java"), {
    kind: "member",
    receiver: "ResponseEntity",
  });
  assert.deepEqual(completionContext("return value", "python"), {
    kind: "code",
  });
});

test("recognizes only known receiver assignments and Django imports", () => {
  assert.equal(receiverType("app = FastAPI()", "app"), "FastAPI");
  assert.equal(receiverType("app: Flask = Flask(__name__)", "app"), "Flask");
  assert.equal(receiverType("router = APIRouter()", "router"), "APIRouter");
  assert.equal(
    receiverType("from django.db import models\n", "models"),
    "django.models",
  );
  assert.equal(
    receiverType("from django.db import models as db\n", "db"),
    "django.models",
  );
  assert.equal(receiverType("app = SomethingElse()", "app"), undefined);
  assert.equal(receiverType("import something\n", "models"), undefined);
});

test("inserts Java imports after package/imports and preserves CRLF without duplicates", () => {
  const name = "org.springframework.stereotype.Service";
  const source =
    "package example;\r\n\r\nimport java.util.List;\r\n\r\nclass Example {}";

  const edit = javaImportEdit(source, [name, name]);

  assert.deepEqual(edit, {
    lineNumber: 3,
    column: 23,
    text: `\r\nimport ${name};`,
  });
  assert.equal(javaImportEdit(`import ${name};\n`, [name]), undefined);
  assert.equal(
    javaImportEdit("import org.springframework.stereotype.*;\n", [name]),
    undefined,
  );
  assert.deepEqual(javaImportEdit("package example;\n", [name]), {
    lineNumber: 1,
    column: 17,
    text: `\nimport ${name};`,
  });
  assert.deepEqual(javaImportEdit("class Example {}", [name]), {
    lineNumber: 1,
    column: 1,
    text: `import ${name};\n\n`,
  });
});

function validatePlaceholders(snippet, label) {
  const stack = [];

  for (let index = 0; index < snippet.length; index += 1) {
    if (snippet[index] === "\\") {
      index += 1;
      continue;
    }

    if (snippet.slice(index, index + 2) === "${") {
      assert.match(snippet.slice(index), /^\$\{\d+(?::|\})/, label);
      stack.push(index);
      index += 1;
      continue;
    }

    if (snippet[index] === "}" && stack.length > 0) {
      stack.pop();
    }
  }

  assert.equal(stack.length, 0, label);
}

test("catalogs have unique context labels and valid Monaco snippets without deprecated APIs", () => {
  const keys = new Set();
  const parser = new SnippetParser();

  for (const [language, catalog] of [
    ["java", javaCatalog],
    ["python", allPythonItems],
    ["config", configCatalog],
  ]) {
    for (const entry of catalog) {
      const key = `${language}:${entry.context ?? "code"}:${entry.receiver ?? ""}:${entry.label}`;
      assert.ok(!keys.has(key), key);
      keys.add(key);

      validatePlaceholders(entry.insertText, entry.label);
      const parsed = parser.parse(entry.insertText);
      assert.ok(parsed.toString().length > 0, entry.label);
      assert.doesNotMatch(parsed.toString(), /(?<!\\)\$\{\d+:/, entry.label);
      assert.doesNotMatch(
        JSON.stringify(entry),
        /javax\.|langchain\.chat_models|declarative_base\(|@validator\(|orm_mode|on_event\(/,
        entry.label,
      );
      assert.ok(entry.documentation);

      if (entry.context === "annotation") {
        assert.equal(entry.imports.length, 1);
        assert.ok(entry.imports[0].endsWith(`.${entry.label}`));
      }
    }
  }

  assert.equal(
    new Set(pythonModules.map((entry) => entry.module)).size,
    pythonModules.length,
  );

  for (const entry of pythonModules) {
    assert.equal(new Set(entry.exports).size, entry.exports.length);
  }
});

test("providers are idempotent and isolate workspace manifests", () => {
  const manifest = model("one/requirements.txt", "fastapi");
  const python = model("one/main.py", "fastapi-");
  const other = model("two/main.py", "fastapi-");
  const complete = harness([manifest, python, other]);

  const detected = complete("python", python);
  const isolated = complete("python", other);

  assert.ok(detected.some((item) => item.label === "fastapi-app"));
  assert.ok(!isolated.some((item) => item.label === "fastapi-app"));
  assert.ok(isolated.some((item) => item.label === "dataclass"));
});

test("invalidates detection for changed, added, removed and recreated manifests", () => {
  const manifest = model("one/requirements.txt", "fastapi");
  const python = model("one/main.py", "");
  const models = [manifest, python];
  const complete = harness(models);

  complete("python", python);
  const reads = manifest.reads;
  complete("python", python);

  assert.equal(manifest.reads, reads);

  manifest.content = "flask";
  manifest.version += 1;
  const changed = complete("python", python);

  assert.ok(changed.some((item) => item.label === "flask-route"));
  assert.ok(!changed.some((item) => item.label === "fastapi-app"));

  models.splice(0, 1);
  const removed = complete("python", python);

  assert.ok(!removed.some((item) => item.label === "flask-route"));

  models.push(model("one/requirements-dev.txt", "django"));
  const added = complete("python", python);

  assert.ok(added.some((item) => item.label === "django-model"));

  python.content = "from fastapi import FastAPI\n";
  python.version += 1;
  const imported = complete("python", python);

  assert.ok(imported.some((item) => item.label === "fastapi-app"));
});

test("offers module exports and replaces full dotted import prefixes", () => {
  const manifest = model("one/requirements.txt", "fastapi\nlangchain-core");
  const python = model("one/main.py", "from fastapi import ");
  const complete = harness([manifest, python]);

  const exports = complete("python", python);

  assert.ok(exports.some((item) => item.label === "Depends"));
  assert.ok(!exports.some((item) => item.label === "Flask"));

  python.content = "from langchain_core.pr";
  python.version += 1;
  const modules = complete("python", python);
  const prompts = modules.find(
    (item) => item.label === "langchain_core.prompts",
  );

  assert.equal(prompts.range.startColumn, 6);
  assert.equal(prompts.insertText, "langchain_core.prompts");
});

test("offers member methods and annotations with correct ranges and imports", () => {
  const java = model(
    "one/Demo.java",
    "package example;\nimport org.springframework.web.bind.annotation.GetMapping;\n\n@Res",
  );
  const python = model(
    "one/main.py",
    "from fastapi import FastAPI\napp = FastAPI()\n@app.",
  );
  const complete = harness([java, python]);

  const annotation = complete("java", java).find(
    (item) => item.label === "RestController",
  );
  const methods = complete("python", python);

  assert.equal(annotation.range.startColumn, 2);
  assert.equal(annotation.insertText, "RestController");
  assert.equal(annotation.additionalTextEdits[0].range.startLineNumber, 2);
  assert.match(
    annotation.additionalTextEdits[0].text,
    /import org\.springframework\.web\.bind\.annotation\.RestController;/,
  );
  assert.ok(methods.some((item) => item.label === "get"));
  assert.ok(!methods.some((item) => item.label === "flask-route"));

  python.content = "from fastapi import FastAPI\nunknown.";
  python.version += 1;

  assert.deepEqual(complete("python", python), []);

  java.content =
    "import org.springframework.http.ResponseEntity;\nResponseEntity.";
  java.version += 1;

  assert.deepEqual(
    complete("java", java)
      .map((item) => item.label)
      .sort(),
    ["badRequest", "created", "noContent", "notFound", "ok", "status"],
  );
});

test("offers Spring config only in application files and replaces dotted keys", () => {
  const manifest = model("one/pom.xml", "spring-boot-starter-web");
  const yaml = model("one/application.yml", "spring.datasource.");
  const properties = model("one/application.properties", "server.po");
  const unrelated = model("one/other.yml", "");
  const complete = harness([manifest, yaml, properties, unrelated]);

  const yamlKey = complete("yaml", yaml).find(
    (item) => item.label === "spring.datasource.url",
  );
  const propertyKey = complete("ini", properties).find(
    (item) => item.label === "server.port",
  );

  assert.equal(yamlKey.range.startColumn, 1);
  assert.match(yamlKey.insertText, /^spring\.datasource\.url: /);
  assert.match(propertyKey.insertText, /^server\.port=/);
  assert.deepEqual(complete("yaml", unrelated), []);
});

test("shares manifest cache between sibling files and detects recreated model identities", () => {
  const manifest = model("one/requirements.txt", "fastapi");
  const first = model("one/first.py", "");
  const second = model("one/second.py", "");
  const models = [manifest, first, second];
  const complete = harness(models);

  complete("python", first);
  const reads = manifest.reads;
  complete("python", second);

  assert.equal(manifest.reads, reads);

  const replacement = model("one/requirements.txt", "flask");
  replacement.id = "new-monaco-model-id";
  models[0] = replacement;
  const recreated = complete("python", first);

  assert.ok(recreated.some((item) => item.label === "flask-route"));
  assert.ok(!recreated.some((item) => item.label === "fastapi-app"));
});

test("keeps imports when the Java completion starts at the top of an empty file", () => {
  const manifest = model(
    "one/build.gradle.kts",
    'implementation("org.springframework.boot:spring-boot-starter-web")',
  );
  const java = model("one/Demo.java", "");
  const complete = harness([manifest, java]);

  const controller = complete("java", java).find(
    (item) => item.label === "spring-rest-controller",
  );

  assert.match(
    controller.insertText,
    /^import org\.springframework\.web\.bind\.annotation\.RestController;/,
  );
  assert.match(controller.insertText, /\n\n@RestController/);
  assert.equal(controller.additionalTextEdits, undefined);
});

test("offers Python decorator snippets without duplicating the typed at sign", () => {
  const manifest = model("one/requirements.txt", "fastapi");
  const python = model("one/main.py", "@");
  const complete = harness([manifest, python]);

  const route = complete("python", python).find(
    (item) => item.label === "fastapi-get",
  );

  assert.equal(route.range.startColumn, 2);
  assert.ok(!route.insertText.startsWith("@"));
});

test("detects imported modules rather than unrelated export names or inline comments", () => {
  const source =
    "from application import Flask, FastAPI\nimport os  # django\n";
  const manifest = { path: "requirements.txt", content: "requests # flask" };

  const detected = new Set([
    ...manifestFrameworks([manifest]),
    ...sourceFrameworks(source),
  ]);

  assert.deepEqual([...detected], ["requests"]);
  assert.ok(sourceFrameworks("import os, httpx as client").has("httpx"));
});

test("places imports after declarations with trailing comments and static imports", () => {
  const name = "org.springframework.stereotype.Service";
  const source =
    "package example; // package\nimport static java.util.Collections.emptyList; // static\n\nclass Demo {}";

  const edit = javaImportEdit(source, [name]);

  assert.equal(edit.lineNumber, 2);
  assert.equal(edit.text, `\nimport ${name};`);
  assert.equal(
    javaImportEdit(`import ${name}; // already imported`, [name]),
    undefined,
  );
});

test("does not keep receiver methods after reassignment and supports combined Django imports", () => {
  assert.equal(
    receiverType("app = FastAPI()\napp = object()", "app"),
    undefined,
  );
  assert.equal(
    receiverType("from django.db import models, transaction", "models"),
    "django.models",
  );
  assert.equal(
    receiverType("from django.db import models as db, transaction", "db"),
    "django.models",
  );
  assert.equal(
    receiverType("from django.db import models\nmodels = object()", "models"),
    undefined,
  );
});

test("expands Spring property and URI placeholders without losing literal braces", () => {
  const parser = new SnippetParser();
  const value = javaCatalog.find((item) => item.label === "Value");
  const mapping = javaCatalog.find((item) => item.label === "PutMapping");

  assert.equal(
    parser.parse(value.insertText).toString(),
    'Value("${property.name}")',
  );
  assert.equal(
    parser.parse(mapping.insertText).toString(),
    'PutMapping("/{id}")',
  );
});

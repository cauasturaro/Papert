import { calledName } from "./catalog-helpers.ts";
import type { CatalogItem } from "./types.ts";

function flaskMethod(insertText: string): CatalogItem {
  const label = calledName(insertText);

  return {
    label,
    insertText,
    documentation: "Flask application method.",
    framework: "flask",
    context: "member",
    receiver: "Flask",
    kind: "Method",
  };
}

export const flaskCatalog: CatalogItem[] = [
  {
    label: "flask-app-factory",
    insertText: `def create_app():
    app = Flask(__name__)

    @app.get("/")
    def index():
        return jsonify(message="\${1:Hello}")

    return app`,
    documentation: "Application factory.",
    framework: "flask",
    imports: ["from flask import Flask, jsonify"],
  },
  {
    label: "flask-blueprint",
    insertText: `\${1:api} = Blueprint("\${1:api}", __name__, url_prefix="\${2:/api}")

@\${1:api}.get("/")
def \${3:index}():
    return jsonify(message="\${4:Hello}")`,
    documentation: "Create a reusable blueprint.",
    framework: "flask",
    imports: ["from flask import Blueprint, jsonify"],
  },
  {
    label: "flask-route",
    insertText: `@\${1:app}.route("\${2:/}", methods=["\${3:GET}"])
def \${4:index}():
    return jsonify(\${5:message="Hello"})`,
    documentation: "Flask route decorator.",
    framework: "flask",
    imports: ["from flask import jsonify"],
  },
  {
    label: "flask-request-json",
    insertText: `payload = request.get_json()
return jsonify(\${1:payload}), \${2:200}`,
    documentation: "Read JSON and return a JSON response.",
    framework: "flask",
    imports: ["from flask import request, jsonify"],
  },
  {
    label: "flask-error-handler",
    insertText: `@\${1:app}.errorhandler(\${2:404})
def \${3:not_found}(error):
    return jsonify(error="\${4:Not found}"), \${2:404}`,
    documentation: "Handle an HTTP error.",
    framework: "flask",
    imports: ["from flask import jsonify"],
  },
  ...["get", "post", "put", "patch", "delete", "route"].map((method) =>
    flaskMethod(`${method}("\${1:/}")`),
  ),
  flaskMethod("errorhandler(${1:404})"),
  flaskMethod("register_blueprint(${1:blueprint})"),
];

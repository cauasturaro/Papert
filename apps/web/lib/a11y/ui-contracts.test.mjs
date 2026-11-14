import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const bundle = buildSync({
  stdin: {
    contents: `
      export { Dialog, DialogTitle } from "./components/ui/dialog/dialog";
      export { Input } from "./components/ui/input/input";
      export { Textarea } from "./components/ui/textarea/textarea";
      export { Select, SelectItem } from "./components/ui/select/select";
    `,
    resolveDir: new URL("../../", import.meta.url).pathname,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  packages: "external",
  format: "cjs",
  platform: "node",
  tsconfig: new URL("../../tsconfig.json", import.meta.url).pathname,
});
const compiled = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(
  createRequire(import.meta.url),
  compiled,
  compiled.exports,
);
const { Dialog, DialogTitle, Input, Textarea, Select, SelectItem } =
  compiled.exports;

test("a visible dialog title names its dialog automatically", () => {
  const markup = renderToStaticMarkup(
    createElement(
      Dialog,
      null,
      createElement(DialogTitle, null, "What Seymour remembers"),
    ),
  );
  const labelledBy = markup.match(/aria-labelledby="([^"]+)"/)[1];
  const titleId = markup.match(/<h2[^>]*id="([^"]+)"/)[1];

  assert.equal(labelledBy, titleId);
  assert.match(markup, /What Seymour remembers/);
});

test("explicit dialog labels and title references remain authoritative", () => {
  const labelled = renderToStaticMarkup(
    createElement(
      Dialog,
      { "aria-label": "Memory" },
      createElement(DialogTitle, null, "What Seymour remembers"),
    ),
  );
  const referenced = renderToStaticMarkup(
    createElement(
      Dialog,
      { "aria-labelledby": "custom-title" },
      createElement(DialogTitle, { id: "custom-title" }, "Keyboard shortcuts"),
    ),
  );

  assert.match(labelled, /aria-label="Memory"/);
  assert.doesNotMatch(labelled, /aria-labelledby=/);
  assert.match(referenced, /aria-labelledby="custom-title"/);
  assert.match(referenced, /id="custom-title"/);
});

test("editable controls keep full input contrast at rest and on hover", () => {
  const controls = [
    createElement(Input),
    createElement(Textarea),
    createElement(
      Select,
      { value: "preference" },
      createElement(SelectItem, { value: "preference" }, "Preference"),
    ),
  ];

  for (const control of controls) {
    const markup = renderToStaticMarkup(control);

    assert.match(markup, /border border-input bg-card/);
    assert.doesNotMatch(markup, /hover:border-input\/40/);
  }
});

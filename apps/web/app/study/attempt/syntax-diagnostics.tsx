"use client";

import type { SyntaxReport } from "../study-api";
import { Location, type OpenLocation } from "./feedback-actions";

export function SyntaxDiagnostics({
  syntax,
  onOpenLocation,
}: {
  syntax: SyntaxReport;
  onOpenLocation?: OpenLocation;
}) {
  return (
    <div className="space-y-2">
      {syntax.diagnostics.length > 0 && (
        <ul className="space-y-1" aria-label="Syntax errors">
          {syntax.diagnostics.map((item, index) => (
            <li key={`${item.path}-${item.line}-${index}`} className="text-sm">
              <Location
                path={item.path}
                line={item.line}
                onOpenLocation={onOpenLocation}
              />{" "}
              {item.message}
            </li>
          ))}
        </ul>
      )}

      {syntax.unchecked.length > 0 && (
        <p className="text-sm">
          Not syntax-checked (no checker for this file type):{" "}
          <span className="font-mono">{syntax.unchecked.join(", ")}</span>
        </p>
      )}
    </div>
  );
}

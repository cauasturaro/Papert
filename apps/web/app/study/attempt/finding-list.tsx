"use client";

import { WorkspaceCommandsProvider } from "../workspace/workspace-commands-context";
import { Badge, type BadgeProps } from "@/components/ui/badge/badge";
import { askAboutFinding, orderFindings } from "../analysis/analysis-state";
import type { Finding } from "../study-types";
import {
  AskButton,
  Location,
  type AskSeymour,
  type OpenLocation,
} from "./feedback-actions";

const severityLabels: Record<Finding["severity"], string> = {
  error: "Error",
  warning: "Warning",
  info: "Note",
};

const severityVariants: Record<Finding["severity"], BadgeProps["variant"]> = {
  error: "destructive",
  warning: "warning",
  info: "info",
};

export function FindingList({
  findings,
  onOpenLocation,
  onAskSeymour,
}: {
  findings: Finding[];
  onOpenLocation?: OpenLocation;
  onAskSeymour?: AskSeymour;
}) {
  const ordered = orderFindings(findings);

  return (
    <WorkspaceCommandsProvider
      value={{ onOpenLocation, onAskSeymour }}
    >
      <ul className="space-y-2">
        {ordered.map((finding, index) => (
          <li key={index} className="space-y-1">
            <p className="flex flex-wrap items-center gap-2">
              <Badge size="sm" variant={severityVariants[finding.severity]}>
                {severityLabels[finding.severity]}
              </Badge>

              {finding.path && (
                <Location
                  path={finding.path}
                  line={finding.line}
                />
              )}

              <AskButton
                prompt={askAboutFinding(finding)}
                label={`Ask Seymour about: ${finding.message}`}
              />
            </p>

            <p className="text-sm">{finding.message}</p>
          </li>
        ))}
      </ul>
    </WorkspaceCommandsProvider>
  );
}

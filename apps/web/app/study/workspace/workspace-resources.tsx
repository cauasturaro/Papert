"use client";

import type { ReactNode } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs/tabs";
import { CollapsePanelButton } from "../shell/side-panel-controls";

type WorkspaceResourcesProps = {
  files: ReactNode;
  sources: ReactNode;
  onCollapse: () => void;
};

/** Left column: workspace files and uploaded sources, both kept mounted. */
export function WorkspaceResources({
  files,
  sources,
  onCollapse,
}: WorkspaceResourcesProps) {
  return (
    <Tabs
      defaultValue="files"
      className="flex h-full min-h-0 flex-col space-y-0 bg-card"
    >
      <div className="flex h-10 shrink-0 items-center border-b border-border px-2">
        <TabsList className="bg-transparent p-0">
          <TabsTrigger size="sm" value="files" className="h-7">
            Files
          </TabsTrigger>
          <TabsTrigger size="sm" value="sources" className="h-7">
            Sources
          </TabsTrigger>
        </TabsList>

        <span className="ml-auto">
          <CollapsePanelButton
            side="left"
            panel="explorer"
            label="files"
            onCollapse={onCollapse}
          />
        </span>
      </div>

      <TabsContent value="files" className="min-h-0 flex-1">
        {files}
      </TabsContent>

      <TabsContent value="sources" className="min-h-0 flex-1">
        {sources}
      </TabsContent>
    </Tabs>
  );
}

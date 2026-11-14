"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button/button";
import { announce } from "@/lib/a11y/announcer";

export function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      announce("Couldn't copy the answer");

      return;
    }

    setCopied(true);
    announce("Answer copied");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 text-xs"
      onClick={() => void copy()}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

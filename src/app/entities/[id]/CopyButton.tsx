"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy service block" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API needs a secure context; fall back to a prompt.
      window.prompt("Copy the service block:", text);
    }
  }

  return (
    <button type="button" className="btn-outline" onClick={copy}>
      {copied ? "Copied ✓" : label}
    </button>
  );
}

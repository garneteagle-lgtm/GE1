"use client";

import { useRef, useState } from "react";
import { LOGO_FALLBACK } from "@/lib/letterhead";

const MAX_BYTES = 1_000_000; // 1 MB — logos should be small

export default function LogoField({ initial }: { initial: string }) {
  const [dataUrl, setDataUrl] = useState(initial);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(file: File) {
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPG, or SVG).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image is too large — please use one under 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDataUrl(String(reader.result || ""));
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsDataURL(file);
  }

  const preview = dataUrl || LOGO_FALLBACK;

  return (
    <div>
      <label className="label">Logo</label>
      {/* Persisted value — empty string means "use the bundled default". */}
      <input type="hidden" name="logoDataUrl" value={dataUrl} />
      <div className="flex items-center gap-4">
        <div className="flex h-24 w-64 items-center justify-center rounded-md border border-slate-200 bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Letterhead logo preview" className="max-h-full max-w-full" />
        </div>
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          <button
            type="button"
            className="btn-outline"
            onClick={() => fileRef.current?.click()}
          >
            Choose image…
          </button>
          {dataUrl && (
            <button
              type="button"
              className="btn-ghost block text-sm text-slate-600"
              onClick={() => setDataUrl("")}
            >
              Reset to default
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-xs text-slate-500">
        Appears centered at the top of every letter. Wide, transparent PNG works best.
      </p>
    </div>
  );
}

"use client";

export function PrintButton() {
  return (
    <button className="btn-outline print:hidden" type="button" onClick={() => window.print()}>
      Print / Save PDF
    </button>
  );
}

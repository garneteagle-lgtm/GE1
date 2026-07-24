import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { getLetterhead, isLetterheadConfigured } from "@/lib/letterhead";
import LetterEditor from "./LetterEditor";

export default async function LetterheadPage() {
  await requireUser();
  const [letterhead, clients] = await Promise.all([
    getLetterhead(),
    db.client.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, address: true },
    }),
  ]);

  const configured = isLetterheadConfigured(letterhead);

  return (
    <div className="space-y-6">
      <div className="no-print flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Letter on letterhead</h1>
        <Link className="btn-outline" href="/letterhead/settings">
          Edit letterhead
        </Link>
      </div>

      {!configured && (
        <div className="no-print card border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Your letterhead is empty.{" "}
          <Link className="font-medium underline" href="/letterhead/settings">
            Add your firm name and address
          </Link>{" "}
          so it appears at the top of every letter.
        </div>
      )}

      <LetterEditor letterhead={letterhead} clients={clients} />
    </div>
  );
}

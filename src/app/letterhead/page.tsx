import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { getLetterhead, logoSrc } from "@/lib/letterhead";
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

  return (
    <div className="space-y-6">
      <div className="no-print flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Letter on letterhead</h1>
        <Link className="btn-outline" href="/letterhead/settings">
          Edit letterhead
        </Link>
      </div>

      <LetterEditor letterhead={letterhead} logo={logoSrc(letterhead)} clients={clients} />
    </div>
  );
}

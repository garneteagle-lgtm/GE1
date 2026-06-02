import { requireUser } from "@/lib/guard";
import CalculatorClient from "./CalculatorClient";

export const metadata = {
  title: "Support Calculator · Case Manager",
};

export default async function CalculatorPage() {
  await requireUser();
  return <CalculatorClient />;
}

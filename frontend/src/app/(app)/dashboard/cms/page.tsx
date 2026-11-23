import { redirect } from "next/navigation";

// The old /dashboard/cms URL.
export default function LegacyCms() {
  redirect("/dashboard/cmp");
}

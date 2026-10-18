import { redirect } from "next/navigation";

export const revalidate = 0;

export default function LegacyCmsPage() {
  redirect("/dashboard/cmp");
}

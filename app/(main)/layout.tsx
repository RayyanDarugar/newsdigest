import { getActiveIndustries } from "@/lib/queries";
import { Masthead } from "@/components/masthead";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const industries = await getActiveIndustries();
  return (
    <div className="relative z-10 mx-auto max-w-3xl px-4 pb-16">
      <Masthead industries={industries} />
      <div className="pt-8">{children}</div>
    </div>
  );
}

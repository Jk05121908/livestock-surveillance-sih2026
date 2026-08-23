import ReportForm from "@/components/ReportForm";
import FarmerChatbot from "@/components/FarmerChatbot";

export const metadata = {
  title: "Report Disease — Livestock Surveillance",
  description: "Mobile-friendly disease reporting for farmers with offline support",
};

export default function ReportPage() {
  return (
    <main className="min-h-full bg-zinc-50 dark:bg-black py-6 px-4">
      <ReportForm />
      <FarmerChatbot />
    </main>
  );
}

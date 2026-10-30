import { Suspense } from "react";
import { TicketDetail } from "@/components/tickets/ticket-detail";

export default function TicketPage({ params }: PageProps<"/tickets/[name]">) {
  return (
    <Suspense>
      <TicketDetail params={params} />
    </Suspense>
  );
}

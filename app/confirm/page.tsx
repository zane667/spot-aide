import { ConfirmView } from "@/components/ConfirmView";
import { ConfirmPageSkeleton } from "@/components/Skeleton";
import { Suspense } from "react";

export default function ConfirmPage() {
  return (
    <Suspense fallback={<ConfirmPageSkeleton />}>
      <ConfirmView />
    </Suspense>
  );
}

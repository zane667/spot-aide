import { ThanksPageSkeleton } from "@/components/Skeleton";
import { ThanksView } from "@/components/ThanksView";
import { Suspense } from "react";

export default function ThanksPage() {
  return (
    <Suspense fallback={<ThanksPageSkeleton />}>
      <ThanksView />
    </Suspense>
  );
}

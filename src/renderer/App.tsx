import { LinkbookBoard } from "@/components/linkbook/linkbook-board";
import type { LibraryRecovery } from "@/shared/ipc";

// Was src/app/page.tsx.
export function App({ recovery }: { recovery: LibraryRecovery | null }) {
  return (
    <div className="h-dvh">
      <LinkbookBoard recovery={recovery} />
    </div>
  );
}

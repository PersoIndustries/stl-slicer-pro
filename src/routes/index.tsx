import { createFileRoute } from "@tanstack/react-router";
import StlSlicerApp from "@/components/StlSlicerApp";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <>
      <StlSlicerApp />
      <Toaster theme="dark" />
    </>
  );
}

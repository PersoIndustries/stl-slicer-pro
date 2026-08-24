import { createFileRoute } from "@tanstack/react-router";
import StlSlicerApp from "@/components/StlSlicerApp";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "STL Slicer - Corta modelos 3D en el navegador" },
      { name: "description", content: "Aplicación 100% client-side para cortar, reparar y exportar modelos 3D STL con planos de corte, pines y visualización en tiempo real." },
      { property: "og:title", content: "STL Slicer - Corta modelos 3D en el navegador" },
      { property: "og:description", content: "Aplicación 100% client-side para cortar, reparar y exportar modelos 3D STL con planos de corte, pines y visualización en tiempo real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Index() {
  return (
    <>
      <StlSlicerApp />
      <Toaster theme="dark" />
    </>
  );
}

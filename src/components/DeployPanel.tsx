import { useState } from "react";
import { Rocket, ExternalLink, Copy, Check, Terminal, FileJson, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export default function DeployPanel() {
  const [copied, setCopied] = useState(false);

  const netlifyToml = `[build]
  command = "bun run build"
  publish = "dist"

[functions]
  directory = ".netlify/functions-internal"
`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado al portapapeles");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5 mt-4">
      <section className="space-y-2">
        <SectionTitle>Despliegue en Netlify</SectionTitle>
        <p className="text-xs text-muted-foreground">
          El proyecto está configurado para generar una función SSR compatible con Netlify. Puedes desplegar conectando tu repositorio o usando el CLI.
        </p>
      </section>

      <section>
        <SectionTitle>Botón de deploy (Git)</SectionTitle>
        <p className="text-xs text-muted-foreground mb-2">
          Si tienes el código en GitHub, pulsa para iniciar el deploy en Netlify.
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="w-full"
          onClick={() => {
            window.open("https://app.netlify.com/start", "_blank", "noopener,noreferrer");
          }}
        >
          <Globe className="h-3.5 w-3.5 mr-1.5" /> Abrir Netlify
          <ExternalLink className="h-3 w-3 ml-2 opacity-70" />
        </Button>
      </section>

      <Separator />

      <section className="space-y-2">
        <SectionTitle>Con CLI (Netlify CLI)</SectionTitle>
        <p className="text-xs text-muted-foreground">
          Instala e inicia sesión. Luego ejecuta en el directorio del proyecto:
        </p>
        <pre className="font-mono text-[11px] bg-muted/40 rounded p-2.5 overflow-x-auto">
{`npm install -g netlify-cli
netlify login
netlify deploy --build --prod`}
        </pre>
      </section>

      <Separator />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionTitle>netlify.toml</SectionTitle>
          <Button size="sm" variant="ghost" className="h-6" onClick={() => copyToClipboard(netlifyToml)}>
            {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Ya está creado en la raíz del proyecto. Netlify lo detecta automáticamente.
        </p>
        <div className="rounded border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1.5">
            <FileJson className="h-3.5 w-3.5" />
            <span>netlify.toml</span>
          </div>
          <pre className="font-mono text-[11px] bg-muted/40 rounded p-2.5 overflow-x-auto">
            {netlifyToml}
          </pre>
        </div>
      </section>

      <Separator />

      <section className="space-y-2">
        <SectionTitle>Notas importantes</SectionTitle>
        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
          <li>
            <strong>Build local:</strong> el sandbox de Lovable fuerza el preset de Cloudflare, así que no podrás probar el output Netlify aquí. El despliegue externo sí lo respetará.
          </li>
          <li>
            <strong>SSR:</strong> TanStack Start genera una función serverless en <code>.netlify/functions-internal/main.mjs</code>.
          </li>
          <li>
            <strong>Assets:</strong> los archivos estáticos se sirven desde <code>dist/</code>.
          </li>
        </ul>
      </section>

      <div className="pt-1">
        <Button
          className="w-full"
          size="sm"
          onClick={() => {
            window.open("https://docs.netlify.com/frameworks/tanstack-start/", "_blank", "noopener,noreferrer");
          }}
        >
          <Rocket className="h-4 w-4 mr-2" />
          Ver guía de Netlify
          <ExternalLink className="h-3 w-3 ml-2 opacity-70" />
        </Button>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{children}</Label>;
}

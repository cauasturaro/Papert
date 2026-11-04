import Link from "next/link";
import type { ComponentType } from "react";
import { Navbar } from "@/components/app/navbar";
import { Badge } from "@/components/ui/badge/badge";
import { buttonVariants } from "@/components/ui/button/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card/card";
import {
  FileIcon,
  PapertMark,
  RouteIcon,
  SparklesIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

const features: {
  title: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  {
    title: "A real workspace",
    description:
      "Write multi-file projects in a browser editor with autosave, syntax checks and recovery when you lose connection.",
    Icon: FileIcon,
  },
  {
    title: "Seymour, your tutor",
    description:
      "Ask for a focused hint, a step-by-step explanation or a review. Seymour reads your saved code and guides instead of solving.",
    Icon: SparklesIcon,
  },
  {
    title: "Step-by-step roadmaps",
    description:
      "Each step has a challenge and clear acceptance criteria. An approved analysis unlocks the next one.",
    Icon: RouteIcon,
  },
];

export default function Home() {
  return (
    <>
      <Navbar />

      <main className="flex flex-1 flex-col">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-[1fr_1.1fr] lg:py-24">
          <div className="flex flex-col gap-6">
            <Badge variant="secondary" className="w-fit">
              Learn software development by building
            </Badge>

            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Learn by building, with a tutor at your side.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Build your development skills with a private study space and
              Seymour, your AI tutor.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                className={cn(buttonVariants({ size: "lg" }))}
                href="/study"
              >
                Open your study space
              </Link>
              <Link
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                )}
                href="/account"
              >
                Sign in or create an account
              </Link>
            </div>
          </div>

          <ProductPreview />
        </section>

        <section
          aria-labelledby="features-title"
          className="border-t border-border bg-muted/40"
        >
          <div className="mx-auto w-full max-w-6xl px-6 py-16">
            <h2
              id="features-title"
              className="mb-8 text-2xl font-semibold tracking-tight"
            >
              Everything you need to practice
            </h2>

            <div className="grid gap-4 md:grid-cols-3">
              {features.map(({ title, description, Icon }) => (
                <Card key={title}>
                  <CardHeader>
                    <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                      <Icon className="size-5" />
                    </span>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <PapertMark className="size-4" />
            Papert
          </span>
          <span>Learn by building.</span>
        </div>
      </footer>
    </>
  );
}

// Decorative miniature of the study space, built from theme tokens.
function ProductPreview() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-lg border border-border bg-card shadow-xl shadow-foreground/5"
    >
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="ml-3 text-xs text-muted-foreground">
          Roadmap › Build a REST endpoint
        </span>
      </div>

      <div className="grid h-72 grid-cols-[7rem_1fr_9rem] text-xs">
        <div className="space-y-2 border-r border-border bg-muted/50 p-3 font-mono text-muted-foreground">
          <p>▾ src</p>
          <p className="rounded-sm bg-accent px-1 text-foreground">
            &nbsp;&nbsp;server.ts
          </p>
          <p>&nbsp;&nbsp;routes.ts</p>
          <p>package.json</p>
        </div>

        <div className="space-y-1.5 p-3 font-mono">
          <p>
            <span className="text-ring">import</span> express{" "}
            <span className="text-ring">from</span>{" "}
            <span className="text-success">&quot;express&quot;</span>;
          </p>
          <p>&nbsp;</p>
          <p>
            <span className="text-ring">const</span> app = express();
          </p>
          <p>
            app.get(<span className="text-success">&quot;/users&quot;</span>,
            handler);
          </p>
          <p className="text-muted-foreground">{"// TODO: paginate"}</p>
        </div>

        <div className="flex flex-col gap-2 border-l border-border p-3">
          <p className="font-semibold">Seymour</p>
          <p className="rounded-md bg-muted p-2 text-muted-foreground">
            What should happen when the page is out of range?
          </p>
          <p className="mt-auto rounded-md border border-border p-2 text-muted-foreground">
            Ask anything…
          </p>
        </div>
      </div>
    </div>
  );
}

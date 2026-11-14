import type { ComponentType } from "react";
import { Navbar } from "@/components/app/navbar";
import { Badge } from "@/components/ui/badge/badge";
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
import { HeroActions } from "./hero-actions";

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

const showcaseSteps = [
  {
    title: "Define a resource and its operations",
    challenge:
      "Model a small resource and list the routes that read and change it.",
  },
  {
    title: "Narrow untrusted input before using it",
    challenge:
      "Validate request bodies so bad input never reaches your handlers.",
  },
  {
    title: "Distinguish an absent resource from a bad request",
    challenge: "Answer 404 and 400 for the right reasons, with clear messages.",
  },
  {
    title: "Finish the boundary with consistent failures",
    challenge: "Give every error the same shape so clients can rely on it.",
  },
];

const loop = [
  {
    title: "Pick a goal",
    description:
      "Start a community roadmap or describe what you want to build and get one made for you.",
  },
  {
    title: "Write the code",
    description:
      "Each step has a challenge with clear criteria. Build it in your own workspace.",
  },
  {
    title: "Get feedback",
    description:
      "Ask for an analysis of your solution, or ask Seymour when you are stuck. Approval unlocks the next step.",
  },
];

export default function Home() {
  return (
    <>
      <Navbar />

      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col">
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

            <HeroActions />
          </div>

          <ProductPreview />
        </section>

        <section
          aria-labelledby="loop-title"
          className="border-t border-border"
        >
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2">
            <div className="space-y-6">
              <h2
                id="loop-title"
                className="text-2xl font-semibold tracking-tight"
              >
                How learning works in Papert
              </h2>

              <ol className="space-y-4">
                {loop.map((item, index) => (
                  <li key={item.title} className="flex gap-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {index + 1}
                    </span>

                    <span className="space-y-1">
                      <span className="block font-medium">{item.title}</span>
                      <span className="block text-sm text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <RoadmapShowcase />
          </div>
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

// A static example of a roadmap from the catalog; nothing is loaded.
function RoadmapShowcase() {
  return (
    <Card aria-labelledby="showcase-title">
      <CardHeader>
        <p className="text-xs font-medium text-muted-foreground uppercase">
          Example roadmap
        </p>
        <CardTitle as="h3" id="showcase-title">
          Building a REST API with Express and TypeScript
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <span>4 steps</span>
          <Badge variant="secondary" size="sm">
            Beginner
          </Badge>
        </CardDescription>
      </CardHeader>

      <ol className="space-y-3 px-6 pb-6">
        {showcaseSteps.map((step, index) => (
          <li
            key={step.title}
            className="space-y-1 rounded-md border border-border p-3"
          >
            <p className="text-xs font-medium text-muted-foreground">
              Step {index + 1}
            </p>
            <p className="text-sm font-medium">{step.title}</p>
            <p className="text-sm text-muted-foreground">
              Challenge: {step.challenge}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// A responsive example of the study space, built from theme tokens.
function ProductPreview() {
  return (
    <div
      role="img"
      aria-label="Study space example: a REST endpoint beside Seymour’s pagination question"
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

      <div className="grid min-h-72 grid-cols-1 text-xs sm:h-72 sm:grid-cols-[7rem_minmax(0,1fr)_9rem]">
        <div className="hidden space-y-2 border-r border-border bg-muted/50 p-3 font-mono text-muted-foreground sm:block">
          <p>▾ src</p>
          <p className="rounded-sm bg-accent px-1 text-foreground">
            &nbsp;&nbsp;server.ts
          </p>
          <p>&nbsp;&nbsp;routes.ts</p>
          <p>package.json</p>
        </div>

        <div className="min-w-0 space-y-1.5 p-3 font-mono wrap-anywhere">
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

        <div className="flex min-w-0 flex-col gap-2 border-t border-border p-3 sm:border-t-0 sm:border-l">
          <p className="font-semibold">Seymour</p>
          <p className="rounded-md bg-muted p-2 text-muted-foreground">
            What should happen when the page is out of range?
          </p>
          <p className="mt-auto hidden rounded-md border border-border p-2 text-muted-foreground sm:block">
            Ask anything…
          </p>
        </div>
      </div>
    </div>
  );
}

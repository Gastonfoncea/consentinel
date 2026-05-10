import Link from "next/link";
import { PresenceBlob } from "@/components/presence-blob";
import { getSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export default async function LandingPage() {
  const session = await getSession();
  const isAuthed = Boolean(session.userId);
  const ctaHref = isAuthed ? "/dashboard" : "/login";
  const ctaLabel = isAuthed ? "Ir al dashboard" : "Probar el demo";

  return (
    <main className="flex min-h-screen flex-col bg-bg text-text">
      <Nav />
      <Hero ctaHref={ctaHref} ctaLabel={ctaLabel} />
      <PoweredBy />
      <ProblemSection />
      <BehaviorGraphSection />
      <IntentDriftSection />
      <StepUpSection />
      <PipelineSection />
      <TeamSection />
      <FinalCta ctaHref={ctaHref} ctaLabel={ctaLabel} />
      <Footer />
    </main>
  );
}

// --------------------------------------------------------------------
// Nav
// --------------------------------------------------------------------

const NAV_LINKS = [
  { href: "#problema", label: "Problema" },
  { href: "#features", label: "Cómo funciona" },
  { href: "#flow", label: "Flow" },
  { href: "#equipo", label: "Equipo" },
];

function Nav() {
  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-border/60 bg-bg/80 px-6 py-4 backdrop-blur-md sm:px-10 sm:py-5 lg:px-20">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-accent shadow-glow-accent" />
        <span className="font-mono text-sm tracking-wide text-text">consentinel</span>
      </div>
      <div className="hidden items-center gap-8 md:flex">
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="font-mono text-xs uppercase tracking-wider text-muted transition hover:text-text"
          >
            {link.label}
          </a>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <a
          href="https://github.com/platanus-hack/platanus-hack-26-ar-team-15"
          target="_blank"
          rel="noreferrer"
          className="hidden font-mono text-xs uppercase tracking-wider text-muted transition hover:text-text sm:inline"
        >
          GitHub ↗
        </a>
        <Link
          href="/login"
          className="rounded-md border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted transition hover:border-accent hover:text-accent"
        >
          Login
        </Link>
      </div>
    </nav>
  );
}

// --------------------------------------------------------------------
// Hero
// --------------------------------------------------------------------

function Hero({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  return (
    <section className="relative grid grid-cols-1 items-center gap-12 px-8 pb-24 pt-16 sm:px-12 sm:pb-32 sm:pt-20 lg:min-h-[calc(100vh-5rem)] lg:grid-cols-[1.1fr_1fr] lg:gap-20 lg:px-20 lg:pb-0 lg:pt-0">
      <div className="flex flex-col gap-7 lg:max-w-2xl">
        <h1 className="text-4xl font-medium leading-[1.05] tracking-tight text-text sm:text-5xl lg:text-[5rem]">
          Pagos automáticos, sin perder el control.
        </h1>
        <p className="max-w-md text-base leading-[1.6] text-muted sm:text-lg">
          Consentinel evalúa cada transfer que tu asistente intenta hacer.
          Frena lo desconocido, deja pasar lo confiable, te pide tu firma
          cuando duda.
        </p>
        <div className="flex flex-wrap items-center gap-6 pt-2">
          <Link
            href={ctaHref}
            className="group inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-medium text-bg transition hover:bg-accent/90"
          >
            {ctaLabel}
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
          <a
            href="#features"
            className="font-mono text-xs uppercase tracking-wider text-muted transition hover:text-text"
          >
            Cómo funciona ↓
          </a>
        </div>
      </div>
      <div
        className="relative mx-auto aspect-square w-full max-w-sm sm:max-w-md lg:max-w-none lg:justify-self-end"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(103, 183, 216, 0.18), transparent 70%)",
        }}
      >
        <PresenceBlob state="idle" />
      </div>
    </section>
  );
}

// --------------------------------------------------------------------
// Powered by — small monochrome marks
// --------------------------------------------------------------------

function PoweredBy() {
  return (
    <section className="border-y border-border bg-surface/20 px-8 py-10 sm:px-12 lg:px-20">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-muted/60">
          Powered by
        </span>
        <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {BRANDS.map((b) => (
            <li
              key={b.name}
              className="flex items-center gap-2.5 text-text/70 transition hover:text-text"
            >
              <span className="flex h-5 w-5 items-center justify-center">{b.mark}</span>
              <span className="text-sm tracking-tight">{b.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// Lightweight monochrome marks. Not pixel-perfect brand replicas — just
// recognizable silhouettes paired with the wordmark, all in the same
// optical weight as the surrounding text. Brand assets in production
// would be swapped for the official SVGs.
const BRANDS = [
  {
    name: "Anthropic",
    mark: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-5 w-5">
        <path d="M7.2 4.8h3.7l5.9 14.4h-3.7l-1.2-3H7.7l-1.2 3H2.8L7.2 4.8zm1.4 8.4h3.4l-1.7-4.4-1.7 4.4z" />
        <path d="M14.4 4.8h3.7l5.9 14.4h-3.7L14.4 4.8z" />
      </svg>
    ),
  },
  {
    name: "ElevenLabs",
    mark: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-5 w-5">
        <rect x="6" y="4" width="3.5" height="16" rx="1" />
        <rect x="14.5" y="4" width="3.5" height="16" rx="1" />
      </svg>
    ),
  },
  {
    name: "Base",
    mark: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-5 w-5">
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
  {
    name: "Vercel",
    mark: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-5 w-5">
        <path d="M12 2L22 20H2L12 2z" />
      </svg>
    ),
  },
];

// --------------------------------------------------------------------
// Problem section — one accent only
// --------------------------------------------------------------------

function ProblemSection() {
  return (
    <section
      id="problema"
      className="border-b border-border px-8 py-32 sm:px-12 sm:py-40 lg:px-20 lg:py-48"
    >
      <div className="mx-auto max-w-3xl">
        <SectionKicker label="el problema" />
        <h2 className="mt-6 text-3xl font-medium leading-[1.15] tracking-tight text-text sm:text-5xl">
          Le diste a tu agente acceso a tu plata.
          <br />
          ¿Le diste también el criterio para usarla bien?
        </h2>
        <p className="mt-12 text-lg leading-[1.6] text-muted sm:text-xl">
          Tu agente sabe ejecutar pagos. Lo que no sabe es lo que vos sí:
          que a Juan le pagás 20 USDC, no 350. Que la wallet vieja no se
          cambia por mail. Que un correo bien escrito no es prueba de nada.
        </p>
        <blockquote className="mt-12 rounded-2xl border border-border bg-surface/40 p-6 font-mono text-sm leading-relaxed text-text/85 sm:p-7">
          <p className="text-muted">From: juan@&lt;dominio-parecido&gt;.com</p>
          <p className="mt-4 text-text">
            "Hola, cambié de wallet. Mandame los 20 USDC ahí:"
          </p>
          <p className="mt-1 text-accent">0x9a3F7e4D8b2c5A6f...</p>
        </blockquote>
        <p className="mt-12 text-lg leading-[1.6] text-text sm:text-xl">
          Sin Consentinel, el pago sale.
          <br />
          Con Consentinel, te pregunta primero.
        </p>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------
// Feature sections — text + ActivityPanel-style frame
// --------------------------------------------------------------------

function BehaviorGraphSection() {
  return (
    <FeatureLayout
      anchorId="features"
      kicker="behavior graph"
      title="Tu kernel reconoce a quién le pagás siempre."
      body="Aprendo el destinatario, el monto y la frecuencia. Cuando algo encaja con tu historial, lo dejo pasar sin fricción. Cuando no, lo evalúo aparte."
    >
      <ActivityPanelFrame
        sectionLabel="Reciente"
        cards={[
          {
            status: "approved",
            headline: "Tu asistente le mandó 20 USDC a Juan",
            time: "hace 2d",
            reasoning:
              "Lo conozco — le mandaste varias veces esta semana, siempre por montos similares.",
          },
          {
            status: "approved",
            headline: "Tu asistente le mandó 25 USDC a Juan",
            time: "hace 4d",
            reasoning:
              "Mismo destinatario, monto dentro del rango habitual.",
          },
          {
            status: "approved",
            headline: "Tu asistente le mandó 20 USDC a Juan",
            time: "hace 1w",
            reasoning: "Pago recurrente, dejo pasar.",
          },
        ]}
      />
    </FeatureLayout>
  );
}

function IntentDriftSection() {
  return (
    <FeatureLayout
      reverse
      kicker="intent drift detection"
      title="Detecto cuando el plan cambió en el camino."
      body="Comparo tu última instrucción con el pago que el agente está por ejecutar. Si el destinatario, el monto o el asset no son los mismos, te aviso antes de seguir."
    >
      <ActivityPanelFrame
        sectionLabel="Necesito tu confirmación"
        emphasizeLabel
        cards={[
          {
            status: "needs_biometric",
            headline: "Tu asistente quiere mandar 20 USDC a una wallet nueva",
            time: "ahora",
            reasoning:
              "Esa wallet no la vi nunca — nunca le mandaste nada. La pista vino de un mail. Puede ser phishing.",
          },
        ]}
      />
    </FeatureLayout>
  );
}

function StepUpSection() {
  return (
    <FeatureLayout
      kicker="step-up biométrico"
      title="Cuando duda, te pide tu firma humana."
      body="FaceID, TouchID o passkey. La aprobación llega como push al cel — incluso con la app cerrada — y la decisión cierra en segundos."
    >
      <PushFrame
        title="Consentinel · Verificación pendiente"
        body="Tu asistente quiere mandar 20 USDC a una wallet nueva. Tocá para verificar."
      />
    </FeatureLayout>
  );
}

interface FeatureLayoutProps {
  anchorId?: string;
  kicker: string;
  title: string;
  body: string;
  reverse?: boolean;
  children: React.ReactNode;
}

function FeatureLayout({
  anchorId,
  kicker,
  title,
  body,
  reverse = false,
  children,
}: FeatureLayoutProps) {
  return (
    <section
      id={anchorId}
      className="border-b border-border px-8 py-32 sm:px-12 sm:py-40 lg:px-20 lg:py-48"
    >
      <div
        className={cn(
          "mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-2 lg:gap-24",
          reverse && "lg:[&>:first-child]:order-last"
        )}
      >
        <div className="flex flex-col gap-6 lg:max-w-md">
          <SectionKicker label={kicker} />
          <h2 className="text-3xl font-medium leading-[1.15] tracking-tight text-text sm:text-5xl">
            {title}
          </h2>
          <p className="text-lg leading-[1.6] text-muted">{body}</p>
        </div>
        <div className="lg:max-w-md lg:justify-self-end lg:w-full">
          {children}
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------
// ActivityPanelFrame — chrome that mirrors the dashboard's right column
// --------------------------------------------------------------------

interface ActivityCard {
  status: "approved" | "blocked" | "needs_biometric" | "thinking";
  headline: string;
  time: string;
  reasoning: string;
}

interface ActivityPanelFrameProps {
  sectionLabel: string;
  emphasizeLabel?: boolean;
  cards: ActivityCard[];
}

function ActivityPanelFrame({
  sectionLabel,
  emphasizeLabel = false,
  cards,
}: ActivityPanelFrameProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface/30 shadow-glow-accent/0 transition-shadow hover:shadow-glow-accent">
      {/* Panel header — same shape as components/activity-panel.tsx */}
      <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div>
          <h3 className="text-sm font-medium text-text">Actividad</h3>
          <p className="text-xs text-muted">Lo que tu asistente intenta hacer</p>
        </div>
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-allow">
          <span className="h-1.5 w-1.5 rounded-full bg-allow shadow-glow-allow" />
          live
        </span>
      </header>

      {/* Section header */}
      <div className="px-5 pt-5">
        <div className="flex items-center gap-2">
          {emphasizeLabel && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
          )}
          <h4
            className={cn(
              "font-mono text-[10px] uppercase tracking-[0.25em]",
              emphasizeLabel ? "text-accent" : "text-muted/70"
            )}
          >
            {sectionLabel}
          </h4>
        </div>
      </div>

      {/* Cards */}
      <ul className="flex flex-col gap-2 px-5 pb-5 pt-3">
        {cards.map((c, i) => (
          <li key={i}>
            <article
              className={cn(
                "rounded-xl border bg-surface/40 px-4 py-3",
                emphasizeLabel
                  ? "border-2 border-accent/50 bg-accent/[0.06]"
                  : historyBorderClass(c.status)
              )}
            >
              <header className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusGlyph status={c.status} emphasized={emphasizeLabel} />
                  <p className="truncate text-sm text-text/85">{c.headline}</p>
                </div>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted/70">
                  {c.time}
                </span>
              </header>
              <p className="mt-2 text-sm leading-relaxed text-text/75">
                {c.reasoning}
              </p>
              {emphasizeLabel && (
                <button
                  type="button"
                  className="mt-4 rounded-full bg-accent px-4 py-2 text-xs font-medium text-bg transition hover:bg-accent/90"
                >
                  Confirmar con FaceID
                </button>
              )}
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusGlyph({
  status,
  emphasized = false,
}: {
  status: ActivityCard["status"];
  emphasized?: boolean;
}) {
  if (emphasized) {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-[10px] text-accent">
        ⚡
      </span>
    );
  }
  switch (status) {
    case "approved":
      return (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-allow/15 font-mono text-[10px] text-allow">
          ✓
        </span>
      );
    case "blocked":
      return (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-deny/15 font-mono text-[10px] text-deny">
          ✕
        </span>
      );
    case "thinking":
      return (
        <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
          <span className="absolute h-2 w-2 animate-ping rounded-full bg-muted/60" />
          <span className="relative h-2 w-2 rounded-full bg-muted" />
        </span>
      );
    case "needs_biometric":
      return (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-[10px] text-accent">
          ⚡
        </span>
      );
  }
}

function historyBorderClass(status: ActivityCard["status"]): string {
  switch (status) {
    case "approved":
      return "border-border";
    case "blocked":
      return "border-border";
    case "thinking":
      return "border-border";
    default:
      return "border-border";
  }
}

// --------------------------------------------------------------------
// PushFrame — iOS/Android-style notification mockup
// --------------------------------------------------------------------

function PushFrame({ title, body }: { title: string; body: string }) {
  return (
    <div className="relative">
      <div className="rounded-2xl border border-border bg-surface/85 p-4 shadow-glow-accent backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                consentinel
              </p>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted/70">
                ahora
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-text">{title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{body}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------
// Pipeline
// --------------------------------------------------------------------

const PIPELINE_STEPS = [
  {
    n: "1",
    label: "Pago propuesto",
    body: "Tu agente intenta llamar wallet.transfer con un destinatario, un monto y un asset.",
  },
  {
    n: "2",
    label: "Kernel evalúa",
    body: "Behavior graph, intent drift, x402 context y risk score corren en paralelo. Resultado en milisegundos.",
  },
  {
    n: "3",
    label: "Outcome",
    body: "allow · step-up · deny. Si pido tu firma, te llega un push al cel — incluso con la app cerrada.",
  },
];

function PipelineSection() {
  return (
    <section
      id="flow"
      className="border-b border-border bg-surface/20 px-8 py-32 sm:px-12 sm:py-40 lg:px-20 lg:py-48"
    >
      <div className="mx-auto max-w-5xl">
        <SectionKicker label="el flow" />
        <h2 className="mt-6 max-w-2xl text-3xl font-medium leading-[1.15] tracking-tight text-text sm:text-5xl">
          De la intención al pago.
        </h2>
        <div className="mt-16 grid gap-12 lg:grid-cols-3 lg:gap-8">
          {PIPELINE_STEPS.map((s, i) => (
            <div key={s.n} className="relative flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-accent/40 bg-accent/10 font-mono text-sm text-accent">
                  {s.n}
                </span>
                <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
                  {s.label}
                </h3>
              </div>
              <p className="text-base leading-[1.6] text-text/85">{s.body}</p>
              {i < PIPELINE_STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-4 top-4 hidden text-muted/40 lg:block"
                >
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------
// Team
// --------------------------------------------------------------------

const TEAM = [
  { name: "Alejandro Repetto", role: "kernel & risk engine" },
  { name: "Gaston Foncea", role: "frontend & passkey auth" },
  { name: "Tomas Mazzitello", role: "MCP server & wallet layer" },
];

function TeamSection() {
  return (
    <section
      id="equipo"
      className="border-b border-border px-8 py-32 sm:px-12 sm:py-40 lg:px-20 lg:py-48"
    >
      <div className="mx-auto max-w-3xl">
        <SectionKicker label="el equipo" />
        <h2 className="mt-6 text-3xl font-medium leading-[1.15] tracking-tight text-text sm:text-5xl">
          Tres developers, treinta y seis horas.
        </h2>
        <ul className="mt-12 flex flex-col divide-y divide-border">
          {TEAM.map((m) => (
            <li
              key={m.name}
              className="flex flex-col gap-1 py-6 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
            >
              <span className="text-lg font-medium text-text">{m.name}</span>
              <span className="font-mono text-xs uppercase tracking-wider text-muted">
                {m.role}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------
// Final CTA + Footer
// --------------------------------------------------------------------

function FinalCta({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  return (
    <section className="px-8 py-32 sm:px-12 sm:py-40 lg:px-20 lg:py-48">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <SectionKicker label="probalo" />
        <h2 className="mt-6 text-3xl font-medium leading-[1.15] tracking-tight text-text sm:text-5xl">
          Un agente real, una wallet de testnet
          <br className="hidden sm:inline" /> y un correo que intenta robarte la plata.
        </h2>
        <p className="mt-6 max-w-xl text-lg leading-[1.6] text-muted">
          El demo arranca con un pago sano y termina con uno donde un correo
          suplanta al destinatario. Vas a ver cuándo el kernel deja pasar y
          cuándo te avisa.
        </p>
        <Link
          href={ctaHref}
          className="group mt-10 inline-flex items-center gap-2 rounded-full bg-accent px-8 py-4 text-base font-medium text-bg transition hover:bg-accent/90"
        >
          {ctaLabel}
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border px-8 py-10 sm:px-12 lg:px-20">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 font-mono text-xs text-muted sm:flex-row">
        <p>Built for Platanus Hack 2026</p>
        <p>Alejandro Repetto · Gaston Foncea · Tomas Mazzitello</p>
      </div>
    </footer>
  );
}

// --------------------------------------------------------------------
// Shared bits
// --------------------------------------------------------------------

function SectionKicker({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.35em] text-muted/70">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      {label}
    </span>
  );
}

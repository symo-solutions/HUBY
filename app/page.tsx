import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ArrowRight, BarChart3, Bot, Zap } from "lucide-react";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-white to-slate-50">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="h-4 w-4" />
          </div>
          Smart Ads Controller
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-ghost">
            Connexion
          </Link>
          <Link href="/register" className="btn-primary">
            Commencer
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <span className="badge bg-muted text-muted-foreground">
          MVP — Meta Ads + Google Ads
        </span>
        <h1 className="mt-6 text-5xl font-bold tracking-tight">
          Pilotez vos pubs payantes
          <br /> sans les surveiller 24h/24.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Connectez vos comptes Meta Ads et Google Ads, suivez toutes vos
          campagnes dans un tableau de bord unique, et laissez Smart Ads
          Controller mettre en pause les flops et booster les gagnantes pour
          vous.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Link href="/register" className="btn-primary">
            Créer un compte <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/login" className="btn-outline">
            J&apos;ai déjà un compte
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-24 md:grid-cols-3">
        <Feature
          icon={<BarChart3 className="h-5 w-5" />}
          title="Tableau de bord unifié"
          description="Dépense, impressions, CTR, ROAS — agrégés depuis Meta et Google en un seul endroit."
        />
        <Feature
          icon={<Bot className="h-5 w-5" />}
          title="Règles automatiques"
          description="Mettez en pause les campagnes à faible ROAS, scalez les gagnantes, signalez les contre-performances — automatiquement."
        />
        <Feature
          icon={<Zap className="h-5 w-5" />}
          title="Mettez et oubliez"
          description="Synchronisation toutes les 6 heures. Vous n&apos;êtes notifié que lorsqu&apos;une action requiert votre attention."
        />
      </section>
    </main>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="card p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

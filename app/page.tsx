import Link from "next/link";
import { CalendarDays, Users, UserRound, ArrowRight, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5">
          <Link href="/" className="flex items-center gap-3"><HeartHandshake className="h-7 w-7 text-indigo-600" aria-hidden="true" /><span><span className="block text-xl font-bold">Axis</span><span className="block text-xs text-stone-500">Psicólogos en Colombia</span></span></Link>
          <Button asChild variant="outline"><Link href="/sign-in">Iniciar sesión</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
        <div className="max-w-2xl">
          <p className="mb-4 text-sm font-semibold text-indigo-600">Espacio de trabajo del equipo</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Más claridad para organizar cada atención.</h1>
          <p className="mt-6 text-lg leading-relaxed text-stone-600">Gestiona citas, pacientes, psicólogos y reservas de consultorio de Psicólogos en Colombia desde un mismo lugar.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Button asChild size="lg"><Link href="/sign-in">Entrar a Axis<ArrowRight className="ml-2 h-4 w-4" /></Link></Button><Button asChild size="lg" variant="outline"><Link href="/sign-up">Solicitar acceso al equipo</Link></Button></div>
          <p className="mt-4 text-sm text-stone-500">El acceso requiere una cuenta aprobada por administración.</p>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {[
            { title: "Agenda y consultorios", text: "Organiza citas y reservas. Consulta horarios y disponibilidad.", icon: CalendarDays },
            { title: "Pacientes", text: "Encuentra los datos de contacto y el historial de citas.", icon: Users },
            { title: "Equipo y administración", text: "Gestiona profesionales, pagos y tareas de atención según tu rol.", icon: UserRound },
          ].map(({ title, text, icon: Icon }) => <div key={title} className="rounded-2xl border bg-white p-6"><Icon className="mb-4 h-6 w-6 text-indigo-600" aria-hidden="true" /><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-relaxed text-stone-600">{text}</p></div>)}
        </div>
      </main>
      <footer className="mx-auto max-w-5xl px-5 pb-8 text-sm text-stone-500">Axis · Psicólogos en Colombia</footer>
    </div>
  );
}

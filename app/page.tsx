"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import Image from "next/image";

/**
 * HomePage Component - Landing Page Principal
 *
 * Este componente representa la página de inicio pública de la plataforma Axis Software.
 * Ha sido diseñado utilizando un enfoque Mobile-First y cuenta con múltiples secciones:
 *
 * 1. Hero Section (Dark Mode):
 *    - Diseño centrado en móviles y alineado a la izquierda en pantallas grandes (lg).
 *    - Paddings optimizados (`pt-10` en móvil) para aprovechar el espacio vertical.
 *    - Botones apilados en móvil y distribuidos en fila en escritorio.
 *    - Mockup interactivo (derecha) con efectos de hover (scale, translate) y eventos de mouse habilitados.
 *
 * 2. Feature Section (Light Mode):
 *    - Contenedor con alineación responsiva (`text-center` en móvil, `text-left` en desktop).
 *    - Lista de características convertidas en tarjetas interactivas (cards) con sombras y bordes sutiles.
 *    - Mockup móvil ajustado con márgenes seguros (`-left-2`, `-right-2`) para evitar desbordamiento en móviles.
 *    - Botón principal expansivo (`w-full`) en pantallas pequeñas para maximizar el área táctil.
 *
 * Nota: Todas las transiciones de las micro-interacciones (hover en mockups y tarjetas)
 * han sido ajustadas a `duration-150 ease-out` para ofrecer una respuesta rápida y elástica.
 */
export default function HomePage() {
  return (
    <div className="bg-gray-900 min-h-screen">
      {/* Header principal con z-50 para mantenerse por encima de todos los elementos (incluso mockups flotantes) */}
      <header className="absolute inset-x-0 top-0 z-50">
        <nav
          aria-label="Global"
          className="flex items-center justify-between p-6 lg:px-8"
        >
          <div className="flex lg:flex-1">
            <Link
              href="/"
              className="group -m-1.5 p-1.5 flex items-center gap-2.5"
            >
              <span className="sr-only">Axis</span>
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-[0_0_25px_rgba(99,102,241,0.6)]">
                <div className="absolute inset-0 rounded-xl bg-white/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100 mix-blend-overlay"></div>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="size-5 text-white relative z-10"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  />
                </svg>
              </div>
              <span className="font-bold text-2xl tracking-tight text-white flex items-baseline gap-1">
                Axis
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-300">
                  Software
                </span>
              </span>
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Wrapper: Usa overflow-hidden para asegurar que los elementos absolutos y animaciones no generen scroll horizontal indeseado en móviles */}
      <div className="relative isolate px-6 lg:px-8 overflow-hidden min-h-screen flex items-center">
        {/* Static Background */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-gray-900 to-gray-900"></div>
        <div className="absolute top-0 right-0 -z-10 w-[800px] h-[800px] bg-gradient-to-br from-purple-500/20 to-white/10 blur-[120px] rounded-full translate-x-1/3 -translate-y-1/4"></div>
        <div className="absolute bottom-0 left-0 -z-10 w-[600px] h-[600px] bg-purple-500/10 blur-[100px] rounded-full -translate-x-1/3 translate-y-1/4"></div>

        {/* HERO SECTION: Padding reducido en móviles (pt-10) para maximizar espacio vertical */}
        <div className="mx-auto max-w-7xl pt-10 pb-16 sm:pt-24 sm:pb-32 lg:pt-40 lg:pb-40 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 items-center">
            {/* Left Content (Alineación centralizada en móviles para un diseño más limpio) */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="text-center lg:text-left"
            >
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="mb-6 sm:mb-8 inline-flex cursor-pointer"
              >
                <div className="group relative rounded-full p-[1px] bg-gradient-to-r from-indigo-500/40 via-purple-500/40 to-indigo-500/40 overflow-hidden mx-auto lg:mx-0">
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-0 group-hover:opacity-20 transition-opacity duration-500 blur-md"></div>
                  <div className="relative flex items-center gap-2 rounded-full px-3 py-1.5 sm:px-4 sm:py-1.5 text-[11px] sm:text-sm leading-6 text-gray-200 bg-gray-900/90 backdrop-blur-xl">
                    <div className="flex items-center justify-center bg-indigo-500/20 text-indigo-400 rounded-full p-1 sm:p-1 border border-indigo-500/30 shrink-0">
                      <svg
                        className="w-3 h-3 sm:w-3.5 sm:h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        />
                      </svg>
                    </div>
                    <span className="truncate max-w-[170px] sm:max-w-none">
                      Certificaciones de sanidad actualizadas 2024.
                    </span>
                    <a
                      href="#"
                      className="font-semibold text-indigo-400 flex items-center group-hover:text-indigo-300 transition-colors ml-1 whitespace-nowrap"
                    >
                      Saber más
                      <svg
                        className="ml-1 w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform group-hover:translate-x-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </a>
                  </div>
                </div>
              </motion.div>

              <h1 className="text-[2.75rem] leading-[1.15] sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white mb-4 sm:mb-6">
                Sistema de Control Profesional para tu{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                  Empresa.
                </span>
              </h1>

              <p className="mt-4 sm:mt-6 text-[15px] sm:text-lg md:text-xl leading-relaxed text-gray-400 mb-8 sm:mb-10 max-w-2xl mx-auto lg:mx-0">
                Impulsa la eficiencia de tu negocio.{" "}
                <strong className="text-gray-200 font-medium">
                  Automatiza la gestión
                </strong>{" "}
                de servicios, simplifica la programación y obtén{" "}
                <strong className="text-gray-200 font-medium">
                  análisis precisos en tiempo real
                </strong>{" "}
                para tomar decisiones más inteligentes.
              </p>

              {/* Botones: Apilados en móvil (flex-col) con jerarquía visual (Primario Sólido vs Secundario Glassmorphism) */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 sm:gap-6 mt-6 w-full max-w-sm mx-auto lg:mx-0 sm:max-w-none">
                <Link
                  href="/sign-in"
                  className="w-full sm:w-auto group relative inline-flex items-center justify-center rounded-full bg-indigo-500 px-8 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:scale-105 hover:bg-indigo-400 hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] active:scale-95 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-indigo-500 overflow-hidden shadow-[0_0_15px_rgba(99,102,241,0.3)]"
                >
                  <span className="absolute inset-0 w-full h-full -mt-1 rounded-full opacity-30 bg-gradient-to-b from-transparent via-transparent to-black"></span>
                  <span className="relative">Iniciar Sesión</span>
                </Link>
                <Link
                  href="/sign-up"
                  className="w-full sm:w-auto group inline-flex items-center justify-center rounded-full px-8 py-3.5 text-sm font-semibold text-white ring-1 ring-white/10 bg-white/5 backdrop-blur-md transition-all duration-300 hover:bg-white/10 hover:ring-white/30 hover:scale-105 active:scale-95 shadow-lg"
                >
                  Registrarse
                  <span
                    aria-hidden="true"
                    className="ml-1.5 transition-transform group-hover:translate-x-1"
                  >
                    →
                  </span>
                </Link>
              </div>
            </motion.div>

            {/* Right Visual/Mockup */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
              className="relative hidden lg:block"
            >
              {/* Floating Dashboard Elements */}
              <div
                className="relative w-full max-w-lg mx-auto"
                style={{ perspective: "1000px" }}
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/30 to-purple-500/30 rounded-[2rem] transform rotate-3 scale-105 backdrop-blur-2xl blur-lg"></div>

                <motion.div
                  whileHover={{ rotateX: 5, rotateY: -5, scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="relative rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden border border-white/10 bg-white/5 group"
                >
                  {/* Se eliminó pointer-events-none del contenedor principal para permitir la interactividad con el ratón en todo el mockup */}
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900/50 via-transparent to-transparent opacity-40 z-10 pointer-events-none"></div>
                  <Image
                    src="/hero-dashboard.png"
                    alt="Axis Software Dashboard"
                    width={1024}
                    height={1024}
                    className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105 hidden dark:block"
                    priority
                  />
                  <Image
                    src="/hero-dashboard-light.png"
                    alt="Axis Software Dashboard"
                    width={1024}
                    height={1024}
                    className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105 block dark:hidden"
                    priority
                  />
                </motion.div>

                {/* Floating Notification */}
                <motion.div
                  animate={{ y: [0, -12, 0] }}
                  transition={{
                    repeat: Infinity,
                    duration: 4,
                    ease: "easeInOut",
                  }}
                  className="absolute -right-8 top-12 bg-gray-900/85 dark:bg-white/85 backdrop-blur-xl rounded-2xl p-4 shadow-[0_15px_35px_rgba(0,0,0,0.4)] dark:shadow-[0_15px_35px_rgba(0,0,0,0.1)] border border-white/10 dark:border-gray-200/50 flex items-center gap-4 w-56 z-20"
                >
                  <div className="w-10 h-10 rounded-full bg-green-500/20 dark:bg-green-100 flex items-center justify-center text-green-400 dark:text-green-600 shadow-[0_0_15px_rgba(34,197,94,0.3)] ring-1 ring-green-500/50 dark:ring-green-500/20">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-white dark:text-gray-900 leading-tight">
                      Sincronizado
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-0.5">
                      Dispositivo móvil
                    </div>
                  </div>
                </motion.div>

                {/* Floating Metric */}
                <motion.div
                  animate={{ y: [0, 12, 0] }}
                  transition={{
                    repeat: Infinity,
                    duration: 5,
                    ease: "easeInOut",
                    delay: 1,
                  }}
                  className="absolute -left-6 bottom-16 bg-gray-900/85 dark:bg-white/85 backdrop-blur-xl rounded-2xl p-4 shadow-[0_15px_35px_rgba(0,0,0,0.4)] dark:shadow-[0_15px_35px_rgba(0,0,0,0.1)] border border-white/10 dark:border-gray-200/50 flex items-center gap-4 z-20"
                >
                  <div className="w-10 h-10 rounded-full bg-indigo-500/30 dark:bg-indigo-100 flex items-center justify-center text-indigo-300 dark:text-indigo-600 shadow-[0_0_15px_rgba(99,102,241,0.4)] ring-1 ring-indigo-500/50 dark:ring-indigo-500/20">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                      />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-white dark:text-gray-900 leading-tight">
                      +35% Productividad
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-0.5">
                      Respecto al mes anterior
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Sección Secundaria (Light Mode): Altura compactada al reducir drásticamente los márgenes verticales (py-8 sm:py-12) */}
      <div className="relative isolate bg-white py-8 sm:py-12 overflow-hidden">
        {/* Background Pattern */}
        <div
          className="absolute inset-0 -z-10 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(#4f46e5 0.5px, transparent 0.5px)",
            backgroundSize: "24px 24px",
          }}
        ></div>
        <div className="absolute top-0 right-0 -z-10 h-[600px] w-[600px] translate-x-1/3 -translate-y-1/4 rounded-full bg-indigo-50 blur-3xl opacity-50"></div>
        <div className="absolute bottom-0 left-0 -z-10 h-[600px] w-[600px] -translate-x-1/3 translate-y-1/4 rounded-full bg-blue-50 blur-3xl opacity-50"></div>

        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:max-w-none grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left: Content */}
            {/* Alineación centralizada en móviles para evitar cortes de texto asimétricos */}
            <div className="lg:pr-8 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 shadow-sm mb-6 sm:mb-8 mx-auto lg:mx-0">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600"></span>
                </span>
                Disponible para Android
              </div>
              <h2 className="text-[2.5rem] font-extrabold tracking-tight text-gray-900 sm:text-5xl leading-[1.1] mb-4 sm:mb-0">
                Revisar Servicios,
                <br className="hidden sm:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 sm:ml-2 lg:ml-0">
                  donde quiera que estés.
                </span>
              </h2>
              <p className="mt-4 sm:mt-6 text-base sm:text-lg leading-relaxed sm:leading-8 text-gray-600 font-medium mx-auto lg:mx-0 max-w-xl">
                La app de Axis extiende el poder de tu panel de administración.
                Tus técnicos podrán gestionar sus servicios en tiempo real.
              </p>

              {/* Lista convertida en Tarjetas interactivas (Cards) con sombras y bordes sutiles */}
              <ul className="mt-8 sm:mt-10 space-y-4 text-gray-700">
                <li className="group flex flex-col sm:flex-row gap-4 items-center sm:items-start p-5 rounded-2xl bg-white shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-100 transition-all duration-300 cursor-default text-center sm:text-left">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 group-hover:scale-110 group-hover:shadow-indigo-500/30">
                    <svg
                      className="h-6 w-6 transition-colors duration-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 transition-colors group-hover:text-indigo-600 text-base sm:text-lg">
                      Seguimiento de rutas en tiempo real
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                      Conoce la ubicación exacta y optimiza los desplazamientos
                      de cada técnico.
                    </p>
                  </div>
                </li>
                <li className="group flex flex-col sm:flex-row gap-4 items-center sm:items-start p-5 rounded-2xl bg-white shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-100 transition-all duration-300 cursor-default text-center sm:text-left">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 group-hover:scale-110 group-hover:shadow-indigo-500/30">
                    <svg
                      className="h-6 w-6 transition-colors duration-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H3a2 2 0 01-2-2V9z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 transition-colors group-hover:text-indigo-600 text-base sm:text-lg">
                      Evidencia fotográfica
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                      Permite a tu equipo capturar y subir fotos para documentar
                      sus trabajos al instante.
                    </p>
                  </div>
                </li>
                <li className="group flex flex-col sm:flex-row gap-4 items-center sm:items-start p-5 rounded-2xl bg-white shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-100 transition-all duration-300 cursor-default text-center sm:text-left">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 group-hover:scale-110 group-hover:shadow-indigo-500/30">
                    <svg
                      className="h-6 w-6 transition-colors duration-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 transition-colors group-hover:text-indigo-600 text-base sm:text-lg">
                      Notificaciones push instantáneas
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                      Mantén a todos informados con alertas inmediatas sobre
                      nuevas tareas o cambios.
                    </p>
                  </div>
                </li>
              </ul>

              {/* Botón de Android centrado globalmente (justify-center absoluto sin clases 'lg') manteniendo el texto alineado a la izquierda junto al ícono */}
              <div className="mt-8 sm:mt-10 flex justify-center">
                <a
                  href="https://github.com/ServiLut/axis/releases/download/v2.0.0/axis.apk"
                  download
                  className="group flex items-center justify-center sm:justify-start gap-4 rounded-2xl bg-[#0f172a] px-6 py-4 text-white shadow-xl hover:bg-[#1e293b] hover:shadow-[0_15px_40px_-10px_rgba(61,220,132,0.4)] transition-all duration-500 hover:-translate-y-1.5 active:scale-[0.98] ring-1 ring-white/10 w-full sm:w-auto"
                >
                  <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-white/10 group-hover:bg-[#3ddc84]/20 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shrink-0">
                    <svg
                      viewBox="0 0 413.137 413.137"
                      className="h-6 w-6 sm:h-7 sm:w-7 text-[#3ddc84] group-hover:drop-shadow-[0_0_12px_rgba(61,220,132,0.8)] transition-all duration-300"
                    >
                      <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
                      <g
                        id="SVGRepo_tracerCarrier"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      ></g>
                      <g id="SVGRepo_iconCarrier">
                        <g>
                          <path
                            fill="currentColor"
                            d="M311.358,136.395H101.779c-4.662,0-8.441,3.779-8.441,8.441v175.749 c0,4.662,3.779,8.441,8.441,8.441h37.363v59.228c0,13.742,11.14,24.883,24.883,24.883l0,0c13.742,0,24.883-11.14,24.883-24.883 v-59.228h34.803v59.228c0,13.742,11.14,24.883,24.883,24.883l0,0c13.742,0,24.883-11.14,24.883-24.883v-59.228h37.882 c4.662,0,8.441-3.779,8.441-8.441V144.836C319.799,140.174,316.02,136.395,311.358,136.395z"
                          />
                          <path
                            fill="currentColor"
                            d="M57.856,136.354L57.856,136.354c-13.742,0-24.883,11.14-24.883,24.883v101.065 c0,13.742,11.14,24.883,24.883,24.883l0,0c13.742,0,24.883-11.14,24.883-24.883V161.237 C82.738,147.495,71.598,136.354,57.856,136.354z"
                          />
                          <path
                            fill="currentColor"
                            d="M355.281,136.354L355.281,136.354c-13.742,0-24.883,11.14-24.883,24.883v101.065 c0,13.742,11.14,24.883,24.883,24.883l0,0c13.742,0,24.883-11.14,24.883-24.883V161.237 C380.164,147.495,369.024,136.354,355.281,136.354z"
                          />
                          <path
                            fill="currentColor"
                            d="M103.475,124.069h205.692c5.366,0,9.368-4.943,8.266-10.195 c-6.804-32.428-27.45-59.756-55.465-75.543l17.584-31.727c1.19-2.148,0.414-4.855-1.734-6.045 c-2.153-1.193-4.856-0.414-6.046,1.734l-17.717,31.966c-14.511-6.734-30.683-10.495-47.734-10.495 c-17.052,0-33.224,3.761-47.735,10.495L140.869,2.292c-1.191-2.149-3.898-2.924-6.045-1.734c-2.148,1.19-2.924,3.897-1.734,6.045 l17.584,31.727c-28.015,15.788-48.661,43.115-55.465,75.544C94.106,119.126,98.108,124.069,103.475,124.069z M267.697,76.786 c0,5.282-4.282,9.565-9.565,9.565c-5.282,0-9.565-4.282-9.565-9.565c0-5.282,4.282-9.565,9.565-9.565 C263.415,67.221,267.697,71.504,267.697,76.786z M154.508,67.221c5.282,0,9.565,4.282,9.565,9.565c0,5.282-4.282,9.565-9.565,9.565 c-5.282,0-9.565-4.282-9.565-9.565C144.943,71.504,149.225,67.221,154.508,67.221z"
                          />
                        </g>
                      </g>
                    </svg>
                  </div>
                  <div className="flex flex-col justify-center text-left">
                    <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-0.5">
                      Descargar para Android
                    </div>
                    <div className="text-lg sm:text-xl font-black leading-none tracking-tight">
                      Axis v2.0
                    </div>
                  </div>
                </a>
              </div>
            </div>

            {/* Right: Phone Mockup (Enhanced) */}
            <div className="relative lg:ml-auto select-none mt-12 lg:mt-0">
              {/* Background Blob */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[500px] sm:w-[350px] sm:h-[550px] bg-gradient-to-br from-indigo-500/20 to-purple-500/20 blur-[60px] rounded-full -z-10"></div>

              {/* Floating Badge Left: Posicionamiento ajustado (-left-2) para evitar desbordamiento horizontal en celulares */}
              <div className="absolute top-24 -left-2 sm:-left-14 z-40 animate-[bounce_3s_infinite] will-change-transform transform-gpu bg-white rounded-2xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.2)] p-3 sm:p-4 flex items-center gap-3 sm:gap-4 border border-gray-100 hover:scale-105 transition-transform duration-300">
                <div className="bg-gradient-to-br from-green-400 to-green-500 p-2 sm:p-3 rounded-full text-white shadow-lg shadow-green-500/30">
                  <svg
                    className="w-4 h-4 sm:w-5 sm:h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-[9px] sm:text-[10px] text-gray-500 uppercase font-black tracking-widest mb-0.5">
                    Estado
                  </p>
                  <p className="text-xs sm:text-sm font-extrabold text-gray-900 leading-none">
                    Sincronizado
                  </p>
                </div>
              </div>

              {/* Floating Badge Right */}
              <div className="absolute bottom-40 -right-2 sm:-right-10 z-40 animate-[bounce_4s_infinite] will-change-transform transform-gpu bg-white rounded-2xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.2)] p-3 sm:p-4 flex items-center gap-3 sm:gap-4 border border-gray-100 hover:scale-105 transition-transform duration-300 delay-100">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 sm:p-3 rounded-full text-white shadow-lg shadow-blue-500/30">
                  <svg
                    className="w-4 h-4 sm:w-5 sm:h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-[9px] sm:text-[10px] text-gray-500 uppercase font-black tracking-widest mb-0.5">
                    Ubicación
                  </p>
                  <p className="text-xs sm:text-sm font-extrabold text-gray-900 leading-none">
                    En ruta
                  </p>
                </div>
              </div>

              {/* Phone Body */}
              {/* Contenedor principal del teléfono: Ancho fijo de 320px, que encaja perfectamente en pantallas móviles sin desbordarse */}
              <div className="relative mx-auto bg-gray-900 rounded-[3rem] h-[640px] w-[320px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.3)] z-10 p-[12px] ring-1 ring-gray-900/5">
                {/* Notch */}
                {/* Notch del teléfono: Simulación visual del hardware (cámara frontal) para mayor realismo estético */}
                <div className="absolute top-[12px] left-1/2 -translate-x-1/2 w-[120px] h-[28px] bg-black rounded-b-[1.25rem] z-30">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60px] h-[6px] bg-gray-800 rounded-full"></div>
                </div>

                {/* Side Buttons */}
                {/* Botones laterales físicos del teléfono (Silencio, Volumen, Encendido) construidos con posicionamiento absoluto */}
                <div className="h-[32px] w-[4px] bg-gray-800 absolute -start-[4px] top-[80px] rounded-s-lg"></div>
                <div className="h-[50px] w-[4px] bg-gray-800 absolute -start-[4px] top-[130px] rounded-s-lg"></div>
                <div className="h-[50px] w-[4px] bg-gray-800 absolute -start-[4px] top-[190px] rounded-s-lg"></div>
                <div className="h-[70px] w-[4px] bg-gray-800 absolute -end-[4px] top-[150px] rounded-e-lg"></div>

                {/* Screen Content */}
                <div className="bg-gray-50 h-full w-full rounded-[2.25rem] overflow-hidden flex flex-col relative">
                  {/* App Header */}
                  <div className="bg-gradient-to-br from-[#4f46e5] via-[#6366f1] to-[#9333ea] pt-12 pb-8 px-6 rounded-b-[2.5rem] shadow-xl relative z-10 overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl transform translate-x-1/2 -translate-y-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-xl transform -translate-x-1/2 translate-y-1/2"></div>

                    <div className="flex justify-between items-center text-white mb-6 relative">
                      <div className="h-8 w-8 rounded-full bg-white/15 flex items-center justify-center backdrop-blur-md cursor-pointer hover:bg-white/25 transition-colors">
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M4 6h16M4 12h16M4 18h16"
                          />
                        </svg>
                      </div>
                      <div className="font-black tracking-[0.2em] text-[11px] text-white">
                        AXIS MOBILE
                      </div>
                      <div className="h-8 w-8 rounded-full bg-white/15 backdrop-blur-md cursor-pointer hover:bg-white/25 transition-colors flex items-center justify-center">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-2 relative">
                      {/* Tarjeta Interactiva: Redujimos la duración de transición (duration-150 ease-out) e incrementamos el salto (scale-[1.06] -translate-y-2.5) para hacerla más ágil y responsiva al hover del mouse */}
                      <div className="bg-white/15 hover:bg-white p-4 rounded-2xl backdrop-blur-md border border-white/20 hover:border-white shadow-lg hover:shadow-2xl transition-all duration-150 ease-out hover:-translate-y-2.5 hover:scale-[1.06] cursor-pointer group">
                        <div className="text-white/70 text-[9px] uppercase font-black tracking-widest mb-1 group-hover:text-indigo-600 transition-colors">
                          Pendientes
                        </div>
                        <div className="text-4xl font-black text-white group-hover:text-indigo-900 drop-shadow-md group-hover:drop-shadow-none transition-all duration-150">
                          05
                        </div>
                      </div>
                      {/* Tarjeta Interactiva: Mismos efectos dinámicos de hover aplicados aquí para mantener coherencia en las micro-interacciones */}
                      <div className="bg-white/15 hover:bg-white p-4 rounded-2xl backdrop-blur-md border border-white/20 hover:border-white shadow-lg hover:shadow-2xl transition-all duration-150 ease-out hover:-translate-y-2.5 hover:scale-[1.06] cursor-pointer group">
                        <div className="text-white/70 text-[9px] uppercase font-black tracking-widest mb-1 group-hover:text-indigo-600 transition-colors">
                          Completados
                        </div>
                        <div className="text-4xl font-black text-white group-hover:text-indigo-900 drop-shadow-md group-hover:drop-shadow-none transition-all duration-150">
                          12
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Scrollable Content */}
                  <div className="p-5 space-y-4 overflow-hidden relative flex-1">
                    <div className="flex justify-between items-end mb-2">
                      <div className="text-sm font-extrabold text-gray-900">
                        Próximos Servicios
                      </div>
                      <div className="text-xs text-indigo-600 font-bold hover:text-indigo-500 cursor-pointer">
                        Ver todos
                      </div>
                    </div>

                    {/* Card 1 */}
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500 rounded-l-2xl"></div>
                      <div className="flex justify-between items-center mb-3">
                        <div className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-[9px] font-extrabold uppercase tracking-widest">
                          Mantenimiento
                        </div>
                        <div className="flex items-center gap-1 text-gray-400">
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span className="text-[10px] font-bold">
                            10:00 AM
                          </span>
                        </div>
                      </div>
                      <h4 className="font-bold text-gray-900 text-sm">
                        Empresa ABC Corp
                      </h4>
                      <p className="text-gray-500 text-xs mt-1 truncate flex items-center gap-1">
                        <svg
                          className="w-3.5 h-3.5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        Av. Principal 123
                      </p>
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex -space-x-2 overflow-hidden">
                          <div className="h-7 w-7 rounded-full ring-2 ring-white bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                            JD
                          </div>
                          <div className="h-7 w-7 rounded-full ring-2 ring-white bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                            MR
                          </div>
                        </div>
                        <div className="h-7 w-7 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Card 2 */}
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-500 rounded-l-2xl"></div>
                      <div className="flex justify-between items-center mb-3">
                        <div className="bg-orange-50 text-orange-700 px-2.5 py-1 rounded-md text-[9px] font-extrabold uppercase tracking-widest">
                          Instalación
                        </div>
                        <div className="flex items-center gap-1 text-gray-400">
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span className="text-[10px] font-bold">
                            02:30 PM
                          </span>
                        </div>
                      </div>
                      <h4 className="font-bold text-gray-900 text-sm">
                        Residencial Norte
                      </h4>
                      <p className="text-gray-500 text-xs mt-1 truncate flex items-center gap-1">
                        <svg
                          className="w-3.5 h-3.5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        Calle Los Pinos 45
                      </p>
                    </div>
                  </div>

                  {/* Bottom Nav */}
                  <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-100 px-8 py-5 flex justify-between items-center z-10 rounded-b-[2.25rem]">
                    <div className="flex flex-col items-center gap-1 text-indigo-600 cursor-pointer">
                      <svg
                        className="w-6 h-6"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                      </svg>
                    </div>
                    <div className="flex flex-col items-center gap-1 text-gray-300 hover:text-indigo-400 transition-colors cursor-pointer">
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <div className="flex flex-col items-center gap-1 text-gray-300 hover:text-indigo-400 transition-colors cursor-pointer">
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Floating Action Button */}
                  <div className="absolute bottom-24 right-6 h-14 w-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full shadow-[0_10px_25px_rgba(79,70,229,0.5)] flex items-center justify-center text-white text-2xl z-20 cursor-pointer hover:scale-110 hover:shadow-[0_15px_30px_rgba(79,70,229,0.6)] transition-all duration-300">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

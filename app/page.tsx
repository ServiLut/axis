import Link from "next/link";

export default function HomePage() {
  return (
    <div className="bg-gray-900 min-h-screen">
      <header className="absolute inset-x-0 top-0 z-50">
        <nav
          aria-label="Global"
          className="flex items-center justify-between p-6 lg:px-8"
        >
          <div className="flex lg:flex-1">
            <Link href="/" className="-m-1.5 p-1.5 flex items-center gap-2">
              <span className="sr-only">Axis</span>
              <div className="h-8 w-8 bg-indigo-500 rounded-lg flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="size-5 text-white"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="text-white font-bold text-xl tracking-tight">
                Axis Software
              </span>
            </Link>
          </div>
        </nav>
      </header>

      <div className="relative isolate px-6 pt-14 lg:px-8">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
        >
          <div
            style={{
              clipPath:
                "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
            }}
            className="relative left-[calc(50%-11rem)] aspect-1155/678 w-144.5 -translate-x-1/2 rotate-30 bg-linear-to-tr from-[#ff80b5] to-[#9089fc] opacity-30 sm:left-[calc(50%-30rem)] sm:w-288.75"
          />
        </div>

        <div className="mx-auto max-w-2xl py-32 sm:py-48 lg:py-56">
          <div className="hidden sm:mb-8 sm:flex sm:justify-center">
            <div className="relative rounded-full px-3 py-1 text-sm leading-6 text-gray-400 ring-1 ring-white/10 hover:ring-white/20">
              Certificaciones de sanidad actualizadas 2024.{" "}
              <a href="#" className="font-semibold text-indigo-400">
                <span aria-hidden="true" className="absolute inset-0" />
                Saber más <span aria-hidden="true">&rarr;</span>
              </a>
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-5xl font-semibold tracking-tight text-balance text-white sm:text-7xl">
              Sistema de Control Profesional de servicios para tu Empresa.
            </h1>
            <p className="mt-8 text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
              Sistema para gestion de servicios. Programación fácil y resultados
              medibles.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link
                href="/sign-in"
                className="rounded-md bg-indigo-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              >
                Iniciar Sesión
              </Link>
              <Link
                href="/sign-up"
                className="text-sm font-semibold leading-6 text-white"
              >
                Registrarse <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="relative isolate bg-white py-24 sm:py-32 overflow-hidden">
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
            <div>
              <div className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium text-indigo-600 ring-1 ring-inset ring-indigo-600/20 bg-indigo-50 mb-6">
                <span className="flex h-2 w-2 rounded-full bg-indigo-600 mr-2 animate-pulse"></span>
                Disponible para Android
              </div>
              <h2 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                Revisar Servicios,
                <br />
                <span className="text-indigo-600">donde quiera que estés.</span>
              </h2>
              <p className="mt-6 text-lg leading-8 text-gray-600">
                La app de Axis extiende el poder de tu panel de administración.
                Tus técnicos podrán gestionar sus servicios en tiempo real.
              </p>

              <ul className="mt-8 space-y-4 text-gray-600">
                <li className="flex gap-3 items-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
                    <svg
                      className="h-5 w-5 text-white"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <span className="font-medium">
                    Seguimiento de rutas en tiempo real
                  </span>
                </li>
                <li className="flex gap-3 items-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
                    <svg
                      className="h-5 w-5 text-white"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <span className="font-medium">Evidencia fotográfica</span>
                </li>
                <li className="flex gap-3 items-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
                    <svg
                      className="h-5 w-5 text-white"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <span className="font-medium">
                    Notificaciones push instantáneas
                  </span>
                </li>
              </ul>

              <div className="mt-10 flex items-center gap-x-6">
                <a
                  href="https://github.com/ServiLut/axis/releases/download/v2.0.0/axis.apk"
                  download
                  className="group flex items-center gap-3 rounded-xl bg-gray-900 px-6 py-3 text-white shadow-xl hover:bg-gray-800 transition-all hover:-translate-y-1 hover:shadow-2xl"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 group-hover:bg-white/20 transition-colors">
                    <svg viewBox="0 0 413.137 413.137" className="h-6 w-6">
                      <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
                      <g
                        id="SVGRepo_tracerCarrier"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      ></g>
                      <g id="SVGRepo_iconCarrier">
                        <g>
                          <path
                            fill="#2f7a21"
                            d="M311.358,136.395H101.779c-4.662,0-8.441,3.779-8.441,8.441v175.749 c0,4.662,3.779,8.441,8.441,8.441h37.363v59.228c0,13.742,11.14,24.883,24.883,24.883l0,0c13.742,0,24.883-11.14,24.883-24.883 v-59.228h34.803v59.228c0,13.742,11.14,24.883,24.883,24.883l0,0c13.742,0,24.883-11.14,24.883-24.883v-59.228h37.882 c4.662,0,8.441-3.779,8.441-8.441V144.836C319.799,140.174,316.02,136.395,311.358,136.395z"
                          />
                          <path
                            fill="#2f7a21"
                            d="M57.856,136.354L57.856,136.354c-13.742,0-24.883,11.14-24.883,24.883v101.065 c0,13.742,11.14,24.883,24.883,24.883l0,0c13.742,0,24.883-11.14,24.883-24.883V161.237 C82.738,147.495,71.598,136.354,57.856,136.354z"
                          />
                          <path
                            fill="#2f7a21"
                            d="M355.281,136.354L355.281,136.354c-13.742,0-24.883,11.14-24.883,24.883v101.065 c0,13.742,11.14,24.883,24.883,24.883l0,0c13.742,0,24.883-11.14,24.883-24.883V161.237 C380.164,147.495,369.024,136.354,355.281,136.354z"
                          />
                          <path
                            fill="#2f7a21"
                            d="M103.475,124.069h205.692c5.366,0,9.368-4.943,8.266-10.195 c-6.804-32.428-27.45-59.756-55.465-75.543l17.584-31.727c1.19-2.148,0.414-4.855-1.734-6.045 c-2.153-1.193-4.856-0.414-6.046,1.734l-17.717,31.966c-14.511-6.734-30.683-10.495-47.734-10.495 c-17.052,0-33.224,3.761-47.735,10.495L140.869,2.292c-1.191-2.149-3.898-2.924-6.045-1.734c-2.148,1.19-2.924,3.897-1.734,6.045 l17.584,31.727c-28.015,15.788-48.661,43.115-55.465,75.544C94.106,119.126,98.108,124.069,103.475,124.069z M267.697,76.786 c0,5.282-4.282,9.565-9.565,9.565c-5.282,0-9.565-4.282-9.565-9.565c0-5.282,4.282-9.565,9.565-9.565 C263.415,67.221,267.697,71.504,267.697,76.786z M154.508,67.221c5.282,0,9.565,4.282,9.565,9.565c0,5.282-4.282,9.565-9.565,9.565 c-5.282,0-9.565-4.282-9.565-9.565C144.943,71.504,149.225,67.221,154.508,67.221z"
                          />
                        </g>
                      </g>
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                      Descargar APK
                    </div>
                    <div className="text-lg font-bold leading-none">
                      Android v2.0
                    </div>
                  </div>
                </a>
              </div>
            </div>

            {/* Right: Phone Mockup (Enhanced) */}
            <div className="relative lg:ml-auto select-none pointer-events-none">
              {/* Background Blob */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[500px] bg-indigo-500/20 blur-[60px] rounded-full -z-10"></div>

              {/* Floating Badge Left */}
              <div className="absolute top-20 -left-6 z-20 animate-[bounce_3s_infinite] bg-white rounded-xl shadow-lg p-3 flex items-center gap-3 border border-gray-100 max-w-[160px]">
                <div className="bg-green-100 p-2 rounded-lg text-green-600">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">
                    Estado
                  </p>
                  <p className="text-xs font-bold text-gray-900">
                    Sincronizado
                  </p>
                </div>
              </div>

              {/* Floating Badge Right */}
              <div className="absolute bottom-32 -right-6 z-20 animate-[bounce_4s_infinite] bg-white rounded-xl shadow-lg p-3 flex items-center gap-3 border border-gray-100 max-w-[160px]">
                <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
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
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">
                    Ubicación
                  </p>
                  <p className="text-xs font-bold text-gray-900">En ruta</p>
                </div>
              </div>

              {/* Phone Body */}
              <div className="relative mx-auto border-gray-900 bg-gray-900 border-[12px] rounded-[2.5rem] h-[620px] w-[310px] shadow-2xl z-10">
                <div className="w-[120px] h-[18px] bg-gray-900 top-0 rounded-b-[1rem] left-1/2 -translate-x-1/2 absolute z-20"></div>
                <div className="h-[32px] w-[3px] bg-gray-800 absolute -start-[15px] top-[72px] rounded-s-lg"></div>
                <div className="h-[46px] w-[3px] bg-gray-800 absolute -start-[15px] top-[124px] rounded-s-lg"></div>

                {/* Screen Content */}
                <div className="bg-gray-50 h-full w-full rounded-[2rem] overflow-hidden flex flex-col relative">
                  {/* App Header */}
                  <div className="bg-indigo-600 pt-10 pb-6 px-5 rounded-b-[2rem] shadow-lg relative z-10">
                    <div className="flex justify-between items-center text-white mb-6">
                      <div className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center border border-indigo-400">
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
                            d="M4 6h16M4 12h16M4 18h16"
                          />
                        </svg>
                      </div>
                      <div className="font-semibold tracking-wide text-sm">
                        AXIS MOBILE
                      </div>
                      <div className="h-8 w-8 rounded-full bg-white/20 border border-white/30"></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm border border-white/10">
                        <div className="text-indigo-200 text-[10px] uppercase font-bold">
                          Pendientes
                        </div>
                        <div className="text-2xl font-bold text-white">05</div>
                      </div>
                      <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm border border-white/10">
                        <div className="text-indigo-200 text-[10px] uppercase font-bold">
                          Completados
                        </div>
                        <div className="text-2xl font-bold text-white">12</div>
                      </div>
                    </div>
                  </div>

                  {/* Scrollable Content */}
                  <div className="p-5 space-y-4 overflow-hidden relative">
                    <div className="flex justify-between items-end">
                      <div className="text-sm font-bold text-gray-800">
                        Próximos Servicios
                      </div>
                      <div className="text-xs text-indigo-600 font-medium">
                        Ver todos
                      </div>
                    </div>

                    {/* Card 1 */}
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                      <div className="flex justify-between items-start mb-2">
                        <div className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">
                          Mantenimiento
                        </div>
                        <span className="text-gray-400 text-[10px] font-mono">
                          10:00 AM
                        </span>
                      </div>
                      <h4 className="font-bold text-gray-900 text-sm">
                        Empresa ABC Corp
                      </h4>
                      <p className="text-gray-500 text-xs mt-0.5 truncate">
                        Av. Principal 123, Centro Empresarial
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex -space-x-1.5 overflow-hidden">
                          <div className="h-5 w-5 rounded-full ring-2 ring-white bg-gray-200"></div>
                          <div className="h-5 w-5 rounded-full ring-2 ring-white bg-gray-300"></div>
                        </div>
                        <div className="h-6 w-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
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
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Card 2 */}
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden opacity-80">
                      <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
                      <div className="flex justify-between items-start mb-2">
                        <div className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">
                          Instalación
                        </div>
                        <span className="text-gray-400 text-[10px] font-mono">
                          02:30 PM
                        </span>
                      </div>
                      <h4 className="font-bold text-gray-900 text-sm">
                        Residencial Norte
                      </h4>
                      <p className="text-gray-500 text-xs mt-0.5 truncate">
                        Calle Los Pinos 45, Bloque B
                      </p>
                    </div>

                    {/* Card 3 (Partial) */}
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden opacity-50">
                      <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                      <div className="flex justify-between items-start mb-2">
                        <div className="h-4 w-16 bg-gray-100 rounded"></div>
                      </div>
                      <div className="h-3 w-32 bg-gray-100 rounded mb-1"></div>
                      <div className="h-2 w-24 bg-gray-50 rounded"></div>
                    </div>
                  </div>

                  {/* Bottom Nav */}
                  <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-between items-center z-10">
                    <div className="flex flex-col items-center gap-1 text-indigo-600">
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                      </svg>
                    </div>
                    <div className="flex flex-col items-center gap-1 text-gray-300">
                      <svg
                        className="w-5 h-5"
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
                    <div className="flex flex-col items-center gap-1 text-gray-300">
                      <svg
                        className="w-5 h-5"
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
                  <div className="absolute bottom-20 right-5 h-12 w-12 bg-indigo-600 rounded-full shadow-lg shadow-indigo-600/40 flex items-center justify-center text-white text-xl z-20">
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

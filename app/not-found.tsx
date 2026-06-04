import Link from "next/link";

export default function NotFound() {
  return (
    <div className="bg-white flex items-center justify-center min-h-screen font-sans selection:bg-indigo-100 overflow-hidden">
      <div className="max-w-2xl w-full text-center px-4 relative">
        {/* Decorative elements */}
        <div className="absolute top-0 left-1/4 -translate-x-12 opacity-20">
          <div className="w-8 h-3 bg-indigo-400 rounded-sm mb-1 ml-4"></div>
          <div className="w-10 h-3 bg-indigo-400 rounded-sm"></div>
        </div>
        <div className="absolute top-10 right-1/4 translate-x-12 opacity-10">
          <div className="w-10 h-3 bg-indigo-400 rounded-sm mb-1"></div>
          <div className="w-6 h-3 bg-indigo-400 rounded-sm ml-4"></div>
        </div>
        <div className="absolute bottom-1/2 left-10 opacity-10">
          <div className="w-12 h-3 bg-indigo-400 rounded-sm mb-1"></div>
          <div className="w-8 h-3 bg-indigo-400 rounded-sm"></div>
        </div>

        <h2 className="text-gray-600 font-bold tracking-widest text-lg mb-4">
          PÁGINA NO ENCONTRADA
        </h2>

        <div className="relative inline-flex items-center justify-center mb-12">
          <h1 className="text-[150px] md:text-[200px] font-black text-[#7c5dfa] leading-none select-none flex items-center">
            4
            <span className="relative">
              <span className="opacity-80">0</span>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 md:w-44 md:h-44 bg-white/30 backdrop-blur-sm border-8 border-gray-300 rounded-full flex items-center justify-center shadow-inner relative">
                  <div className="absolute top-6 left-6 w-8 h-8 bg-white/40 rounded-full"></div>
                  <div className="absolute -bottom-6 -right-10 w-4 h-20 bg-gray-700 rounded-full rotate-135 border-4 border-white"></div>
                </div>
              </div>
            </span>
            4
          </h1>

          <div className="absolute -top-4 -right-8 md:-right-12">
            <div className="relative bg-white border-2 border-gray-400 rounded-full px-4 py-2 shadow-sm">
              <span className="text-[#7c5dfa] font-bold text-3xl">!!!</span>
              <div className="absolute -bottom-2 left-2 w-4 h-4 bg-white border-b-2 border-r-2 border-gray-400 rotate-45"></div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-4xl md:text-5xl font-bold text-gray-800">
            ¡Ups!
          </h3>
          <p className="text-2xl font-bold text-gray-700">Algo salió mal</p>
          <p className="text-gray-500 text-sm md:text-base max-w-md mx-auto">
            La página que estás buscando no existe, te sugerimos volver al
            inicio.
          </p>
        </div>

        <div className="mt-10">
          <Link
            href="/"
            className="bg-[#7c5dfa] hover:bg-[#6a4fdb] text-white font-medium py-3 px-8 rounded-md transition-colors duration-200 shadow-lg shadow-indigo-200 inline-block"
          >
            Volver a la página de inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

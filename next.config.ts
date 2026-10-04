import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La raíz del proyecto es esta carpeta (evita confusiones con otros archivos de Descargas).
  turbopack: { root: path.resolve(__dirname) },
  // exceljs se usa solo en el servidor; no hace falta empaquetarlo.
  serverExternalPackages: ["exceljs"],
  experimental: {
    serverActions: {
      // Importación de Excel: hasta 10 MB + margen del formulario.
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;

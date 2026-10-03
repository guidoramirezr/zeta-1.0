import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

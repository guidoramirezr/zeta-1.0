import "server-only";
import ExcelJS from "exceljs";
import { TEMPLATE_COLUMNS } from "./parse";

// Genera la plantilla oficial de Zeta para cargar productos.
export async function buildTemplate(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Zeta";

  const ws = wb.addWorksheet("Productos", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = TEMPLATE_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.key === "description" ? 60 : c.key === "company" ? 18 : 16,
  }));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FF15181A" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC8F031" } };
  ws.getColumn("cost").numFmt = "0.00";
  ws.getColumn("price").numFmt = "0.00";

  const help = wb.addWorksheet("Instrucciones");
  help.getColumn(1).width = 22;
  help.getColumn(2).width = 90;
  help.addRows([
    ["Columna", "Qué poner"],
    ["Empresa", "Obligatorio. Quién tiene el producto (ej. Sanauto). Solo lo ves tú, el cliente no."],
    ["Código interno", "Obligatorio. El código del producto en esa empresa. No repetir dentro de la misma empresa."],
    ["Descripción", "Obligatorio. Nombre completo, idealmente con vehículo: SENSOR TPS CHEVROLET AVEO 1.6"],
    ["Código fabricante", "Opcional. Código del fabricante u OEM."],
    ["Marca", "Opcional. Marca del repuesto (Gates, NGK...)."],
    ["Categoría", "Opcional. Ej: SENSOR TPS, BANDAS, PASTILLAS DE FRENOS."],
    ["Costo", "Opcional. PRIVADO: lo que le cuesta a Zeta. Nunca se muestra al cliente."],
    ["Precio Zeta", "Opcional. Precio que ve el cliente. Si lo dejas vacío puedes calcularlo con un margen al importar."],
    [],
    ["Importante", "Si vuelves a cargar un producto (misma Empresa + Código interno) se actualiza. Las celdas vacías no borran datos existentes."],
  ]);
  help.getRow(1).font = { bold: true };

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

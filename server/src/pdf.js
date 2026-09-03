function esc(text) {
  return String(text ?? "")
    .replaceAll("₹", "Rs ")
    .replaceAll("\t", " ")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?");
}

function wrap(text, width = 92) {
  const words = esc(text).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/**
 * Minimal multi-page PDF (Helvetica). Prototype reports only.
 */
export function buildSimplePdf({ title, subtitle, lines }) {
  const pageW = 595;
  const pageH = 842;
  const all = [];
  for (const raw of lines) {
    all.push(...wrap(raw, 92));
  }
  const perPage = 48;
  const pages = [];
  for (let i = 0; i < all.length || i === 0; i += perPage) {
    pages.push(all.slice(i, i + perPage));
    if (all.length === 0) break;
  }

  const objs = [];
  const offsets = [];
  const add = (body) => {
    objs.push(body);
    return objs.length;
  };

  const contentIds = [];
  pages.forEach((pageLines, idx) => {
    const cmds = [
      "BT",
      "/F1 14 Tf",
      "50 800 Td",
      `(${esc(title).replaceAll("(", "\\(").replaceAll(")", "\\)")}) Tj`,
      "/F1 10 Tf",
      "0 -16 Td",
      `(${esc(subtitle).replaceAll("(", "\\(").replaceAll(")", "\\)")}) Tj`,
      "0 -22 Td",
      "/F1 9 Tf",
    ];
    pageLines.forEach((ln, i) => {
      const t = esc(ln).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
      if (i) cmds.push("0 -14 Td");
      cmds.push(`(${t}) Tj`);
    });
    cmds.push("ET");
    const stream = cmds.join("\n");
    contentIds.push(
      add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
    );
  });

  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  const pagesIdPlaceholder = objs.length + 1 + pages.length; // filled after pages
  // We'll assemble pages object after page objects.

  const kids = [];
  contentIds.forEach((cid) => {
    const pid = add(
      `<< /Type /Page /Parent ${0} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${cid} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`
    );
    pageIds.push(pid);
    kids.push(`${pid} 0 R`);
  });
  const pagesId = add(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageIds.length} >>`);
  // patch parent refs — rebuild page objects is messy; write parent correctly by replacing 0 0 R
  for (let i = 0; i < pageIds.length; i += 1) {
    const idx = pageIds[i] - 1;
    objs[idx] = objs[idx].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
  }
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  void pagesIdPlaceholder;

  let pdf = "%PDF-1.4\n";
  objs.forEach((body, i) => {
    offsets[i] = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.forEach((off) => {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

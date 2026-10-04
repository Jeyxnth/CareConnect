import Tesseract from "tesseract.js";
// The legacy build matches what the previous app used and supports older browsers
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

// Extract native text from a normal (non-scanned) PDF
export async function extractPDFText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  try {
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str).join(" "));
    }
    return pages.join("\n");
  } finally {
    pdf.destroy();
  }
}

// OCR for images — direct Tesseract path
export async function extractImageTextWithOCR(file) {
  const url = URL.createObjectURL(file);
  try {
    return (await Tesseract.recognize(url, "eng")).data.text;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// OCR for scanned PDFs — render each page to a canvas, then OCR it
export async function extractPDFTextWithOCR(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  try {
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvas, canvasContext: context, viewport }).promise;

      const { data } = await Tesseract.recognize(canvas.toDataURL("image/png"), "eng");
      pages.push(data.text);
    }
    return pages.join("\n");
  } finally {
    pdf.destroy();
  }
}

// Pick the right extractor for the file type
export async function extractDocumentText(file) {
  if (file.type.startsWith("image/")) {
    return extractImageTextWithOCR(file);
  }

  if (file.type === "application/pdf") {
    // Native text first; a short result means a scanned PDF, so fall back to OCR
    try {
      const text = await extractPDFText(file);
      if (text.trim().length >= 100) return text;
    } catch {
      /* unreadable as text — fall through to OCR */
    }
    return extractPDFTextWithOCR(file);
  }

  if (file.type === "text/plain") {
    return file.text();
  }

  // Some files (e.g. .docx on certain systems) have an empty MIME type — fall back to the extension
  throw new Error("Unsupported file type: " + (file.type || file.name.split(".").pop()));
}

import { supabase } from "./supabase";

// supabase.functions.invoke attaches the active session's JWT automatically.

export async function askCareConnect(promptText, language) {
  const { data, error } = await supabase.functions.invoke("careconnect", {
    body: { prompt: promptText, language },
  });
  if (error) throw error;
  return data.reply;
}

const MAX_DOC_CHARS = 12000;

// carePlan (optional): { warning_signs, diet, activity_restrictions } saved from a document
function carePlanSection(carePlan) {
  const lists = [
    ["Warning signs", carePlan?.warning_signs],
    ["Diet", carePlan?.diet],
    ["Activity restrictions", carePlan?.activity_restrictions],
  ].filter(([, items]) => Array.isArray(items) && items.length > 0);
  if (!lists.length) return "";
  return (
    "--- CARE PLAN ---\n" +
    lists.map(([label, items]) => `${label}:\n${items.map((x) => `- ${x}`).join("\n")}`).join("\n") +
    "\n"
  );
}

export function buildSystemPrompt(profile, uploadedDocs, carePlan) {
  const name = profile?.name || "the patient";
  const age = profile?.age || "unknown";
  const diagnosis = profile?.primary_diagnosis || "condition not specified";
  const discharged = profile?.discharge_date || "date not recorded";

  const docs = Array.isArray(uploadedDocs) ? uploadedDocs.filter(Boolean) : [];
  const docsSection = docs.length
    ? "--- PATIENT DOCUMENTS ---\n" + docs.join("\n---\n").slice(0, MAX_DOC_CHARS)
    : "No medical documents have been uploaded yet. Encourage the patient to upload their discharge summary for personalised care.";

  return (
    `You are CareConnect, a warm and knowledgeable post-discharge care assistant for ${name}, aged ${age}, ` +
    `diagnosed with ${diagnosis}, discharged on ${discharged}. ` +
    "Speak clearly with empathy and reassurance. Use simple language a patient can understand. " +
    "Never give emergency medical advice — if the patient describes serious or urgent symptoms, " +
    "immediately direct them to call their emergency contact or go to the nearest hospital. " +
    "Answer only based on the patient's own medical documents provided below. " +
    "If the answer is not in the documents, say so clearly and suggest they contact their doctor.\n" +
    carePlanSection(carePlan) +
    docsSection
  );
}

export class PopupBlockedError extends Error {
  constructor() {
    super("Popup blocked");
    this.name = "PopupBlockedError";
  }
}

export async function printSummary(structuredData, profile) {
  // Open the window synchronously, while we're still inside the user's click —
  // browsers block popups opened after an await.
  const win = window.open("", "_blank");
  if (!win) throw new PopupBlockedError();

  try {
    const { data, error } = await supabase.functions.invoke("print-summary", {
      body: { structured_data: structuredData, patient: profile },
    });
    if (error) throw error;
    win.document.write(data);
    win.document.close();
    setTimeout(() => win.print(), 500);
  } catch (err) {
    win.close();
    throw err;
  }
}

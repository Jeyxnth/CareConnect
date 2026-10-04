import { askCareConnect } from "./api";
import { isValidDateStr } from "./format";

const buildPrompt = (text) => `Extract structured medical data from the document below and return
ONLY a JSON object. No prose, no markdown fences.

Rules:
- patient_name: full name of the patient (string)
- age: the patient's age in years (number, or null)
- sex: the patient's sex (string)
- admission_date: date of admission (YYYY-MM-DD, or null)
- discharge_date: date of discharge (YYYY-MM-DD, or null)
- consultant: the treating consultant / doctor (string)
- diagnosis: list of conditions found (array of strings)
- medications: array of { name, dosage, frequency, schedule } where schedule is
  the raw pattern as written, such as "1-0-1", or "" if there is none
- follow_ups: follow-up instructions or dates (array of strings)
- warning_signs: symptoms to watch for (array of strings)
- diet: dietary instructions (array of strings)
- activity_restrictions: physical restrictions (array of strings)

Look for diagnosis in: DIAGNOSIS, IMPRESSION, ASSESSMENT, CLINICAL SUMMARY
Look for follow_ups in: ADVICE, FOLLOW UP, REVIEW, NEXT VISIT
Look for medications in: PRESCRIPTION, MEDICATION, TREATMENT, DRUGS
- Medications may appear as 'T.NAME: (morning-afternoon-night)'
  format where 1=take, 0=skip, e.g. 'T.EM ESET: (1-0-1)' or '5YP.LUPIZ1ME PLUS: 10ml'.
  Extract each as:
  name: the part after T. or SYP. before the colon,
  dosage: the volume if given (e.g. '10ml'), otherwise empty,
  frequency: interpret (1-0-1) as 'morning and night',
  (1-0-0) as 'morning only', (0-0-1) as 'night only', etc.
- Patient name may appear after 'NAME OF THE PATIENT:' or
  'Patient Name:'
- Follow-ups may appear as 'ADVICE: FOLLOW UP AFTER N DAYS'
- Dates in the document are usually DD/MM/YYYY (Indian format).
  Always output YYYY-MM-DD. If unsure, return null. Never guess.
- 'AGE / SEX: 71 Yrs / Male' means age 71, sex "Male".
Text may be OCR output — ignore noise, extract real data only.
Return [] for any field not found. Never hallucinate.

JSON format:
{
  "patient_name": "",
  "age": null,
  "sex": "",
  "admission_date": null,
  "discharge_date": null,
  "consultant": "",
  "diagnosis": [],
  "medications": [{"name":"","dosage":"","frequency":"","schedule":""}],
  "follow_ups": [],
  "warning_signs": [],
  "diet": [],
  "activity_restrictions": []
}

Document (${Math.ceil(text.length / 1000)}k chars):
${text.slice(0, 10000)}`;

// Models sometimes return objects/numbers where strings are expected — coerce so the
// UI and the print function can always treat these fields as arrays of strings.
const toStrings = (v) =>
  Array.isArray(v)
    ? v
        .filter((x) => x != null && x !== "")
        .map((x) => (typeof x === "object" ? Object.values(x).join(" ") : String(x)))
    : [];

const toMeds = (v) =>
  Array.isArray(v)
    ? v
        .filter((m) => m && typeof m === "object")
        .map((m) => ({
          name: String(m.name ?? ""),
          dosage: String(m.dosage ?? ""),
          frequency: String(m.frequency ?? ""),
          schedule: String(m.schedule ?? ""),
        }))
    : [];

// A whole number of years between 0 and 120, otherwise null
const toAge = (v) => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : v;
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 && n <= 120 ? n : null;
};

// Only a real YYYY-MM-DD date survives; anything else becomes null
const toDate = (v) => (isValidDateStr(v) ? v : null);

const toText = (v) => (typeof v === "string" ? v.trim() : "");

// Turn a raw model reply into the structured object, or null (logging why).
function extractStructuredData(reply) {
  if (!reply || typeof reply !== "string") return null;
  // trim() also strips a leading BOM / newlines / spaces
  const trimmed = reply.trim();
  if (trimmed.startsWith("Error:") || trimmed.startsWith("Please sign in")) {
    console.warn("[medicalParser] error reply from API:", trimmed.slice(0, 100));
    return null;
  }

  const cleaned = trimmed.replace(/```json/gi, "").replace(/```/g, "");

  // Find the LAST } to close the FIRST { (handles trailing prose)
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    console.warn("[medicalParser] no JSON object found in reply");
    return null;
  }
  const jsonText = cleaned.slice(firstBrace, lastBrace + 1);

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    console.error("[medicalParser] JSON.parse failed:", err.message);
    console.error("[medicalParser] attempted to parse:", jsonText.slice(0, 200));
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  return {
    patient_name: typeof parsed.patient_name === "string" ? parsed.patient_name : "",
    age: toAge(parsed.age),
    sex: toText(parsed.sex),
    admission_date: toDate(parsed.admission_date),
    discharge_date: toDate(parsed.discharge_date),
    consultant: toText(parsed.consultant),
    diagnosis: toStrings(parsed.diagnosis),
    medications: toMeds(parsed.medications),
    follow_ups: toStrings(parsed.follow_ups),
    warning_signs: toStrings(parsed.warning_signs),
    diet: toStrings(parsed.diet),
    activity_restrictions: toStrings(parsed.activity_restrictions),
  };
}

// supabase.functions.invoke hides the function's own error message inside the
// response body on `error.context` — log it so failures aren't silent.
async function logFunctionError(err) {
  try {
    const res = err?.context?.clone?.();
    if (res) {
      console.error("[medicalParser] function responded", res.status, (await res.text()).slice(0, 500));
    }
  } catch {
    /* body unreadable */
  }
}

// accessToken is accepted for call-site compatibility; supabase.functions.invoke
// attaches the session's JWT itself.
// eslint-disable-next-line no-unused-vars
export async function parseStructuredData(text, accessToken) {
  let reply;
  try {
    // Always parse in English, regardless of the app's UI language
    reply = await askCareConnect(buildPrompt(text), "en");
  } catch (err) {
    console.error("[medicalParser] askCareConnect failed:", err);
    await logFunctionError(err);
    throw err;
  }

  console.log("[medicalParser] raw reply length:", reply?.length);
  console.log("[medicalParser] raw reply preview:", typeof reply === "string" ? reply.slice(0, 300) : reply);

  const structuredData = extractStructuredData(reply);
  console.log("[medicalParser] structuredData:", structuredData);
  return structuredData;
}

export function fmt(arr) {
  if (!arr || arr.length === 0) return "None";
  return arr.map((x) => "• " + x).join("\n");
}

export function fmtMeds(arr) {
  if (!arr || arr.length === 0) return "None";
  return arr
    .map((m) => {
      const name = m.name || "Unknown medication";
      const dosage = m.dosage ? ` — ${m.dosage}` : "";
      const freq = m.frequency ? `, ${m.frequency}` : "";
      return "• " + name + dosage + freq;
    })
    .join("\n");
}

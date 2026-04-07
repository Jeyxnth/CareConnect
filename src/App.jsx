import { useState, useRef, useEffect } from "react";

// ─── Supabase config (fill in your project URL + anon key) ───────────────────
const SUPABASE_URL = "https://lzpxjqhdvnzjtcpwfpka.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_EDKv9heMKjM9ggot2zsewg_aKGfv8ol";
const GEMINI_API_KEY = "AIzaSyCtMy4STWC9J1W3CZPo3UKTVRy5_PfMB94";

// ─── Simple readmission risk ML model (logistic regression weights) ───────────
// Features: adherenceScore (0-100), age, comorbidities (0-5), daysPostDischarge
function predictReadmissionRisk({ adherenceScore, age, comorbidities, daysPostDischarge }) {
  // Normalise inputs
  const a = adherenceScore / 100;
  const ag = (age - 30) / 70;
  const c = comorbidities / 5;
  const d = Math.min(daysPostDischarge, 30) / 30;

  // Logistic regression coefficients (trained on synthetic clinical data)
  const logit =
    -2.1 +
    -3.5 * a +   // higher adherence → lower risk
    1.8 * ag +   // older → higher risk
    1.4 * c +    // more comorbidities → higher risk
    -0.9 * d;    // further from discharge → slightly lower risk

  const prob = 1 / (1 + Math.exp(-logit));
  return Math.round(prob * 100);
}

function getRiskLevel(pct) {
  if (pct < 25) return { label: "Low Risk", color: "#10b981", bg: "#d1fae5" };
  if (pct < 55) return { label: "Moderate Risk", color: "#f59e0b", bg: "#fef3c7" };
  return { label: "High Risk", color: "#ef4444", bg: "#fee2e2" };
}

// ─── Parse PDF/text file locally ─────────────────────────────────────────────
function readFileAsText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsText(file);
  });
}

// ─── Call Gemini API (gemini-1.5-pro) ───────────────────────────────
async function callGemini(messages, systemPrompt) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    systemPrompt +
                    "\n\n" +
                    messages.map((m) => m.content).join("\n"),
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await res.json();

    console.log("Gemini FULL response:", data);

    if (data.error) {
      return "Error: " + data.error.message;
    }

    return (
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response from Gemini."
    );
  } catch (err) {
    console.error(err);
    return "Gemini request failed.";
  }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────
async function saveToSupabase(table, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// ─── Components ───────────────────────────────────────────────────────────────

function Pill({ label, color, bg }) {
  return (
    <span style={{
      background: bg, color, fontWeight: 700, fontSize: 12,
      borderRadius: 20, padding: "3px 12px", border: `1.5px solid ${color}`,
    }}>{label}</span>
  );
}

function RiskGauge({ pct }) {
  const { label, color, bg } = getRiskLevel(pct);
  const angle = -90 + (pct / 100) * 180;
  return (
    <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
      <svg viewBox="0 0 200 110" width={160}>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e5e7eb" strokeWidth={18} strokeLinecap="round" />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={color}
          strokeWidth={18}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 251.2} 251.2`}
        />
        <line
          x1="100" y1="100"
          x2={100 + 60 * Math.cos((angle * Math.PI) / 180)}
          y2={100 + 60 * Math.sin((angle * Math.PI) / 180)}
          stroke="#1f2937" strokeWidth={3} strokeLinecap="round"
        />
        <circle cx="100" cy="100" r="6" fill="#1f2937" />
      </svg>
      <div style={{ fontSize: 28, fontWeight: 800, color, marginTop: -8 }}>{pct}%</div>
      <Pill label={label} color={color} bg={bg} />
    </div>
  );
}

function ChatMessage({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: 12,
    }}>
      {!isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "linear-gradient(135deg,#0ea5e9,#6366f1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 14, fontWeight: 700, marginRight: 8, flexShrink: 0,
        }}>AI</div>
      )}
      <div style={{
        maxWidth: "72%",
        background: isUser ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "#f8fafc",
        color: isUser ? "#fff" : "#1e293b",
        borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        padding: "10px 16px",
        fontSize: 14,
        lineHeight: 1.6,
        boxShadow: "0 1px 4px rgba(0,0,0,.08)",
        whiteSpace: "pre-wrap",
        border: isUser ? "none" : "1px solid #e2e8f0",
      }}>{msg.content}</div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("chat"); // chat | risk
  const [patientDoc, setPatientDoc] = useState(null);
  const [docText, setDocText] = useState("");
  const [docSummary, setDocSummary] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [riskForm, setRiskForm] = useState({
    adherenceScore: 70,
    age: 55,
    comorbidities: 2,
    daysPostDischarge: 7,
  });
  const [riskResult, setRiskResult] = useState(null);
  const [adherenceLog, setAdherenceLog] = useState([
    { date: "Day 1", score: 90 },
    { date: "Day 2", score: 85 },
    { date: "Day 3", score: 75 },
    { date: "Day 4", score: 70 },
    { date: "Day 5", score: 65 },
    { date: "Today", score: riskForm.adherenceScore },
  ]);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const systemPrompt = docText
    ? `You are a compassionate and knowledgeable post-discharge medical care assistant. 
The patient's medical records and discharge summary are provided below. 
Use this to give personalized, accurate post-care guidance including medication schedules, 
dietary advice, activity restrictions, follow-up appointments, and warning signs to watch for.
Always be empathetic, clear, and avoid medical jargon where possible.
If asked about something not in the records, say so clearly.

PATIENT MEDICAL DATA:
${docText.slice(0, 4000)}`
    : `You are a compassionate post-discharge medical care assistant. 
No patient document has been uploaded yet. Politely remind the patient to upload their 
discharge summary for personalized guidance, but still try to help with general post-care questions.`;

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setDocLoading(true);
    setPatientDoc(file.name);
    const text = await readFileAsText(file);
    setDocText(text);

    // Ask Gemini to summarise the discharge doc
   const summary = await callGemini(
  [
    {
      role: "user",
      content: `Here is a patient discharge document. Extract:
- patient name
- diagnosis
- medications with dosage
- follow-ups
- warning signs

Document:
${text.slice(0, 4000)}`
    }
  ],
  "You are a medical document parser. Be precise and structured."
);
    setDocSummary(summary);

    // Greet patient
    setMessages([{
      role: "assistant",
      content: `👋 Hello${patientName ? `, ${patientName}` : ""}! I've reviewed your discharge documents. Here's a quick summary:\n\n${summary}\n\nFeel free to ask me anything about your recovery, medications, diet, or activities!`,
    }]);

    // Save to Supabase (optional – fails gracefully if not configured)
    try {
      await saveToSupabase("patient_documents", {
        patient_name: patientName || "Unknown",
        filename: file.name,
        document_text: text.slice(0, 10000),
        summary,
        created_at: new Date().toISOString(),
      });
    } catch (_) {}

    setDocLoading(false);
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const history = newMessages.map((m) => ({ role: m.role, content: m.content }));
    const reply = await callGemini(history, systemPrompt);

    const botMsg = { role: "assistant", content: reply };
    setMessages([...newMessages, botMsg]);

    // Save conversation turn to Supabase
    try {
      await saveToSupabase("chat_logs", {
        patient_name: patientName || "Unknown",
        user_message: input,
        ai_response: reply,
        created_at: new Date().toISOString(),
      });
    } catch (_) {}

    setLoading(false);
  }

  function calculateRisk() {
    const pct = predictReadmissionRisk(riskForm);
    setRiskResult(pct);
    // Update adherence log with current score
    setAdherenceLog((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = { date: "Today", score: riskForm.adherenceScore };
      return updated;
    });
    // Save risk assessment
    try {
      saveToSupabase("risk_assessments", {
        patient_name: patientName || "Unknown",
        ...riskForm,
        risk_percentage: pct,
        risk_level: getRiskLevel(pct).label,
        created_at: new Date().toISOString(),
      });
    } catch (_) {}
  }

  const maxScore = Math.max(...adherenceLog.map((d) => d.score));

  return (
    <div style={{
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      background: "linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%)",
      minHeight: "100vh",
      padding: "0 0 40px",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg,#0ea5e9 0%,#6366f1 60%,#8b5cf6 100%)",
        padding: "20px 24px 16px",
        color: "#fff",
        boxShadow: "0 4px 20px rgba(99,102,241,.3)",
      }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: "rgba(255,255,255,.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
            }}>🏥</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: -.3 }}>CareConnect</div>
              <div style={{ fontSize: 12, opacity: .85 }}>Post-Discharge AI Care Assistant</div>
            </div>
          </div>
          {/* Patient name input */}
          <input
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            placeholder="Enter your name (optional)"
            style={{
              marginTop: 14, width: "100%", boxSizing: "border-box",
              padding: "9px 14px", borderRadius: 10, border: "none",
              background: "rgba(255,255,255,.2)", color: "#fff",
              fontSize: 13, outline: "none",
              "::placeholder": { color: "rgba(255,255,255,.7)" },
            }}
          />
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px" }}>
        {/* Upload card */}
        <div style={{
          marginTop: 16,
          background: "#fff",
          borderRadius: 16,
          padding: "14px 16px",
          boxShadow: "0 2px 12px rgba(0,0,0,.06)",
          border: "1.5px dashed #c7d2fe",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "#eef2ff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, flexShrink: 0,
          }}>📄</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>
              {patientDoc ? `✅ ${patientDoc}` : "Upload Discharge Summary"}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {patientDoc ? "Document analyzed & ready" : "PDF, TXT or any text file"}
            </div>
          </div>
          <label style={{
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            color: "#fff", borderRadius: 8, padding: "7px 14px",
            fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0,
          }}>
            {docLoading ? "…" : patientDoc ? "Re-upload" : "Choose File"}
            <input type="file" accept=".txt,.pdf,.doc,.docx" onChange={handleUpload} style={{ display: "none" }} />
          </label>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 8, marginTop: 14, marginBottom: 0,
          background: "#fff", borderRadius: 14, padding: 4,
          boxShadow: "0 2px 12px rgba(0,0,0,.06)",
        }}>
          {[["chat", "💬 Chat"], ["risk", "📊 Risk"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1, padding: "9px 0", borderRadius: 10, border: "none",
                cursor: "pointer", fontWeight: 700, fontSize: 13,
                background: tab === key ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "transparent",
                color: tab === key ? "#fff" : "#64748b",
                transition: "all .2s",
              }}
            >{label}</button>
          ))}
        </div>

        {/* ── Chat Tab ── */}
        {tab === "chat" && (
          <div style={{
            marginTop: 12, background: "#fff", borderRadius: 16,
            boxShadow: "0 2px 12px rgba(0,0,0,.06)", overflow: "hidden",
          }}>
            {/* Messages */}
            <div style={{
              height: 380, overflowY: "auto", padding: "16px 14px",
              display: "flex", flexDirection: "column",
            }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", color: "#94a3b8", marginTop: 60 }}>
                  <div style={{ fontSize: 48 }}>🩺</div>
                  <div style={{ fontWeight: 600, marginTop: 8 }}>Upload your discharge summary</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>to get personalized post-care guidance</div>
                  {/* Quick prompts */}
                  <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                    {["When should I take my medication?", "What foods should I avoid?", "When can I resume exercise?"].map((q) => (
                      <button
                        key={q}
                        onClick={() => { setInput(q); }}
                        style={{
                          background: "#f1f5f9", border: "none", borderRadius: 20,
                          padding: "6px 12px", fontSize: 11, color: "#475569",
                          cursor: "pointer", fontWeight: 600,
                        }}
                      >{q}</button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => <ChatMessage key={i} msg={m} />)}
              {loading && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: "linear-gradient(135deg,#0ea5e9,#6366f1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 14, fontWeight: 700,
                  }}>AI</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: "#6366f1",
                        animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            {/* Input */}
            <div style={{
              padding: "10px 12px",
              borderTop: "1px solid #f1f5f9",
              display: "flex", gap: 8,
            }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Ask about your recovery…"
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 12,
                  border: "1.5px solid #e2e8f0", fontSize: 13,
                  outline: "none", background: "#f8fafc",
                }}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                style={{
                  width: 42, height: 42, borderRadius: 12, border: "none",
                  background: loading ? "#c7d2fe" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  color: "#fff", fontSize: 18, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >➤</button>
            </div>
          </div>
        )}

        {/* ── Risk Tab ── */}
        {tab === "risk" && (
          <div style={{ marginTop: 12 }}>
            {/* Risk form */}
            <div style={{
              background: "#fff", borderRadius: 16, padding: 16,
              boxShadow: "0 2px 12px rgba(0,0,0,.06)",
            }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#1e293b", marginBottom: 14 }}>
                📋 Patient Parameters
              </div>
              {[
                { key: "adherenceScore", label: "Adherence Score", min: 0, max: 100, unit: "%" },
                { key: "age", label: "Patient Age", min: 18, max: 100, unit: "yrs" },
                { key: "comorbidities", label: "Comorbidities", min: 0, max: 5, unit: "/5" },
                { key: "daysPostDischarge", label: "Days Post-Discharge", min: 1, max: 30, unit: "days" },
              ].map(({ key, label, min, max, unit }) => (
                <div key={key} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{label}</label>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: "#6366f1",
                      background: "#eef2ff", borderRadius: 6, padding: "1px 8px",
                    }}>{riskForm[key]}{unit}</span>
                  </div>
                  <input
                    type="range"
                    min={min} max={max}
                    value={riskForm[key]}
                    onChange={(e) => setRiskForm({ ...riskForm, [key]: +e.target.value })}
                    style={{ width: "100%", accentColor: "#6366f1" }}
                  />
                </div>
              ))}
              <button
                onClick={calculateRisk}
                style={{
                  width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
                  background: "linear-gradient(135deg,#0ea5e9,#6366f1)",
                  color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(99,102,241,.3)",
                }}
              >Calculate Readmission Risk</button>
            </div>

            {/* Risk result */}
            {riskResult !== null && (
              <div style={{
                background: "#fff", borderRadius: 16, padding: 16, marginTop: 12,
                boxShadow: "0 2px 12px rgba(0,0,0,.06)",
              }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#1e293b", marginBottom: 4, textAlign: "center" }}>
                  Readmission Risk
                </div>
                <RiskGauge pct={riskResult} />
                <div style={{
                  marginTop: 14, padding: "12px 14px",
                  background: getRiskLevel(riskResult).bg,
                  borderRadius: 10, fontSize: 12, color: "#1e293b", lineHeight: 1.6,
                  border: `1px solid ${getRiskLevel(riskResult).color}30`,
                }}>
                  {riskResult < 25
                    ? "✅ Great adherence! Continue following your discharge plan. Low chance of readmission."
                    : riskResult < 55
                    ? "⚠️ Moderate risk. Please improve medication adherence and attend follow-up appointments."
                    : "🚨 High risk of readmission. Please contact your healthcare provider immediately and strictly follow all care instructions."}
                </div>
              </div>
            )}

            {/* Adherence trend */}
            <div style={{
              background: "#fff", borderRadius: 16, padding: 16, marginTop: 12,
              boxShadow: "0 2px 12px rgba(0,0,0,.06)",
            }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#1e293b", marginBottom: 12 }}>
                📈 Adherence Trend
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
                {adherenceLog.map((d, i) => {
                  const h = (d.score / maxScore) * 70;
                  const { color } = getRiskLevel(100 - d.score);
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600 }}>{d.score}%</div>
                      <div style={{
                        width: "100%", height: h, borderRadius: "4px 4px 2px 2px",
                        background: i === adherenceLog.length - 1
                          ? "linear-gradient(180deg,#6366f1,#8b5cf6)"
                          : "#e0e7ff",
                        transition: "height .5s ease",
                      }} />
                      <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600 }}>{d.date}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes bounce {
          0%,80%,100% { transform: scale(0); opacity: .4; }
          40% { transform: scale(1); opacity: 1; }
        }
        input[type="range"] { height: 4px; }
        input::placeholder { color: rgba(255,255,255,.6); }
      `}</style>
    </div>
  );
}

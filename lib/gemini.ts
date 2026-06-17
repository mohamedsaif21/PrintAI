import { GoogleGenerativeAI } from "@google/generative-ai";
import { Order, ScheduleResult, Machine } from "@/types";

export interface RiskAnalysis {
  riskScore: number;        // 0-100
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  anomalies: string[];
  recommendation: string;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  return new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: GEMINI_MODEL,
  });
}

export async function generateScheduleExplanation(
  order: Order,
  result: ScheduleResult,
  warnings: string[] = []
): Promise<string> {
  try {
    const model = getModel();
    if (!model) throw new Error("Gemini is not configured");

    const taskSummary = result.tasks
      .map(
        (t) =>
          `${t.machineId} (speed: ${t.machineSpeed} sheets/hr) → ${t.assignedQty.toLocaleString()} pieces, ETA ${new Date(t.estimatedFinish).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
      )
      .join("; ");

    const warningContext = warnings.length > 0
      ? `\nSystem Actions: ${warnings.join(". ")}.\nState these exact actions factually.`
      : "";

    const prompt = `Provide a strictly factual, concise summary of this scheduling decision. No conversational filler.

Order: ${order.quantity.toLocaleString()} ${order.product}, Priority: ${order.priority}.
Assignments: ${taskSummary}.
Estimated Finish: ${new Date(result.overallFinish).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.
SLA: ${result.slaStatus} (${Math.abs(result.slaDiff)}m ${result.slaDiff >= 0 ? "buffer" : "late"}).${warningContext}

State exactly:
1. Machine(s) assigned.
2. Estimated completion time and SLA status.
3. Exact actions taken (e.g., queued normally, paused medium job, routed to backup).
Keep it to 2-3 direct sentences.`;

    const response = await model.generateContent(prompt);
    return response.response.text();
  } catch (error) {
    console.error("Gemini error:", error);
    return `Assigned to ${result.tasks.length} machine(s). Estimated finish: ${Math.abs(result.slaDiff)}m ${result.slaDiff >= 0 ? "ahead of" : "behind"} deadline (SLA ${result.slaStatus}).`;
  }
}

export async function analyseRisk(
  order: Order,
  machines: Machine[],
  schedule: ScheduleResult
): Promise<RiskAnalysis> {
  const fallback: RiskAnalysis = {
    riskScore: schedule.slaStatus === "RISK" ? 75 : 25,
    riskLevel: schedule.slaStatus === "RISK" ? "HIGH" : "LOW",
    anomalies: [],
    recommendation: schedule.slaStatus === "RISK" ? "SLA deadline is at risk. Consider adding more machines or reducing order quantity." : "Schedule looks healthy.",
  };

  try {
    const model = getModel();
    if (!model) return fallback;

    const machineSummary = machines
      .map((m) => `${m.id}: status=${m.status}, speed=${m.speed}, jobs_in_queue=${m.queue.length}, paperTypes=${m.paperTypes.join("/")}`)
      .join("\n");

    const taskSummary = schedule.tasks
      .map((t) => `${t.machineId}: ${t.assignedQty.toLocaleString()} pcs, ${t.estimatedHours}h`)
      .join(", ");

    const prompt = `You are an AI risk analyst for a print factory. Analyse the following production data and return a JSON object only — no markdown, no explanation outside JSON.

Order: ${order.quantity.toLocaleString()} ${order.product} for ${order.customer}, paper: ${order.paperType}, priority: ${order.priority}, deadline: ${new Date(order.deadline).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.
Schedule: ${taskSummary}. Overall finish: ${new Date(schedule.overallFinish).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}. SLA: ${schedule.slaStatus} (${Math.abs(schedule.slaDiff)} min ${schedule.slaDiff >= 0 ? "ahead" : "behind"}).
Machines:\n${machineSummary}
*Context: A 'busy' status means the machine is running. New orders are safely queued behind existing jobs if the SLA allows.*

Return exactly this JSON:
{
  "riskScore": <integer 0-100>,
  "riskLevel": <"LOW" | "MEDIUM" | "HIGH">,
  "anomalies": [<short string per anomaly detected, max 3>],
  "recommendation": <one actionable sentence for the supervisor>
}`;

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim();
    const json = text.replace(/```json|```/g, "").trim();
    return JSON.parse(json) as RiskAnalysis;
  } catch {
    return fallback;
  }
}

export async function generateFailureExplanation(
  failedMachineId: string,
  backupMachineId: string,
  remainingQty: number,
  slaStatus: string
): Promise<string> {
  try {
    const model = getModel();
    if (!model) throw new Error("Gemini is not configured");
    const prompt = `In 2 sentences, explain to a factory supervisor that machine ${failedMachineId} has broken down mid-run with ${remainingQty.toLocaleString()} pieces remaining, and the AI has automatically reassigned the work to ${backupMachineId} (backup machine). SLA is ${slaStatus}. Keep it factual and under 40 words.`;
    const response = await model.generateContent(prompt);
    return response.response.text();
  } catch {
    return `${failedMachineId} experienced a breakdown. The remaining ${remainingQty.toLocaleString()} pieces have been automatically reassigned to ${backupMachineId}. SLA is ${slaStatus}.`;
  }
}

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
          `${t.machineId} (speed: ${t.machineSpeed} jobs/hr) → ${t.assignedQty.toLocaleString()} pieces, ETA ${new Date(t.estimatedFinish).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
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

import { differenceInMinutes } from "date-fns";

export async function analyseRisk(
  order: Order,
  machines: Machine[],
  schedule: ScheduleResult
): Promise<RiskAnalysis> {
  const deadline = new Date(order.deadline);
  const overallFinish = new Date(schedule.overallFinish);
  
  // Calculate exact minutes between deadline and finish. 
  // Positive means we finish BEFORE deadline (buffer).
  // Negative means we finish AFTER deadline (late).
  const rawDiff = differenceInMinutes(deadline, overallFinish);
  const diffMinutes = Number.isNaN(rawDiff) ? 0 : rawDiff;
  
  // Determine risk level based on actual time difference
  let calcRiskLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  let calcRiskScore = 10;
  
  if (diffMinutes < 0) {
    // We are late -> HIGH risk
    calcRiskLevel = "HIGH";
    // Score increases the later we are, up to 100
    calcRiskScore = Math.min(100, 75 + Math.abs(diffMinutes) / 2);
  } else if (diffMinutes < 60) {
    // Within 60 minutes buffer -> MEDIUM risk
    calcRiskLevel = "MEDIUM";
    // Score gets closer to 70 as buffer gets smaller
    calcRiskScore = Math.max(30, 70 - (diffMinutes / 2));
  } else {
    // Plentiful buffer -> LOW risk
    calcRiskLevel = "LOW";
    calcRiskScore = Math.max(0, 20 - (diffMinutes / 10));
  }
  
  // Round score
  calcRiskScore = Math.round(calcRiskScore);

  const fallback: RiskAnalysis = {
    riskScore: calcRiskScore,
    riskLevel: calcRiskLevel,
    anomalies: [],
    recommendation: calcRiskLevel === "HIGH" ? "SLA deadline is breached. Consider adding more machines or reducing order quantity." : 
                    calcRiskLevel === "MEDIUM" ? "SLA buffer is tight. Monitor closely." : 
                    "Schedule looks healthy.",
  };

  try {
    const model = getModel();
    if (!model) return fallback;

    const machineSummary = machines
      .map((m) => `${m.id}: status=${m.status}, speed=${m.speed}, jobs_in_queue=${m.queue?.length || 0}, paperTypes=${(m.paperTypes || []).join("/")}`)
      .join("\n");

    const taskSummary = schedule.tasks
      .map((t) => `${t.machineId}: ${t.assignedQty.toLocaleString()} pcs, ${t.estimatedHours}h`)
      .join(", ");

    const prompt = `You are an AI risk analyst for a print factory. Analyse the production data and return a JSON object only. No markdown, no conversational text.

Order: ${order.quantity.toLocaleString()} ${order.product}, Priority: ${order.priority}, SLA: ${schedule.slaStatus} (${Math.abs(schedule.slaDiff)} min ${schedule.slaDiff >= 0 ? "ahead" : "late"}).
Schedule: ${taskSummary}.
Calculated Risk Level: ${calcRiskLevel}
Calculated Risk Score: ${calcRiskScore}
Machines: \n${machineSummary}
Context: 'busy' means running. Queuing is normal if SLA is met.

Return exactly this JSON. Ensure text fields are ultra-concise and strictly factual:
{
  "riskScore": ${calcRiskScore},
  "riskLevel": "${calcRiskLevel}",
  "anomalies": [<string: max 8 words per anomaly, strictly factual (e.g., 'M2 queue exceeds 15 hours'), max 2 items>],
  "recommendation": <string: max 12 words, start with action verb (e.g., 'Preempt medium jobs on M2')>
}`;

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim();
    const json = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(json) as RiskAnalysis;
    
    // Enforce deterministic risk score and level overrides
    return {
      ...parsed,
      riskScore: calcRiskScore,
      riskLevel: calcRiskLevel,
    };
  } catch (error) {
    console.error("Gemini risk analysis error:", error);
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
  } catch (error) {
    console.error("Gemini failure explanation error:", error);
    return `${failedMachineId} experienced a breakdown. The remaining ${remainingQty.toLocaleString()} pieces have been automatically reassigned to ${backupMachineId}. SLA is ${slaStatus}.`;
  }
}

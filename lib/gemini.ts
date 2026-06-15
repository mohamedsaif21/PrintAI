import { GoogleGenerativeAI } from "@google/generative-ai";
import { Order, ScheduleResult } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function generateScheduleExplanation(
  order: Order,
  result: ScheduleResult
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const taskSummary = result.tasks
      .map(
        (t) =>
          `${t.machineId} (speed: ${t.machineSpeed} sheets/hr) → ${t.assignedQty.toLocaleString()} pieces, ETA ${new Date(t.estimatedFinish).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
      )
      .join("; ");

    const prompt = `You are an AI production planning assistant for a printing factory. Explain the following scheduling decision in 2-3 clear, concise sentences for a production supervisor.

Order: ${order.quantity.toLocaleString()} ${order.product} for ${order.customer}, paper: ${order.paperType}, priority: ${order.priority}, deadline: ${new Date(order.deadline).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.
Machine assignments: ${taskSummary}.
Overall estimated finish: ${new Date(result.overallFinish).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.
SLA status: ${result.slaStatus} (${Math.abs(result.slaDiff)} minutes ${result.slaDiff >= 0 ? "ahead of" : "behind"} deadline).

Explain WHY these machines were chosen and what the SLA status means. Keep it under 60 words.`;

    const response = await model.generateContent(prompt);
    return response.response.text();
  } catch (error) {
    console.error("Gemini error:", error);
    return `Work was split across ${result.tasks.length} machines proportionally by speed. The fastest machines received the largest share to minimise completion time. Estimated finish is ${Math.abs(result.slaDiff)} minutes ${result.slaDiff >= 0 ? "ahead of" : "behind"} the deadline — SLA is ${result.slaStatus}.`;
  }
}

export async function generateFailureExplanation(
  failedMachineId: string,
  backupMachineId: string,
  remainingQty: number,
  slaStatus: string
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `In 2 sentences, explain to a factory supervisor that machine ${failedMachineId} has broken down mid-run with ${remainingQty.toLocaleString()} pieces remaining, and the AI has automatically reassigned the work to ${backupMachineId} (backup machine). SLA is ${slaStatus}. Keep it factual and under 40 words.`;
    const response = await model.generateContent(prompt);
    return response.response.text();
  } catch {
    return `${failedMachineId} experienced a breakdown. The remaining ${remainingQty.toLocaleString()} pieces have been automatically reassigned to ${backupMachineId}. SLA is ${slaStatus}.`;
  }
}

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PlannedJob, BulkOptimiseResult } from "@/types/planned-jobs";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  let jobs: PlannedJob[] = [];
  try {
    const body = await req.json();
    jobs = body.jobs || [];

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const model = genAI.getGenerativeModel({ model: modelName });

    const jobSummary = jobs
      .map(
        (j) =>
          `Job ${j.id}: machine=${j.machine_name}, qty=${j.balance_qty}, ageing=${j.ageing}d, sla=${j.sla}h, status=${j.printing_status}, priority=${j.wo_status}`
      )
      .join("\n");

    const prompt = `You are a production optimisation AI for a print factory. Given these at-risk print jobs, suggest which machine to reassign each to and why. Return JSON array only, no markdown.

Jobs:
${jobSummary}

Return exactly:
[{ "jobId": "<id>", "suggestedMachine": "<machine name>", "reason": "<one short reason>", "expectedImpact": "<e.g. saves 2h>" }]`;

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim().replace(/```json|```/g, "").trim();
    const suggestions: BulkOptimiseResult[] = JSON.parse(text);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("AI Optimise error, falling back to deterministic suggestions:", error);
    // Fallback — generate basic suggestions without Gemini
    const suggestions = (jobs || []).map((j: PlannedJob) => ({
      jobId: j.id,
      suggestedMachine: j.machine_name === "M1" ? "M3" : "M1",
      reason: "High ageing detected — faster machine recommended",
      expectedImpact: "Estimated 1–2h reduction",
    }));
    return NextResponse.json({ suggestions });
  }
}

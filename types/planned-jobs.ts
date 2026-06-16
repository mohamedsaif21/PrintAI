export interface PlannedJob {
  id: string; // WO number e.g. "TL10002779"
  order_id: string;
  facility: string; // "Heat Transfer" | "Off Set" | "Digital"
  printing_status: "Completed" | "Ongoing" | "Error" | "Pending";
  wo_status: "High" | "Medium" | "Low";
  sla: number;
  ageing: number;
  machine_name: string;
  schedule_date: string;
  ed_date: string;
  retailer: string;
  product_id: string;
  base_paper: string;
  current_wc: string;
  production_type: string;
  balance_qty: number;
  balance_value: number;
  pi_number: string;
  wo_quantity: number;
  no_of_plates: number;
  cs_name: string;
  line_count: number;
  next_wc: string;
  oos: boolean;
  stage: "pre-press" | "press" | "post-press";
  operator: string;
  shift: "morning" | "afternoon" | "night";
  ai_suggestion?: string;
  created_at: string;
}

export interface PlannedJobsStats {
  total: number;
  prePress: number;
  press: number;
  postPress: number;
  atRisk: number;
}

export interface BulkOptimiseResult {
  jobId: string;
  suggestedMachine: string;
  reason: string;
  expectedImpact: string;
}
"use client";
import { Order, Machine } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from "recharts";
import * as XLSX from "xlsx";

interface Props { orders: Order[]; machines: Machine[]; scheduleMap: Record<string, { slaStatus: string; slaDiff: number }> }

const COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#f97316"];

export function ReportsPage({ orders, machines, scheduleMap }: Props) {
  const statusData = ["Pending Approval", "Scheduled", "In Progress", "Completed", "Pending", "At Risk"].map((s) => ({
    name: s, value: orders.filter((o) => o.status === s).length,
  })).filter((d) => d.value > 0);

  const machineData = machines.map((m) => ({
    name: m.id,
    utilisation: m.utilisation,
    speed: m.speed,
  }));

  const totalQty = orders.reduce((s, o) => s + o.quantity, 0);
  // #12 — count risk from scheduleMap (source of truth) not just order.status
  const slaRiskCount = orders.filter((o) => scheduleMap[o.id]?.slaStatus === "RISK" || o.status === "At Risk").length;
  const completed = orders.filter((o) => o.status === "Completed").length;
  const slaCompliance = orders.length === 0 ? "100%" : slaRiskCount === 0 ? "100%" : `${Math.round(((orders.length - slaRiskCount) / orders.length) * 100)}%`;

  const downloadExcel = () => {
    const reportDate = new Date();
    const orderRows = orders.map((o) => ({
      "Order ID": o.id,
      Customer: o.customer,
      Product: o.product,
      Quantity: o.quantity,
      Priority: o.priority,
      Status: o.status,
      Deadline: format(new Date(o.deadline), "yyyy-MM-dd HH:mm"),
      SLA: scheduleMap[o.id]?.slaStatus === "RISK" || o.status === "At Risk" ? "RISK" : "SAFE",
      "SLA Variance (min)": scheduleMap[o.id]?.slaDiff ?? "",
    }));
    const machineRows = machines.map((m) => ({
      "Machine ID": m.id,
      Status: m.status,
      "Speed (sheets/hour)": m.speed,
      "Capacity (sheets/day)": m.capacity,
      "Utilisation %": m.utilisation,
      "Assigned Order": m.assignedOrderId || "",
      "Paper Types": m.paperTypes.join(", "),
    }));
    const summaryRows = [
      { Metric: "Report generated", Value: format(reportDate, "yyyy-MM-dd HH:mm") },
      { Metric: "Total quantity", Value: totalQty },
      { Metric: "Orders completed", Value: completed },
      { Metric: "Total orders", Value: orders.length },
      { Metric: "SLA compliance", Value: slaCompliance },
      { Metric: "SLA at risk", Value: slaRiskCount },
      { Metric: "Machines active", Value: machines.filter((m) => m.status === "available").length },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Summary");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(orderRows), "Orders");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(machineRows), "Machines");
    XLSX.writeFile(workbook, `printai-report-${format(reportDate, "yyyy-MM-dd-HHmm")}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Reports</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Production, SLA, and machine performance</p>
        </div>
        <button
          type="button"
          onClick={downloadExcel}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
        >
          <Download className="h-4 w-4" />
          Download Excel
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total quantity", value: totalQty.toLocaleString(), sub: "sheets ordered" },
          { label: "Orders completed", value: completed, sub: `of ${orders.length}` },
          { label: "SLA compliance", value: slaCompliance, sub: slaRiskCount === 0 ? "No violations" : `${slaRiskCount} at risk` },
          { label: "Machines active", value: machines.filter(m => m.status === "available").length, sub: `of ${machines.length}` },
        ].map((c) => (
          <div key={c.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{c.value}</p>
            <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Order status pie */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Order status breakdown</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
            {statusData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-xs text-gray-500">{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Machine utilisation bar */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Machine utilisation</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={machineData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip formatter={(v) => (v as number) + "%"} />
              <Bar dataKey="utilisation" radius={[4, 4, 0, 0]}>
                {machineData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SLA table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">SLA performance</h3>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          <div className="px-5 py-2 grid grid-cols-6 text-xs font-medium text-gray-400 uppercase tracking-wide">
            <span>Order ID</span><span>Customer</span><span>Product</span><span>Qty</span><span>Deadline</span><span>SLA</span>
          </div>
          {orders.map((o) => (
            <div key={o.id} className="px-5 py-3 grid grid-cols-6 items-center text-sm">
              <span className="font-mono text-xs text-gray-400">{o.id}</span>
              <span className="text-gray-700 dark:text-gray-300 truncate">{o.customer}</span>
              <span className="text-gray-600 dark:text-gray-400">{o.product}</span>
              <span className="text-gray-600 dark:text-gray-400">{o.quantity.toLocaleString()}</span>
              <span className="text-gray-600 dark:text-gray-400">{format(new Date(o.deadline), "h:mm a")}</span>
              <Badge variant={scheduleMap[o.id]?.slaStatus === "RISK" || o.status === "At Risk" ? "risk" : "safe"}>{scheduleMap[o.id]?.slaStatus === "RISK" || o.status === "At Risk" ? "RISK" : "SAFE"}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

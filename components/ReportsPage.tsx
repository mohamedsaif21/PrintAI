"use client";
import { Order, Machine } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { format } from "date-fns";
import { Download, Package, CheckCircle2, ShieldCheck, Cpu, BarChart3, PieChart as PieChartIcon } from "lucide-react";
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

  const statCards = [
    { label: "Total quantity", value: totalQty.toLocaleString(), sub: "sheets ordered", icon: Package, color: "bg-blue-500" },
    { label: "Orders completed", value: completed, sub: `of ${orders.length}`, icon: CheckCircle2, color: "bg-emerald-500" },
    { label: "SLA compliance", value: slaCompliance, sub: slaRiskCount === 0 ? "No violations" : `${slaRiskCount} at risk`, icon: ShieldCheck, color: "bg-teal-500" },
    { label: "Machines active", value: machines.filter(m => m.status === "available").length, sub: `of ${machines.length}`, icon: Cpu, color: "bg-violet-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-black">Reports</h2>
          <p className="mt-0.5 text-xs text-gray-500">Production, SLA, and machine performance</p>
        </div>
        <button
          type="button"
          onClick={downloadExcel}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-black hover:text-white"
        >
          <Download className="h-4 w-4" />
          Download Excel
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="custom-card rounded-xl border p-5 relative min-h-[110px]">
              <div className="flex flex-col justify-between h-full">
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">{c.label}</p>
                  <p className="text-2xl font-bold text-black leading-tight">{c.value}</p>
                </div>
                <p className="text-[11px] text-gray-500 mt-2 font-medium">{c.sub}</p>
              </div>
              <div className={`absolute top-5 right-5 w-10 h-10 rounded-[10px] ${c.color} flex items-center justify-center`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Order status pie */}
        <div className="custom-card rounded-xl border p-5 min-h-[250px] flex flex-col justify-between">
          <h3 className="text-sm font-semibold text-white mb-4">Order status breakdown</h3>
          {orders.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-6 text-center">
              <PieChartIcon className="w-8 h-8 text-gray-600 mb-2" />
              <p className="text-xs text-gray-450 font-medium">No data yet — submit an order to see analytics</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                    {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </>
          )}
          {orders.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
              {statusData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-xs text-gray-450">{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Machine utilisation bar */}
        <div className="custom-card rounded-xl border p-5 min-h-[250px] flex flex-col justify-between">
          <h3 className="text-sm font-semibold text-white mb-4">Machine utilisation</h3>
          {orders.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-6 text-center">
              <BarChart3 className="w-8 h-8 text-gray-600 mb-2" />
              <p className="text-xs text-gray-450 font-medium">No data yet — submit an order to see analytics</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={machineData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} domain={[0, 100]} />
                <Tooltip formatter={(v) => (v as number) + "%"} />
                <Bar dataKey="utilisation" radius={[4, 4, 0, 0]}>
                  {machineData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* SLA table */}
      <div className="custom-card rounded-xl border overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">SLA performance</h3>
        </div>
        <div className="divide-y divide-gray-800">
          <div className="px-5 py-2.5 grid grid-cols-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            <span>Order ID</span><span>Customer</span><span>Product</span><span>Qty</span><span>Deadline</span><span>SLA</span>
          </div>
          {orders.length > 0 ? (
            orders.map((o) => (
              <div key={o.id} className="px-5 py-3.5 grid grid-cols-6 items-center text-sm">
                <span className="font-mono text-xs text-gray-450">{o.id}</span>
                <span className="text-gray-300 truncate">{o.customer}</span>
                <span className="text-gray-400">{o.product}</span>
                <span className="text-gray-400">{o.quantity.toLocaleString()}</span>
                <span className="text-gray-400">{format(new Date(o.deadline), "h:mm a")}</span>
                <Badge variant={scheduleMap[o.id]?.slaStatus === "RISK" || o.status === "At Risk" ? "risk" : "safe"}>
                  {scheduleMap[o.id]?.slaStatus === "RISK" || o.status === "At Risk" ? "RISK" : "SAFE"}
                </Badge>
              </div>
            ))
          ) : (
            <div className="px-5 py-8 text-center text-xs text-gray-500">
              No orders logged for SLA tracking.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

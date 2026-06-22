"use client";
import { useState } from "react";
import { Order, Machine, ScheduleResult, Material } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { CheckCircle2, AlertTriangle, Clock, Cpu, FileText, Inbox, Package, Users, X, Loader2 } from "lucide-react";
import { JobStatusPanel } from "@/components/JobStatusPanel";

interface Operator {
  id: string;
  name: string;
  shift: string;
  machineType: string;
  status: "active" | "break" | "off-shift";
  assignedMachine: string | null;
}

// Mock data — clearly commented as MOCK DATA
const INITIAL_OPERATORS: Operator[] = [
  { id: "EMP-1042", name: "Worker 1", shift: "Morning", machineType: "Heat Transfer", status: "active",    assignedMachine: "M1" },
  { id: "EMP-1043", name: "Worker 2", shift: "Morning", machineType: "Offset",        status: "active",    assignedMachine: "M2" },
  { id: "EMP-1044", name: "Worker 3", shift: "Morning", machineType: "Digital",       status: "active",    assignedMachine: null },
  { id: "EMP-1045", name: "Worker 4", shift: "Afternoon",machineType: "Heat Transfer",status: "off-shift", assignedMachine: null },
  { id: "EMP-1046", name: "Worker 5", shift: "Morning", machineType: "Offset",        status: "break",     assignedMachine: "M3" },
  { id: "EMP-1047", name: "Worker 6", shift: "Night",   machineType: "Digital",       status: "off-shift", assignedMachine: null },
];

const getMaterialMaxCapacity = (name: string): number => {
  const lower = name.toLowerCase();
  if (lower.includes("coated") && !lower.includes("uncoated")) return 50000;
  if (lower.includes("glossy")) return 40000;
  if (lower.includes("matte")) return 40000;
  if (lower.includes("uncoated")) return 60000;
  return 40000;
};

interface Props {
  orders: Order[];
  machines: Machine[];
  lastSchedule: ScheduleResult | null;
  notifications: { msg: string; type: "success" | "warn" | "info" }[];
  materials: Material[];
  rawMaterials?: Material[];
  onRestockComplete?: () => void;
}

function MetricCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 relative min-h-[110px]">
      <div className="flex flex-col justify-between h-full">
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        </div>
        <p className="text-[11px] text-gray-500 mt-2 font-medium">{sub}</p>
      </div>
      <div className={`absolute top-5 right-5 w-10 h-10 rounded-[10px] ${color} flex items-center justify-center`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
  );
}

export function DashboardPage({ orders, machines, lastSchedule, notifications, materials, rawMaterials = [], onRestockComplete }: Props) {
  const [operators, setOperators] = useState<Operator[]>(INITIAL_OPERATORS);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [isRestocking, setIsRestocking] = useState(false);
  const [tempStock, setTempStock] = useState<Record<number, number>>({});

  const handleStatusChange = (id: string, status: "active" | "break" | "off-shift") => {
    setOperators((prev) =>
      prev.map((op) => {
        if (op.id === id) {
          return {
            ...op,
            status,
            assignedMachine: status === "off-shift" ? null : op.assignedMachine,
          };
        }
        return op;
      })
    );
  };

  const handleMachineChange = (id: string, machineId: string | null) => {
    setOperators((prev) =>
      prev.map((op) => {
        if (op.id === id) {
          return {
            ...op,
            assignedMachine: machineId,
            status: machineId ? "active" : op.status,
          };
        }
        return op;
      })
    );
  };

  const scheduled = orders.filter((o) => o.status === "Scheduled" || o.status === "In Progress" || o.status === "Pending Approval").length;
  const active = machines.filter((m) => m.status === "available").length;
  const slaRisk = orders.filter((o) => o.status === "At Risk").length;
  const latestOrder = lastSchedule ? orders.find((order) => order.id === lastSchedule.orderId) : null;
  const lowStockMaterials = materials.filter((m) => m.available_stock <= m.threshold_level);

  return (
    <div className="space-y-6 bg-gray-100 p-6 rounded-xl">
      {/* Welcome message banner */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">Welcome to PrintAI!</h2>
          <p className="text-xs text-gray-500 mt-1">
            {orders.length === 0
              ? "No orders yet. Go to the Orders page to create your first order and see the AI scheduling in action."
              : "Monitor your live machine queues, track material stock, and optimize production schedules using AI."}
          </p>
        </div>
      </div>

      {/* Low stock warning banner */}
      {lowStockMaterials.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 shadow-sm rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center text-white flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-amber-900">Low Stock Warning</h3>
              <p className="text-[11px] text-amber-750 mt-0.5">
                The following raw materials are below their safety thresholds:{" "}
                <span className="font-semibold">
                  {lowStockMaterials.map(m => `${m.name} (${m.available_stock.toLocaleString()} / ${m.total_stock.toLocaleString()} ${m.unit})`).join(", ")}
                </span>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const initialTemp: Record<number, number> = {};
              const sourceList = rawMaterials && rawMaterials.length > 0 ? rawMaterials : materials;
              sourceList.forEach(m => {
                initialTemp[m.id] = m.available_stock;
              });
              setTempStock(initialTemp);
              setShowRestockModal(false);
              setShowRestockModal(true);
            }}
            className="text-xs px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-sm transition-colors flex-shrink-0"
          >
            Restock Now
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
        <MetricCard label="Total orders" value={orders.length} sub={`${scheduled} active`} icon={FileText} color="bg-blue-500" />
        <MetricCard label="Active machines" value={active} sub={`${machines.filter(m=>m.status==='busy').length} busy · ${machines.filter(m=>m.status==='backup').length} backup`} icon={Cpu} color="bg-violet-500" />
        <MetricCard label="SLA compliance" value={slaRisk === 0 ? "100%" : `${Math.round(((orders.length - slaRisk) / orders.length) * 100)}%`} sub={slaRisk === 0 ? "All on track" : `${slaRisk} at risk`} icon={CheckCircle2} color="bg-emerald-500" />
        <MetricCard label="Jobs scheduled" value={orders.reduce((s, o) => s + o.quantity, 0).toLocaleString()} sub="across all orders" icon={Clock} color="bg-amber-500" />
        <MetricCard label="On Shift Now" value={operators.filter((op) => op.status === "active").length} sub={`${operators.filter((op) => op.status === "active").length} active · ${operators.length} total`} icon={Users} color="bg-indigo-500" />
      </div>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.slice(0, 3).map((n, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm border ${
                n.type === "success"
                  ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                  : n.type === "warn"
                  ? "bg-amber-50 text-amber-900 border-amber-200"
                  : "bg-blue-50 text-blue-900 border-blue-200"
              }`}
            >
              {n.type === "warn" ? <AlertTriangle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
              {n.msg}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Orders overview */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 min-h-[250px] flex flex-col">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent orders</h3>
          {orders.length > 0 ? (
            <div className="space-y-3 flex-1 overflow-y-auto">
              {orders.slice(0, 5).map((o) => (
                <div key={o.id} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24 font-mono">{o.id}</span>
                  <span className="text-sm text-gray-700 flex-1 truncate">{o.product}</span>
                  <span className="text-xs text-gray-500">{o.quantity.toLocaleString()}</span>
                  <Badge variant={o.status === "Scheduled" || o.status === "In Progress" ? "safe" : o.status === "At Risk" ? "risk" : "warn"}>
                    {o.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Inbox className="w-8 h-8 text-gray-300 mb-3" />
              <p className="text-xs text-gray-500">No recent orders found.</p>
            </div>
          )}
        </div>

        {/* Machine utilisation */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 min-h-[250px] flex flex-col">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Machine utilisation</h3>
          <div className="space-y-4 flex-1 overflow-y-auto">
            {machines.map((m) => (
              <div key={m.id} className="flex items-center gap-4">
                <span className="text-sm font-semibold w-8 text-gray-700">{m.id}</span>
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${m.status === "available" ? "bg-emerald-500" : m.status === "busy" ? "bg-amber-500" : m.status === "breakdown" ? "bg-red-500" : "bg-blue-500"}`}
                    style={{ width: `${m.utilisation}%` }}
                  />
                </div>
                <span className="text-xs text-gray-600 w-10 text-right tabular-nums">{m.utilisation}%</span>
                <div className="w-20 text-right">
                  <Badge variant={m.status === "available" ? "safe" : m.status === "busy" ? "warn" : m.status === "breakdown" ? "risk" : "info"}>
                    {m.status === "available" ? "Available" : m.status === "busy" ? "Busy" : m.status === "breakdown" ? "Breakdown" : "Standby"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Raw materials stock */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 min-h-[250px] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Raw materials stock</h3>
            <button
              type="button"
              onClick={() => {
                const initialTemp: Record<number, number> = {};
                const sourceList = rawMaterials && rawMaterials.length > 0 ? rawMaterials : materials;
                sourceList.forEach(m => {
                  initialTemp[m.id] = m.available_stock;
                });
                setTempStock(initialTemp);
                setShowRestockModal(false); // Reset just in case
                setShowRestockModal(true);
              }}
              className="text-xs px-2.5 py-1 rounded bg-indigo-50 text-indigo-600 font-semibold border border-indigo-100 hover:bg-indigo-100 transition-colors"
            >
              Restock
            </button>
          </div>
          {materials && materials.length > 0 ? (
            <div className="space-y-4 flex-1 overflow-y-auto">
              {materials.map((mat) => {
                const percentage = Math.min(100, Math.max(0, Math.round((mat.available_stock / mat.total_stock) * 100)));
                const isLow = mat.available_stock <= mat.threshold_level;

                return (
                  <div key={mat.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-gray-800">{mat.name}</span>
                      <div className="flex items-center gap-2">
                        {isLow && (
                          <Badge variant="risk">Low Stock</Badge>
                        )}
                        <span className="text-xs text-gray-500 tabular-nums">
                          {mat.available_stock.toLocaleString()} / {mat.total_stock.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            isLow ? "bg-red-500 animate-pulse" : percentage < 40 ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-10 text-right">{percentage}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Package className="w-8 h-8 text-gray-300 mb-3" />
              <p className="text-xs text-gray-500">No materials configured in database.</p>
            </div>
          )}
        </div>

        {/* Manpower */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 min-h-[250px] flex flex-col font-sans">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Manpower</h3>
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Live Shift</span>
          </div>

          {/* Summary bar */}
          <div className="flex items-center gap-3 mb-4 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-xs font-semibold text-gray-700">{operators.filter(o => o.status === "active").length}</span>
              <span className="text-[10px] text-gray-400">Active</span>
            </div>
            <div className="w-px h-4 bg-gray-200"></div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span className="text-xs font-semibold text-gray-700">{operators.filter(o => o.status === "break").length}</span>
              <span className="text-[10px] text-gray-400">Break</span>
            </div>
            <div className="w-px h-4 bg-gray-200"></div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-gray-300"></span>
              <span className="text-xs font-semibold text-gray-700">{operators.filter(o => o.status === "off-shift").length}</span>
              <span className="text-[10px] text-gray-400">Off-Shift</span>
            </div>
          </div>

          {/* Worker rows */}
          {operators.length > 0 ? (
            <div className="divide-y divide-gray-100 flex-1 overflow-y-auto">
              {operators.map((op, idx) => (
                <div key={op.id} className="py-2.5 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Avatar with status ring */}
                    <div className={`relative w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white ${
                      op.status === "active" ? "bg-indigo-500" :
                      op.status === "break"  ? "bg-amber-400"  : "bg-gray-300"
                    }`}>
                      {idx + 1}
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                        op.status === "active" ? "bg-emerald-500" :
                        op.status === "break"  ? "bg-amber-400"  : "bg-gray-400"
                      }`} />
                    </div>

                    {/* Worker info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-900 leading-snug truncate">{op.name}</p>
                      <div className="flex items-center gap-1 mt-0.5 text-[9px] text-gray-400 min-w-0">
                        <span className="truncate">{op.shift}</span>
                        <span className="text-gray-300">·</span>
                        <span className="px-1 py-px bg-indigo-50 text-indigo-600 rounded font-medium truncate">{op.machineType}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right side: machine tag + status badge (as accessible dropdowns with fixed widths to prevent overlap) */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <select
                      value={op.assignedMachine || ""}
                      onChange={(e) => handleMachineChange(op.id, e.target.value || null)}
                      className="w-[54px] text-[9px] font-semibold bg-white border border-gray-200 rounded px-1 py-0.5 text-gray-600 cursor-pointer outline-none focus:ring-1 focus:ring-indigo-500 hover:border-gray-300 transition-colors"
                      aria-label={`Assign ${op.name} to machine`}
                    >
                      <option value="">—</option>
                      {machines.map((m) => (
                        <option key={m.id} value={m.id}>{m.id}</option>
                      ))}
                    </select>

                    <select
                      value={op.status}
                      onChange={(e) => handleStatusChange(op.id, e.target.value as any)}
                      className={`w-[66px] text-[9px] font-semibold border rounded px-1 py-0.5 cursor-pointer outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${
                        op.status === "active" ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" :
                        op.status === "break"  ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"   :
                        "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                      }`}
                      aria-label={`Status for ${op.name}`}
                    >
                      <option value="active">Active</option>
                      <option value="break">Break</option>
                      <option value="off-shift">Off</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Users className="w-8 h-8 text-gray-300 mb-3" />
              <p className="text-xs text-gray-500">No operators configured yet.</p>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-gray-100 text-[10px] text-gray-400 italic">
            Demo data — connect your shift roster to replace this.
          </div>
        </div>
      </div>

      {lastSchedule && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 px-1">Latest AI schedule result</h3>
          {latestOrder && (
            <JobStatusPanel order={latestOrder} schedule={lastSchedule} machines={machines} />
          )}
        </div>
      )}

      {/* Restock Materials Modal */}
      {showRestockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-200 flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Restock Raw Materials</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">Adjust stock levels or replenish materials to full capacity</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRestockModal(false)}
                className="text-gray-400 hover:text-gray-650 transition-colors p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                <span className="text-xs font-medium text-gray-500">Material</span>
                <button
                  type="button"
                  onClick={() => {
                    const full: Record<number, number> = {};
                    const sourceList = rawMaterials && rawMaterials.length > 0 ? rawMaterials : materials;
                    sourceList.forEach(m => {
                      full[m.id] = getMaterialMaxCapacity(m.name);
                    });
                    setTempStock(full);
                  }}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold hover:underline"
                >
                  Set all to Max
                </button>
              </div>

              <div className="space-y-3.5 max-h-[40vh] overflow-y-auto pr-1">
                {(rawMaterials && rawMaterials.length > 0 ? rawMaterials : materials).map((mat) => {
                  const maxCapacity = getMaterialMaxCapacity(mat.name);
                  return (
                    <div key={mat.id} className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-800 truncate">{mat.name}</p>
                        <p className="text-[10px] text-gray-400">Max capacity: {maxCapacity.toLocaleString()} {mat.unit}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <input
                          type="number"
                          min="0"
                          max={maxCapacity}
                          value={tempStock[mat.id] !== undefined ? tempStock[mat.id] : mat.available_stock}
                          onChange={(e) => {
                            const valStr = e.target.value;
                            if (valStr === "") {
                              setTempStock(prev => ({ ...prev, [mat.id]: "" as any }));
                              return;
                            }
                            const val = Math.min(maxCapacity, Math.max(0, parseInt(valStr) || 0));
                            setTempStock(prev => ({ ...prev, [mat.id]: val }));
                          }}
                          className="w-24 px-2 py-1 text-xs border border-gray-200 rounded text-right outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setTempStock(prev => ({ ...prev, [mat.id]: maxCapacity }));
                          }}
                          className="px-2 py-1 text-[10px] font-semibold bg-gray-100 text-gray-600 rounded border border-gray-200 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                        >
                          Max
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowRestockModal(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={isRestocking}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsRestocking(true);
                  try {
                    const sourceList = rawMaterials && rawMaterials.length > 0 ? rawMaterials : materials;
                    const promises = Object.entries(tempStock).map(async ([key, value]) => {
                      const id = parseInt(key);
                      const mat = sourceList.find(m => m.id === id);
                      if (mat) {
                        const maxCap = getMaterialMaxCapacity(mat.name);
                        const targetValue = Math.min(maxCap, Math.max(0, typeof value === "number" ? value : 0));
                        if (mat.available_stock !== targetValue || mat.total_stock < targetValue) {
                          return fetch(`/api/materials/${id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              ...mat,
                              available_stock: targetValue,
                              total_stock: Math.max(mat.total_stock, targetValue)
                            })
                          });
                        }
                      }
                    });
                    await Promise.all(promises);
                    if (onRestockComplete) {
                      onRestockComplete();
                    }
                  } catch (err) {
                    console.error("Restock failed:", err);
                  } finally {
                    setIsRestocking(false);
                    setShowRestockModal(false);
                  }
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow-sm"
                disabled={isRestocking}
              >
                {isRestocking ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Restocking...
                  </>
                ) : (
                  "Confirm Restock"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
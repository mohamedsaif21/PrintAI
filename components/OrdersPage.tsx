"use client";
import { useState, useEffect, useRef } from "react";
import { Machine, Order, ScheduleResult, PreemptionEvent } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { format } from "date-fns";
import {
  Plus, Loader2, Search, Filter, Sparkles, LayoutList, LayoutGrid,
  GripVertical, MoreVertical, ChevronDown,
} from "lucide-react";

interface Props {
  orders: Order[];
  machines: Machine[];
  scheduleMap: Record<string, { slaStatus: string; slaDiff: number; machines?: string }>;
  onScheduled: (order: Order, schedule: ScheduleResult, machines?: Machine[], preemptionEvents?: PreemptionEvent[]) => void;
  addNotification: (msg: string, type: "success" | "warn" | "info") => void;
}

const PRODUCTS = ["Brochure", "Flyer", "Catalogue", "Poster", "Annual Report", "Business Card", "Newsletter"];
const PAPERS   = ["Coated", "Uncoated", "Glossy", "Matte"];
const PRIORITIES = ["High", "Medium", "Low"] as const;

const getStage = (o: Order) => {
  if (o.status === "Completed") return "post-press";
  if (o.status === "In Progress" || o.status === "At Risk") return "press";
  return "pre-press";
};

const getPrintingStatus = (o: Order) => {
  if (o.status === "Completed") return "Completed";
  if (o.status === "At Risk") return "Error";
  if (o.status === "In Progress") return "Ongoing";
  return "Pending";
};

const getFacility = (o: Order) => {
  if (o.paperType === "Glossy") return "Heat Transfer";
  if (o.paperType === "Coated" || o.paperType === "Matte") return "Off Set";
  return "Digital";
};

const statusToVariant = (s: string): "safe" | "warn" | "risk" | "gray" => {
  if (s === "Completed") return "safe";
  if (s === "Ongoing")   return "warn";
  if (s === "Error")     return "risk";
  return "gray";
};

const woStatusToVariant = (s: string): "high" | "medium" | "low" => {
  if (s === "High")   return "high";
  if (s === "Medium") return "medium";
  return "low";
};

export function OrdersPage({ orders, machines, scheduleMap, onScheduled, addNotification }: Props) {
  // ── Form state ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    customer: "", product: "Brochure", quantity: "10000",
    paperType: "Coated", priority: "High", deadlineHours: "8",
  });

  // ── Tracker state ────────────────────────────────────────────────────────
  const [stageFilter,    setStageFilter]    = useState<string | null>(null);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [shiftFilter,    setShiftFilter]    = useState("All Shifts");
  const [operatorFilter, setOperatorFilter] = useState("All Operators");
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [currentPage,    setCurrentPage]    = useState(1);
  const [optimising,     setOptimising]     = useState(false);
  const [suggestions,    setSuggestions]    = useState<Map<string, string>>(new Map());
  const [openMenuId,     setOpenMenuId]     = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const ITEMS_PER_PAGE = 10;

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Reset page + clear selection on filter change
  useEffect(() => {
    queueMicrotask(() => {
      setCurrentPage(1);
      setSelectedIds(new Set());
    });
  }, [searchQuery, stageFilter, shiftFilter, operatorFilter]);

  // Close row menu on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenuId]);

  // ── Form submit ──────────────────────────────────────────────────────────
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer.trim()) { setError("Customer name is required."); return; }
    if (Number(form.quantity) < 100) { setError("Quantity must be at least 100 sheets."); return; }
    if (Number(form.deadlineHours) < 1) {
      setError("Deadline must be at least 1 hour from now."); return;
    }
    if (Number(form.deadlineHours) > 72) {
      setError("Deadline cannot be more than 72 hours (3 days) from now."); return;
    }
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          quantity: Number(form.quantity),
          deadlineHours: Number(form.deadlineHours),
          currentMachines: machines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      // Show What-If warnings if present (for High Priority orders)
      if (data.whatIfWarnings && Array.isArray(data.whatIfWarnings)) {
        data.whatIfWarnings.forEach((warning: string) => {
          if (warning.includes("Pass 1") || warning.includes("Pass 2") || warning.includes("Pass 3")) {
            addNotification(warning, "info");
          } else if (warning.includes("WARNING") || warning.includes("breach")) {
            addNotification(warning, "warn");
          }
        });
      }
      
      onScheduled(data.order, data.schedule, data.machines, data.preemptionEvents || []);
      setForm({ customer: "", product: "Brochure", quantity: "10000", paperType: "Coated", priority: "High", deadlineHours: "8" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to schedule order");
    } finally {
      setLoading(false);
    }
  }

  // ── AI Optimise ──────────────────────────────────────────────────────────
  async function handleOptimise() {
    const atRisk = orders.filter(o => o.status === "At Risk" || o.priority === "High");
    if (atRisk.length === 0) { addNotification("No at-risk jobs found to optimise.", "info"); return; }
    setOptimising(true);
    try {
      const res = await fetch("/api/planned-jobs/optimise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: atRisk.map(o => {
            const d = new Date(o.createdAt);
            return {
              id: o.id,
              machine_name: scheduleMap[o.id]?.machines || (scheduleMap[o.id] ? "Assigned" : "Unassigned"),
              ageing: isNaN(d.getTime()) ? 0 : Math.floor((Date.now() - d.getTime()) / 86400000),
              wo_status: o.priority,
              balance_qty: o.quantity
            };
          }),
        }),
      });
      const data = await res.json();
      if (data.suggestions) {
        const next = new Map(suggestions);
        (data.suggestions as { jobId: string; suggestedMachine: string; reason: string; expectedImpact: string }[])
          .forEach(s => next.set(s.jobId, `${s.suggestedMachine} — ${s.reason} (${s.expectedImpact})`));
        setSuggestions(next);
        addNotification(`AI optimised ${data.suggestions.length} jobs`, "success");
      }
    } catch {
      addNotification("AI optimisation failed", "warn");
    } finally {
      setOptimising(false);
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────
  const enriched = orders.map(o => ({
    ...o,
    stage:            getStage(o),
    printing_status:  getPrintingStatus(o),
    facility:         getFacility(o),
    sla:              scheduleMap[o.id]
                        ? Math.abs(Math.round((scheduleMap[o.id].slaDiff / 60) * 10) / 10)
                        : null,
    machine:          scheduleMap[o.id]?.machines ?? (scheduleMap[o.id] ? "Assigned" : "Unassigned"),
    ageing:           (() => { const d = new Date(o.createdAt); return isNaN(d.getTime()) ? 0 : Math.floor((Date.now() - d.getTime()) / 86400000); })(),
    ai_suggestion:    suggestions.get(o.id) ?? null,
  }));
  const availableMachines = machines.filter((machine) => machine.status === "available");

  const stats = {
    total:    orders.length,
    prePress: enriched.filter(o => o.stage === "pre-press").length,
    press:    enriched.filter(o => o.stage === "press").length,
    postPress:enriched.filter(o => o.stage === "post-press").length,
    atRisk:   orders.filter(o => o.status === "At Risk" || scheduleMap[o.id]?.slaStatus === "RISK").length,
  };

  const filtered = enriched.filter(o => {
    if (stageFilter && o.stage !== stageFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!o.id.toLowerCase().includes(q) &&
          !o.customer.toLowerCase().includes(q) &&
          !o.product.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalPages  = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const startIndex  = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginated   = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const toggleSelect  = (id: string) => {
    const s = new Set(selectedIds);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelectedIds(s);
  };
  const selectAll = () =>
    selectedIds.size === filtered.length
      ? setSelectedIds(new Set())
      : setSelectedIds(new Set(filtered.map(o => o.id)));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <div className={`rounded-lg border px-4 py-2.5 text-sm ${
        availableMachines.length > 0
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
          : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
      }`}>
        {availableMachines.length > 0
          ? `${availableMachines.length} machine${availableMachines.length > 1 ? "s" : ""} free now: ${availableMachines.map((machine) => machine.id).join(", ")}.`
          : "All production machines are busy or unavailable. New orders will queue behind the earliest compatible machine."}
      </div>

      {/* ── SECTION 1: New Order Form ─────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">New order</h3>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Customer name</label>
              <input type="text" value={form.customer} onChange={e => set("customer", e.target.value)}
                placeholder="e.g. Acme Corp"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Product type</label>
              <select value={form.product} onChange={e => set("product", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {PRODUCTS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Quantity (sheets)</label>
              <input type="number" min="100" max="100000" value={form.quantity} onChange={e => set("quantity", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Paper type</label>
              <select value={form.paperType} onChange={e => set("paperType", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {PAPERS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Priority</label>
              <select value={form.priority} onChange={e => set("priority", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Deadline (hours from now)</label>
              <input type="number" min="1" max="72" value={form.deadlineHours} onChange={e => set("deadlineHours", e.target.value)}
                placeholder="e.g. 8"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-400 mt-1">
                {form.deadlineHours && Number(form.deadlineHours) > 0
                  ? `Due: ${new Date(Date.now() + Number(form.deadlineHours) * 60 * 60 * 1000).toLocaleString([], { 
                      month: 'short', 
                      day: 'numeric', 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}`
                  : "Enter hours to see deadline"}
              </p>
            </div>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {loading ? "Scheduling…" : "Submit order & run AI schedule"}
          </button>
        </form>
      </div>

      {/* ── SECTION 2: Job Tracker ───────────────────────────────────────── */}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Orders List <span className="text-gray-400 font-normal text-base">({stats.total})</span>
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage and track your orders</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
            Today <ChevronDown className="w-4 h-4" />
          </button>
          <select value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-700 dark:text-gray-200 outline-none">
            <option>All Shifts</option>
            <option>Morning</option>
            <option>Afternoon</option>
            <option>Night</option>
          </select>
          <select value={operatorFilter} onChange={e => setOperatorFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-700 dark:text-gray-200 outline-none">
            <option>All Operators</option>
            <option>Sarah Jenkins</option>
            <option>David Chen</option>
            <option>Elena Rust</option>
          </select>
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 p-0.5">
            <button className="p-1 bg-gray-100 dark:bg-gray-700 rounded"><LayoutList className="w-4 h-4 text-gray-700 dark:text-gray-200" /></button>
            <button className="p-1"><LayoutGrid className="w-4 h-4 text-gray-400 dark:text-gray-500" /></button>
          </div>
        </div>
      </div>

      {/* AI alert banner */}
      {stats.atRisk > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span><strong className="font-semibold">{stats.atRisk}</strong> assigned jobs are at risk of delay.</span>
          </div>
          <button onClick={handleOptimise} disabled={optimising}
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-60">
            View AI suggestions
          </button>
        </div>
      )}

      {/* Stage cards */}
      <div className="grid grid-cols-3 gap-4">
        {([
          { id: "pre-press", label: "Pre Press",  count: stats.prePress },
          { id: "press",     label: "Press",      count: stats.press },
          { id: "post-press",label: "Post Press", count: stats.postPress },
        ] as const).map(stage => (
          <button key={stage.id}
            onClick={() => setStageFilter(stageFilter === stage.id ? null : stage.id)}
            className={`p-4 rounded-xl border text-left transition-all ${
              stageFilter === stage.id
                ? "border-blue-500 ring-1 ring-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600"
            }`}>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{stage.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
              {stage.count} <span className="text-base font-normal text-gray-400">Jobs</span>
            </p>
          </button>
        ))}
      </div>

      {/* Search + action bar */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 w-64 text-gray-900 dark:text-gray-100" />
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
            <Filter className="w-4 h-4" />
          </button>
          <button className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Assign to
          </button>
          <button onClick={handleOptimise} disabled={optimising}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-70">
            {optimising ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            AI Optimise
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400">
                <th className="py-3 pl-4 pr-2 font-normal">
                  <input type="checkbox" onChange={selectAll}
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    className="rounded border-gray-300" />
                </th>
                <th className="py-3 px-2 font-normal"></th>
                {["Facility","Printing Status","WOno","WO Status","SLA","Ageing","Machine","Schedule Date","Retailer","Product ID","Balance Qty"].map(h => (
                  <th key={h} className="py-3 px-4 font-normal">
                    <span className="flex items-center gap-1">{h} <Filter className="w-3 h-3 opacity-40" /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-800/60 text-gray-900 dark:text-gray-200">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-gray-400 text-sm">
                    No orders yet. Submit one above.
                  </td>
                </tr>
              ) : paginated.map(o => (
                <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="py-3 pl-4 pr-2">
                    <input type="checkbox" checked={selectedIds.has(o.id)}
                      onChange={() => toggleSelect(o.id)} className="rounded border-gray-300" />
                  </td>
                  <td className="py-3 px-2 text-gray-400">
                    <div className="relative flex items-center gap-1" ref={openMenuId === o.id ? menuRef : null}>
                      <GripVertical className="w-4 h-4 cursor-grab" />
                      <button onClick={() => setOpenMenuId(openMenuId === o.id ? null : o.id)}>
                        <MoreVertical className="w-4 h-4 cursor-pointer hover:text-gray-600 dark:hover:text-gray-200" />
                      </button>
                      {openMenuId === o.id && (
                        <div className="absolute left-5 top-0 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[140px]">
                          {["View Schedule", "Mark Complete", "Delete"].map(item => (
                            <button key={item} onClick={() => setOpenMenuId(null)}
                              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                              {item}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{o.facility}</td>
                  <td className="py-3 px-4">
                    <Badge variant={statusToVariant(o.printing_status)}>{o.printing_status}</Badge>
                  </td>
                  <td className="py-3 px-4 font-medium font-mono text-blue-600 dark:text-blue-400">
                    <span className="flex items-center gap-1.5 hover:underline cursor-pointer">
                      {o.id}
                      {o.ai_suggestion && (
                        <span title={o.ai_suggestion} className="cursor-help">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant={woStatusToVariant(o.priority)}>{o.priority}</Badge>
                  </td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                    {o.sla !== null ? `${o.sla}h` : "—"}
                  </td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{o.ageing}d</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{o.machine}</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                    {format(new Date(o.createdAt), "dd MMM")}
                  </td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                    {o.customer.length > 20 ? o.customer.slice(0, 20) + "…" : o.customer}
                  </td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{o.product}</td>
                  <td className="py-3 px-4">{o.quantity.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-medium">
          <span>
            Showing {filtered.length === 0 ? 0 : startIndex + 1} to {Math.min(startIndex + ITEMS_PER_PAGE, filtered.length)} of {filtered.length} entries
            {filtered.length !== stats.total && ` (filtered from ${stats.total})`}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || filtered.length === 0}
              className="px-2 py-1 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors">
              Prev
            </button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages || filtered.length === 0}
              className="px-2 py-1 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

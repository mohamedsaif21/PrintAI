"use client";
import { useState, useEffect, useRef } from "react";
import { Machine, Order, ScheduleResult, PreemptionEvent } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { format } from "date-fns";
import {
  Plus, Loader2, Search, Filter, Sparkles, LayoutList, LayoutGrid,
  GripVertical, MoreVertical, ChevronDown, CheckCircle2, AlertCircle, X
} from "lucide-react";

interface Props {
  orders: Order[];
  machines: Machine[];
  scheduleMap: Record<string, { slaStatus: string; slaDiff: number; machines?: string }>;
  onScheduled: (order: Order, schedule: ScheduleResult, machines?: Machine[], preemptionEvents?: PreemptionEvent[]) => void;
  onReassignOrders: (orderIds: string[], machineId: string) => void;
  addNotification: (msg: string, type: "success" | "warn" | "info") => void;
  onOrderDeleted: (orderId: string) => void;
  onOrderStatusUpdate: (orderId: string, status: Order['status']) => void;
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
  if (o.status === "Rejected") return "Rejected";
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

export function OrdersPage({ orders, machines, scheduleMap, onScheduled, onReassignOrders, onOrderDeleted, onOrderStatusUpdate, addNotification }: Props) {
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
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false);
  const [aiSuggestionsList, setAiSuggestionsList] = useState<{
    jobId: string;
    suggestedMachine: string;
    reason: string;
    expectedImpact: string;
  }[]>([]);
  const [openMenuId,     setOpenMenuId]     = useState<string | null>(null);
  const [assignMenuOpen, setAssignMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const assignMenuRef = useRef<HTMLDivElement>(null);
  const ITEMS_PER_PAGE = 10;

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Reset page + clear selection on filter change
  useEffect(() => {
    queueMicrotask(() => {
      setCurrentPage(1);
      setSelectedIds(new Set());
    });
  }, [searchQuery, stageFilter, shiftFilter, operatorFilter]);

  // Close menus on outside click
  useEffect(() => {
    if (!openMenuId && !assignMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
      if (assignMenuRef.current && !assignMenuRef.current.contains(e.target as Node)) setAssignMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenuId, assignMenuOpen]);

  const isMachineCompatible = (m: Machine) => {
    return Array.from(selectedIds).every(id => {
      const o = orders.find(ord => ord.id === id);
      return o ? m.paperTypes.includes(o.paperType) : true;
    });
  };

  const handleAssignToMachine = (machineId: string) => {
    if (selectedIds.size === 0) return;
    onReassignOrders(Array.from(selectedIds), machineId);
    setSelectedIds(new Set());
    setAssignMenuOpen(false);
  };

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
    const atRisk = orders.filter(o => o.status !== "Completed" && o.status !== "Rejected" && (o.status === "At Risk" || o.priority === "High"));
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
        setAiSuggestionsList(data.suggestions);
        setShowSuggestionsModal(true);
        addNotification(`AI optimised ${data.suggestions.length} jobs`, "success");
      }
    } catch {
      addNotification("AI optimisation failed", "warn");
    } finally {
      setOptimising(false);
    }
  }

  const handleDismissSuggestion = (jobId: string) => {
    setAiSuggestionsList((prev) => prev.filter((s) => s.jobId !== jobId));
    setSuggestions((prev) => {
      const next = new Map(prev);
      next.delete(jobId);
      return next;
    });
  };

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
    ai_suggestion:    (o.status === "Completed" || o.status === "Rejected") ? null : (suggestions.get(o.id) ?? null),
  }));

  const activeSuggestions = aiSuggestionsList.filter((s) => {
    const order = orders.find((o) => o.id === s.jobId);
    return order && order.status !== "Completed" && order.status !== "Rejected";
  });
  const availableMachines = machines.filter((machine) => machine.status === "available");

  const stats = {
    total:    orders.length,
    prePress: enriched.filter(o => o.stage === "pre-press").length,
    press:    enriched.filter(o => o.stage === "press").length,
    postPress:enriched.filter(o => o.stage === "post-press").length,
    atRisk:   orders.filter(o => o.status !== "Completed" && o.status !== "Rejected" && (o.status === "At Risk" || scheduleMap[o.id]?.slaStatus === "RISK")).length,
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

  // ── Shared input/select classes (light theme, used everywhere for consistency) ──
  const fieldClass =
    "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 " +
    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
  const labelClass = "block text-xs font-medium text-gray-600 mb-1";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 bg-gray-100 p-6 rounded-xl">

      {/* ── Machine availability banner — neutral grey/black, not green ──────── */}
      <div className="rounded-lg border border-gray-300 bg-white p-3 text-sm flex items-center gap-2 text-gray-900 shadow-sm">
        {availableMachines.length > 0 ? (
          <>
            <CheckCircle2 className="w-4 h-4 text-gray-700 flex-shrink-0" />
            <span>
              {availableMachines.length} machine{availableMachines.length > 1 ? "s" : ""} free now:{" "}
              <strong className="font-semibold text-black">{availableMachines.map((m) => m.id).join(", ")}</strong>.
            </span>
          </>
        ) : (
          <>
            <AlertCircle className="w-4 h-4 text-gray-700 flex-shrink-0" />
            <span>All production machines are busy or unavailable. New orders will queue behind the earliest compatible machine.</span>
          </>
        )}
      </div>

      {/* ── SECTION 1: New Order Form ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">New order</h3>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Customer name</label>
              <input type="text" value={form.customer} onChange={e => set("customer", e.target.value)}
                placeholder="e.g. Acme Corp"
                className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Product type</label>
              <select value={form.product} onChange={e => set("product", e.target.value)}
                className={fieldClass}>
                {PRODUCTS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Quantity (sheets)</label>
              <input type="number" min="100" max="100000" value={form.quantity} onChange={e => set("quantity", e.target.value)}
                className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Paper type</label>
              <select value={form.paperType} onChange={e => set("paperType", e.target.value)}
                className={fieldClass}>
                {PAPERS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Priority</label>
              <select value={form.priority} onChange={e => set("priority", e.target.value)}
                className={fieldClass}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Deadline (hours from now)</label>
              <input type="number" min="1" max="72" value={form.deadlineHours} onChange={e => set("deadlineHours", e.target.value)}
                placeholder="e.g. 8"
                className={fieldClass} />
              <p className="text-xs text-gray-500 mt-1">
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
          {error && <p className="text-xs text-red-600">{error}</p>}
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
          <h2 className="text-lg font-bold text-gray-900">
            Orders List <span className="text-gray-500 font-normal text-base">({stats.total})</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Manage and track your orders</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md text-gray-700 flex items-center gap-1.5 hover:bg-gray-50 transition-colors">
            Today <ChevronDown className="w-4 h-4" />
          </button>
          <select value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md text-gray-700 outline-none">
            <option>All Shifts</option>
            <option>Morning</option>
            <option>Afternoon</option>
            <option>Night</option>
          </select>
          <select value={operatorFilter} onChange={e => setOperatorFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md text-gray-700 outline-none">
            <option>All Operators</option>
            <option>Sarah Jenkins</option>
            <option>David Chen</option>
            <option>Elena Rust</option>
          </select>
          <div className="flex items-center border border-gray-300 rounded-md bg-white p-0.5">
            <button className="p-1 bg-gray-200 rounded"><LayoutList className="w-4 h-4 text-gray-900" /></button>
            <button className="p-1"><LayoutGrid className="w-4 h-4 text-gray-400" /></button>
          </div>
        </div>
      </div>

      {/* AI alert banner */}
      {stats.atRisk > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-2.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Sparkles className="w-4 h-4 text-gray-700 flex-shrink-0" />
            <span><strong className="font-semibold text-gray-900">{stats.atRisk}</strong> assigned jobs are at risk of delay.</span>
          </div>
          <button onClick={handleOptimise} disabled={optimising}
            className="text-sm font-medium text-blue-600 hover:underline disabled:opacity-60">
            View AI suggestions
          </button>
        </div>
      )}

      {/* Stage cards */}
      <div className="grid grid-cols-3 gap-6">
        {([
          { id: "pre-press", label: "Pre Press",  count: stats.prePress },
          { id: "press",     label: "Press",      count: stats.press },
          { id: "post-press",label: "Post Press", count: stats.postPress },
        ] as const).map(stage => (
          <button key={stage.id}
            onClick={() => setStageFilter(stageFilter === stage.id ? null : stage.id)}
            className={`p-5 rounded-xl border text-left transition-all bg-white shadow-sm ${
              stageFilter === stage.id
                ? "border-blue-500 ring-1 ring-blue-500"
                : "border-gray-200 hover:border-gray-300"
            }`}>
            <p className="text-sm font-medium text-gray-500">{stage.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {stage.count} <span className="text-base font-normal text-gray-500">Jobs</span>
            </p>
          </button>
        ))}
      </div>

      {/* Filter and Table Container */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col shadow-sm">
        {/* Search + action bar */}
        <div className="p-4 flex items-center justify-between border-b border-gray-200">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 w-64 text-gray-900 placeholder-gray-400" />
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 border border-gray-300 rounded-lg bg-white text-gray-500 hover:bg-gray-50">
              <Filter className="w-4 h-4" />
            </button>
            <div className="relative" ref={assignMenuRef}>
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={() => setAssignMenuOpen(!assignMenuOpen)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Assign to
                <ChevronDown className="w-4 h-4" />
              </button>
              {assignMenuOpen && (
                <div className="absolute right-0 mt-1.5 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] animate-in fade-in slide-in-from-top-1 duration-150">
                  {machines.map((m) => {
                    const compatible = isMachineCompatible(m);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={!compatible}
                        onClick={() => handleAssignToMachine(m.id)}
                        className={`w-full text-left px-3 py-2 text-sm font-medium flex items-center justify-between transition-colors ${
                          compatible
                            ? "text-gray-700 hover:bg-gray-50 cursor-pointer"
                            : "text-gray-400 cursor-not-allowed opacity-50"
                        }`}
                      >
                        <span>{m.id}</span>
                        <span className="text-xs text-gray-500 font-normal">
                          {compatible ? `${m.speed} sheets/hr` : "Incompatible"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button onClick={handleOptimise} disabled={optimising}
              className="px-4 py-2 text-sm font-medium text-gray-900 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-70">
              {optimising ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              AI Optimise
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
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
            <tbody className="text-sm divide-y divide-gray-100 text-gray-900">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-gray-400 text-sm">
                    No orders yet. Submit one above.
                  </td>
                </tr>
              ) : paginated.map(o => (
                <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 pl-4 pr-2">
                    <input type="checkbox" checked={selectedIds.has(o.id)}
                      onChange={() => toggleSelect(o.id)} className="rounded border-gray-300" />
                  </td>
                  <td className="py-3 px-2 text-gray-400">
                    <div className="relative flex items-center gap-1" ref={openMenuId === o.id ? menuRef : null}>
                      <GripVertical className="w-4 h-4 cursor-grab" />
                      <button onClick={() => setOpenMenuId(openMenuId === o.id ? null : o.id)}>
                        <MoreVertical className="w-4 h-4 cursor-pointer hover:text-gray-700" />
                      </button>
                      {openMenuId === o.id && (
                        <div className="absolute left-5 top-0 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
                          <button onClick={() => setOpenMenuId(null)}
                            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                            View Schedule
                          </button>
                          <button onClick={() => { setOpenMenuId(null); onOrderStatusUpdate(o.id, "Completed"); }}
                            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                            Mark Complete
                          </button>
                          <button onClick={() => { setOpenMenuId(null); onOrderDeleted(o.id); }}
                            className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-gray-50">
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{o.facility}</td>
                  <td className="py-3 px-4">
                    <Badge variant={statusToVariant(o.printing_status)}>{o.printing_status}</Badge>
                  </td>
                  <td className="py-3 px-4 font-medium font-mono text-blue-600">
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
                  <td className="py-3 px-4 text-gray-600">
                    {o.sla !== null ? `${o.sla}h` : "—"}
                  </td>
                  <td className="py-3 px-4 text-gray-600">{o.ageing}d</td>
                  <td className="py-3 px-4 text-gray-600">{o.machine}</td>
                  <td className="py-3 px-4 text-gray-600">
                    {format(new Date(o.createdAt), "dd MMM")}
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {o.customer.length > 20 ? o.customer.slice(0, 20) + "…" : o.customer}
                  </td>
                  <td className="py-3 px-4 text-gray-600">{o.product}</td>
                  <td className="py-3 px-4 text-gray-900">{o.quantity.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500 font-medium">
          <span>
            Showing {filtered.length === 0 ? 0 : startIndex + 1} to {Math.min(startIndex + ITEMS_PER_PAGE, filtered.length)} of {filtered.length} entries
            {filtered.length !== stats.total && ` (filtered from ${stats.total})`}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || filtered.length === 0}
              className="px-2 py-1 rounded bg-white border border-gray-300 hover:bg-gray-100 disabled:opacity-50 transition-colors">
              Prev
            </button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages || filtered.length === 0}
              className="px-2 py-1 rounded bg-white border border-gray-300 hover:bg-gray-100 disabled:opacity-50 transition-colors">
              Next
            </button>
          </div>
        </div>
      </div>

      {/* AI Suggestions Modal */}
      {showSuggestionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden border border-gray-200 flex flex-col animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="text-base font-bold text-gray-900">AI Delay Prevention Suggestions</h3>
                  <p className="text-xs text-gray-500">Optimise at-risk orders by reassigning them to recommended machines</p>
                </div>
              </div>
              <button
                onClick={() => setShowSuggestionsModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {activeSuggestions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm font-medium">All orders are scheduled optimally</p>
                  <p className="text-xs text-gray-400 mt-1">No pending delay risks detected.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeSuggestions.map((suggestion) => {
                    const order = orders.find((o) => o.id === suggestion.jobId);
                    const currentMachine = scheduleMap[suggestion.jobId]?.machines || (scheduleMap[suggestion.jobId] ? "Assigned" : "Unassigned");
                    const isApplied = currentMachine === suggestion.suggestedMachine;

                    return (
                      <div
                        key={suggestion.jobId}
                        className={`p-4 rounded-xl border transition-all ${
                          isApplied
                            ? "bg-emerald-50/50 border-emerald-200"
                            : "bg-gray-50 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                {suggestion.jobId}
                              </span>
                              {order && (
                                <span className="text-sm font-semibold text-gray-900">
                                  {order.customer}
                                </span>
                              )}
                              {order && (
                                <span className="text-xs text-gray-500">
                                  ({order.product} • {order.quantity.toLocaleString()} sheets)
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 font-medium mt-1">
                              Recommendation: Reassign from <span className="font-semibold text-gray-800">{currentMachine}</span> to{" "}
                              <span className="font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{suggestion.suggestedMachine}</span>
                            </p>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                              <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                              <span>{suggestion.reason} <strong className="text-gray-700">({suggestion.expectedImpact})</strong></span>
                            </div>
                          </div>

                          <div className="flex-shrink-0 flex items-center gap-2">
                            {isApplied ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-755" />
                                Applied
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleDismissSuggestion(suggestion.jobId)}
                                  title="Dismiss recommendation"
                                  className="p-1.5 border border-gray-300 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    onReassignOrders([suggestion.jobId], suggestion.suggestedMachine);
                                    addNotification(`Reassigned ${suggestion.jobId} to ${suggestion.suggestedMachine}`, "success");
                                  }}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg shadow-sm transition-colors"
                                >
                                  Reassign to {suggestion.suggestedMachine}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => setShowSuggestionsModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              {activeSuggestions.some(
                (s) => (scheduleMap[s.jobId]?.machines || (scheduleMap[s.jobId] ? "Assigned" : "Unassigned")) !== s.suggestedMachine
              ) && (
                <button
                  onClick={() => {
                    let count = 0;
                    activeSuggestions.forEach((s) => {
                      const currentMachine = scheduleMap[s.jobId]?.machines || (scheduleMap[s.jobId] ? "Assigned" : "Unassigned");
                      if (currentMachine !== s.suggestedMachine) {
                        onReassignOrders([s.jobId], s.suggestedMachine);
                        count++;
                      }
                    });
                    if (count > 0) {
                      addNotification(`Reassigned ${count} jobs successfully`, "success");
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
                >
                  Apply All Recommendations
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
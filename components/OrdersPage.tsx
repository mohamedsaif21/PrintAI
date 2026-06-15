"use client";
import { useState } from "react";
import { Order, ScheduleResult } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { format } from "date-fns";
import { Plus, Loader2 } from "lucide-react";

interface Props {
  orders: Order[];
  onScheduled: (order: Order, schedule: ScheduleResult) => void;
}

const PRODUCTS = ["Brochure", "Flyer", "Catalogue", "Poster", "Annual Report", "Business Card", "Newsletter"];
const PAPERS = ["Coated", "Uncoated", "Glossy", "Matte"];
const PRIORITIES = ["High", "Medium", "Low"] as const;

export function OrdersPage({ orders, onScheduled }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    customer: "",
    product: "Brochure",
    quantity: "10000",
    paperType: "Coated",
    priority: "High",
    deadlineHour: "18",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer.trim()) { setError("Customer name is required."); return; }
    if (Number(form.quantity) < 100) { setError("Quantity must be at least 100 sheets."); return; }
    // #1 — guard past deadline on client before hitting the API
    if (Number(form.deadlineHour) <= new Date().getHours()) { setError(`Deadline hour ${form.deadlineHour}:00 has already passed. Choose a later hour.`); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, quantity: Number(form.quantity), deadlineHour: Number(form.deadlineHour) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onScheduled(data.order, data.schedule);
      setForm({ customer: "", product: "Brochure", quantity: "10000", paperType: "Coated", priority: "High", deadlineHour: "18" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to schedule order");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* New order form */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">New order</h3>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Customer name</label>
              <input
                type="text" value={form.customer} onChange={(e) => set("customer", e.target.value)}
                placeholder="e.g. Acme Corp"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Product type</label>
              <select value={form.product} onChange={(e) => set("product", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {PRODUCTS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Quantity (sheets)</label>
              <input type="number" min="100" max="100000" value={form.quantity} onChange={(e) => set("quantity", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Paper type</label>
              <select value={form.paperType} onChange={(e) => set("paperType", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {PAPERS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => set("priority", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Deadline (hour, 8–22)</label>
              <input type="number" min="8" max="22" value={form.deadlineHour} onChange={(e) => set("deadlineHour", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
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

      {/* Order list */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Order list</h3>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {orders.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No orders yet. Submit one above.</p>
          )}
          {orders.map((o) => (
            <div key={o.id} className="px-5 py-3 flex items-center gap-4">
              <span className="font-mono text-xs text-gray-400 w-24">{o.id}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{o.customer}</p>
                <p className="text-xs text-gray-500">{o.product} · {o.paperType}</p>
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">{o.quantity.toLocaleString()}</span>
              <span className="text-xs text-gray-400">{format(new Date(o.deadline), "h:mm a")}</span>
              <Badge variant={o.priority === "High" ? "high" : o.priority === "Medium" ? "medium" : "low"}>{o.priority}</Badge>
              <Badge variant={o.status === "Scheduled" || o.status === "In Progress" ? "safe" : o.status === "At Risk" ? "risk" : "warn"}>{o.status}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

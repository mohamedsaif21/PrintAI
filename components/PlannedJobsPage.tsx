"use client";
import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/Badge";
import { PlannedJob, PlannedJobsStats, BulkOptimiseResult } from "@/types/planned-jobs";
import { Search, ChevronDown, Sparkles, LayoutList, LayoutGrid, Filter, MoreVertical, GripVertical, Loader2 } from "lucide-react";

interface Props {
  addNotification: (msg: string, type: "success" | "warn" | "info") => void;
}

export function PlannedJobsPage({ addNotification }: Props) {
  const [jobs, setJobs] = useState<PlannedJob[]>([]);
  const [stats, setStats] = useState<PlannedJobsStats>({ total: 0, prePress: 0, press: 0, postPress: 0, atRisk: 0 });
  const [loading, setLoading] = useState(true);
  const [optimising, setOptimising] = useState(false);
  
  // Filters
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [shiftFilter, setShiftFilter] = useState("All Shifts");
  const [operatorFilter, setOperatorFilter] = useState("All Operators");
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Reset to page 1 when filters change
  useEffect(() => {
    queueMicrotask(() => setCurrentPage(1));
  }, [searchQuery, stageFilter, shiftFilter, operatorFilter]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/api/planned-jobs?";
      if (stageFilter) url += `stage=${stageFilter}&`;
      if (shiftFilter !== "All Shifts") url += `shift=${shiftFilter}&`;
      if (operatorFilter !== "All Operators") url += `operator=${operatorFilter}&`;
      
      const res = await fetch(url);
      const data = await res.json();
      setJobs(data.jobs || []);
      setStats(data.stats || { total: 0, prePress: 0, press: 0, postPress: 0, atRisk: 0 });
    } catch {
      // Silent fail on load — no notification so Dashboard isn't polluted on first visit
    } finally {
      setLoading(false);
    }
  }, [stageFilter, shiftFilter, operatorFilter]);

  useEffect(() => {
    void Promise.resolve().then(fetchJobs);
  }, [fetchJobs]);

  const handleOptimise = async () => {
    const atRiskJobs = jobs.filter(j => j.wo_status === "High" || (j.printing_status === "Ongoing" && j.ageing > 5));
    if (atRiskJobs.length === 0) {
      addNotification("No at-risk jobs found to optimise.", "info");
      return;
    }

    setOptimising(true);
    try {
      const res = await fetch("/api/planned-jobs/optimise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: atRiskJobs })
      });
      const data: { suggestions?: BulkOptimiseResult[] } = await res.json();
      
      if (data.suggestions) {
        const suggestionsMap = new Map<string, BulkOptimiseResult>(
          data.suggestions.map((s) => [s.jobId, s])
        );
        setJobs(prev => prev.map(job => {
          const sug = suggestionsMap.get(job.id);
          return sug ? { ...job, ai_suggestion: `${sug.suggestedMachine} — ${sug.reason} (${sug.expectedImpact})` } : job;
        }));

        // Fire and forget PATCH requests to save suggestions to Supabase
        data.suggestions.forEach((sug: BulkOptimiseResult) => {
          fetch("/api/planned-jobs", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              id: sug.jobId, 
              ai_suggestion: `${sug.suggestedMachine} — ${sug.reason} (${sug.expectedImpact})` 
            })
          }).catch(() => {});
        });

        addNotification(`AI successfully optimised ${data.suggestions.length} jobs`, "success");
      }
    } catch {
      addNotification("AI optimisation failed", "warn");
    } finally {
      setOptimising(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredJobs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredJobs.map(j => j.id)));
  };

  const filteredJobs = jobs.filter(j => 
    j.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
    j.retailer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    j.facility.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination calculations
  const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedJobs = filteredJobs.slice(startIndex, startIndex + itemsPerPage);

  const statusToVariant = (status: string) => {
    switch(status) {
      case "Completed": return "safe";
      case "Ongoing": return "warn";
      case "Error": return "risk";
      default: return "gray";
    }
  };

  const woStatusToVariant = (status: string) => {
    switch(status) {
      case "High": return "high";
      case "Medium": return "medium";
      default: return "low";
    }
  };

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Planned Jobs ({stats.total})</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Production Plan</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md shadow-sm text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-colors">
            Today <ChevronDown className="w-4 h-4" />
          </button>
          <select 
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md shadow-sm text-gray-700 outline-none hover:border-gray-300 transition-colors"
          >
            <option>All Shifts</option>
            <option>Morning</option>
            <option>Afternoon</option>
            <option>Night</option>
          </select>
          <select 
            value={operatorFilter}
            onChange={(e) => setOperatorFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md shadow-sm text-gray-700 outline-none hover:border-gray-300 transition-colors"
          >
            <option>All Operators</option>
            <option>Sarah Jenkins</option>
            <option>David Chen</option>
            <option>Elena Rust</option>
          </select>
          <div className="flex items-center border border-gray-200 rounded-md shadow-sm bg-white p-0.5 ml-2">
            <button className="p-1 bg-gray-100 rounded shadow-sm" style={{ color: '#374151', backgroundColor: '#f3f4f6' }}><LayoutList className="w-4 h-4 text-gray-700" /></button>
            <button className="p-1" style={{ color: '#9ca3af', backgroundColor: 'transparent' }}><LayoutGrid className="w-4 h-4 text-gray-400" /></button>
          </div>
        </div>
      </div>

      {/* AI Banner */}
      {stats.atRisk > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span><strong className="font-semibold">{stats.atRisk}</strong> assigned jobs are at risk of delay.</span>
          </div>
          <button onClick={handleOptimise} disabled={optimising} className="text-sm font-medium text-blue-600 hover:underline" style={{ background: 'transparent', color: '#2563eb' }}>
            View AI suggestions
          </button>
        </div>
      )}

      {/* Stage Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { id: "pre-press", label: "Pre Press", count: stats.prePress },
          { id: "press", label: "Press", count: stats.press },
          { id: "post-press", label: "Post Press", count: stats.postPress }
        ].map((stage) => (
          <button 
            key={stage.id}
            onClick={() => setStageFilter(stageFilter === stage.id ? null : stage.id)}
            className={`p-4 rounded-xl border text-left transition-all ${
              stageFilter === stage.id 
                ? "border-blue-500 ring-1 ring-blue-500 bg-blue-50" 
                : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
            }`}
            style={{ color: 'inherit' }}
          >
            <p className="text-sm font-medium text-gray-500">{stage.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stage.count} <span className="text-base font-normal text-gray-400">Jobs</span></p>
          </button>
        ))}
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between mt-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 w-64 text-gray-900 placeholder-gray-400"
          />
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 transition-colors" style={{ color: '#4b5563' }}>
            <Filter className="w-4 h-4" />
          </button>
          <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors" style={{ color: '#374151', backgroundColor: '#f3f4f6' }}>
            Assign to
          </button>
          <button 
            onClick={handleOptimise}
            disabled={optimising}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-70"
            style={{ backgroundColor: '#111827', color: 'white' }}
          >
            {optimising ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            AI Optimise
          </button>
        </div>
      </div>

      {/* Table Area */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex-1 flex flex-col min-h-[400px]">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                <th className="py-3 pl-4 pr-2 font-normal"><input type="checkbox" onChange={selectAll} checked={filteredJobs.length > 0 && selectedIds.size === filteredJobs.length} className="rounded border-gray-300" /></th>
                <th className="py-3 px-2 font-normal"></th>
                <th className="py-3 px-4 font-normal flex items-center gap-1">Facility <Filter className="w-3 h-3" /></th>
                <th className="py-3 px-4 font-normal">Printing Status</th>
                <th className="py-3 px-4 font-normal">WOno</th>
                <th className="py-3 px-4 font-normal">WO Status</th>
                <th className="py-3 px-4 font-normal">SLA</th>
                <th className="py-3 px-4 font-normal">Ageing</th>
                <th className="py-3 px-4 font-normal">Machine</th>
                <th className="py-3 px-4 font-normal">Schedule Date</th>
                <th className="py-3 px-4 font-normal">Retailer</th>
                <th className="py-3 px-4 font-normal">Product ID</th>
                <th className="py-3 px-4 font-normal">Balance Qty</th>
                <th className="py-3 px-4 font-normal">CS Name</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100 text-gray-900">
              {loading ? (
                <tr><td colSpan={14} className="py-12 text-center text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : paginatedJobs.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-sm text-gray-500">No scheduled jobs yet</p>
                      <p className="text-xs text-gray-400">
                        Create an order from the Orders page to see planned jobs here.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="py-3 pl-4 pr-2"><input type="checkbox" checked={selectedIds.has(job.id)} onChange={() => toggleSelection(job.id)} className="rounded border-gray-300" /></td>
                    <td className="py-3 px-2 text-gray-400"><div className="flex items-center gap-1"><GripVertical className="w-4 h-4 cursor-grab" /><MoreVertical className="w-4 h-4 cursor-pointer" /></div></td>
                    <td className="py-3 px-4">{job.facility}</td>
                    <td className="py-3 px-4"><Badge variant={statusToVariant(job.printing_status)}>{job.printing_status}</Badge></td>
                    <td className="py-3 px-4 font-medium text-blue-600 cursor-pointer hover:underline flex items-center gap-1.5">
                      {job.id}
                      {job.ai_suggestion && <span title={job.ai_suggestion} className="cursor-help"><Sparkles className="w-3.5 h-3.5 text-amber-500" /></span>}
                    </td>
                    <td className="py-3 px-4"><Badge variant={woStatusToVariant(job.wo_status)}>{job.wo_status}</Badge></td>
                    <td className="py-3 px-4">{job.sla}h</td>
                    <td className="py-3 px-4">{job.ageing}d</td>
                    <td className="py-3 px-4 text-gray-600">{job.machine_name}</td>
                    <td className="py-3 px-4 text-gray-600">{new Date(job.schedule_date).toLocaleDateString("en-GB", { day: '2-digit', month: 'short' })}</td>
                    <td className="py-3 px-4 text-gray-600">{job.retailer}</td>
                    <td className="py-3 px-4 text-gray-600">{job.product_id}</td>
                    <td className="py-3 px-4">{job.balance_qty.toLocaleString()}</td>
                    <td className="py-3 px-4 text-gray-600">{job.cs_name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500 font-medium">
          <span>
            Showing {filteredJobs.length === 0 ? 0 : startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredJobs.length)} of {filteredJobs.length} entries 
            {filteredJobs.length !== stats.total && ` (filtered from ${stats.total})`}
          </span>
          <div className="flex gap-2">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || filteredJobs.length === 0}
              className="px-2 py-1 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
              style={{ color: '#4b5563' }}
            >
              Prev
            </button>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages || filteredJobs.length === 0}
              className="px-2 py-1 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
              style={{ color: '#4b5563' }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

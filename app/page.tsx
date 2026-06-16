"use client";
import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { DashboardPage } from "@/components/DashboardPage";
import { OrdersPage } from "@/components/OrdersPage";
import { PlannedJobsPage } from "@/components/PlannedJobsPage";
import { MachinesPage } from "@/components/MachinesPage";
import { SchedulePage } from "@/components/SchedulePage";
import { ReportsPage } from "@/components/ReportsPage";
import { Order, Machine, ScheduleResult, ScheduledTask } from "@/types";
import { DEFAULT_MACHINES } from "@/lib/scheduler";

type Notif = { msg: string; type: "success" | "warn" | "info" };

export default function Home() {
  const [page, setPage] = useState("dashboard");
  const [orders, setOrders] = useState<Order[]>([]);
  const [machines, setMachines] = useState<Machine[]>(DEFAULT_MACHINES);
  const [lastSchedule, setLastSchedule] = useState<ScheduleResult | null>(null);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [scheduleMap, setScheduleMap] = useState<Record<string, { slaStatus: string; slaDiff: number; machines?: string }>>({});

  const pushNotif = useCallback((msg: string, type: Notif["type"]) => {
    setNotifications((n) => [{ msg, type }, ...n].slice(0, 5));
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const [ordersRes, jobsRes] = await Promise.all([
        fetch("/api/orders"),
        fetch("/api/planned-jobs")
      ]);
      const ordersData = await ordersRes.json();
      const jobsData = await jobsRes.json();
      
      let fetchedOrders: Order[] = ordersData.orders || [];
      const fetchedJobs = jobsData.jobs || [];

      // Align order statuses with actual running Planned Jobs so Dashboard metrics match perfectly
      if (fetchedJobs.length > 0) {
        // Synthesize missing master orders so Dashboard counts align completely with Planned Jobs
        const uniqueOrderIds = Array.from(new Set(fetchedJobs.map((j: any) => j.order_id)));
        uniqueOrderIds.forEach((orderId: any) => {
          if (!fetchedOrders.some((o) => o.id === orderId)) {
            const job = fetchedJobs.find((j: any) => j.order_id === orderId);
            fetchedOrders.push({
              id: orderId,
              customer: job.retailer,
              product: job.production_type,
              quantity: job.wo_quantity,
              paperType: job.base_paper,
              priority: job.wo_status,
              deadline: job.ed_date,
              status: "Scheduled",
              createdAt: job.created_at
            });
          }
        });

        fetchedOrders = fetchedOrders.map(order => {
          const orderJobs = fetchedJobs.filter((j: any) => j.order_id === order.id);
          if (orderJobs.length === 0) return order; // No sub-jobs yet
          
          if (orderJobs.some((j: any) => j.printing_status === "Error")) return { ...order, status: "At Risk" };
          if (orderJobs.some((j: any) => j.printing_status === "Ongoing")) return { ...order, status: "In Progress" };
          if (orderJobs.every((j: any) => j.printing_status === "Completed")) return { ...order, status: "Completed" };
          return { ...order, status: "Scheduled" };
        });
      }
      setOrders(fetchedOrders);
    } catch {}
  }, []);

  const loadMachines = useCallback(async () => {
    try {
      const res = await fetch("/api/machines");
      const data = await res.json();
      setMachines(data.machines || DEFAULT_MACHINES);
    } catch {}
  }, []);

  useEffect(() => {
    loadOrders();
    loadMachines();
  }, [loadOrders, loadMachines]);

  // Load scheduleMap from sessionStorage on initial mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("scheduleMap");
      if (stored) setScheduleMap(JSON.parse(stored));
    } catch (e) {}
  }, []);

  function handleScheduled(order: Order, schedule: ScheduleResult) {
    setOrders((prev) => [order, ...prev]);
    setLastSchedule(schedule);
    setLastOrder(order);
    setScheduleMap((prev) => {
      const nextMap = { 
        ...prev, 
        [order.id]: { slaStatus: schedule.slaStatus, slaDiff: schedule.slaDiff, machines: schedule.tasks.map(t => t.machineId).join(", ") } 
      };
      sessionStorage.setItem("scheduleMap", JSON.stringify(nextMap));
      return nextMap;
    });
    pushNotif(`${order.id} scheduled — ETA ${new Date(schedule.overallFinish).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}, SLA ${schedule.slaStatus}`, schedule.slaStatus === "SAFE" ? "success" : "warn");
    setPage("schedule");
  }

  function handleFailure(data: { newTasks: ScheduledTask[]; result: ScheduleResult; failedMachineId: string; backupMachineId: string; remainingQty: number }) {
    setMachines((prev) =>
      prev.map((m) => {
        if (m.id === data.failedMachineId) return { ...m, status: "breakdown", utilisation: 0 };
        if (m.id === data.backupMachineId) return { ...m, status: "available", utilisation: 50 };
        return m;
      })
    );
    if (lastSchedule) {
      setLastSchedule({ ...data.result });
      setScheduleMap((prev) => {
        const nextMap = { 
          ...prev, 
          [data.result.orderId]: { slaStatus: data.result.slaStatus, slaDiff: data.result.slaDiff, machines: data.result.tasks.map(t => t.machineId).join(", ") } 
        };
        sessionStorage.setItem("scheduleMap", JSON.stringify(nextMap));
        return nextMap;
      });
    }
    pushNotif(`${data.failedMachineId} breakdown — ${data.remainingQty.toLocaleString()} pcs reassigned to ${data.backupMachineId}`, "warn");
  }

  function handleReset() {
    setMachines(DEFAULT_MACHINES);
  }

  const pageTitle: Record<string, string> = {
    dashboard: "Dashboard",
    orders: "Orders",
    "planned-jobs": "Planned Jobs",
    machines: "Machines",
    schedule: "AI Schedule",
    reports: "Reports",
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={page} onChange={setPage} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 flex items-center justify-between flex-shrink-0">
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">{pageTitle[page]}</h1>
          <Clock />
        </header>
        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {page === "dashboard" && (
            <DashboardPage orders={orders} machines={machines} lastSchedule={lastSchedule} notifications={notifications} />
          )}
          {page === "orders" && (
            <OrdersPage orders={orders} scheduleMap={scheduleMap} onScheduled={handleScheduled} addNotification={pushNotif} />
          )}
          {page === "planned-jobs" && (
            <PlannedJobsPage addNotification={pushNotif} />
          )}
          {page === "machines" && (
            <MachinesPage machines={machines} lastSchedule={lastSchedule} onFailure={handleFailure} onReset={handleReset} />
          )}
          {page === "schedule" && (
            <SchedulePage schedule={lastSchedule} order={lastOrder} />
          )}
          {page === "reports" && (
            <ReportsPage orders={orders} machines={machines} scheduleMap={scheduleMap} />
          )}
        </main>
      </div>
    </div>
  );
}

function Clock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="text-xs text-gray-400 tabular-nums">{time}</span>;
}

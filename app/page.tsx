"use client";
import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { DashboardPage } from "@/components/DashboardPage";
import { OrdersPage } from "@/components/OrdersPage";
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

  const pushNotif = (msg: string, type: Notif["type"]) => {
    setNotifications((n) => [{ msg, type }, ...n].slice(0, 5));
  };

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders");
      const data = await res.json();
      setOrders(data.orders || []);
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

  function handleScheduled(order: Order, schedule: ScheduleResult) {
    setOrders((prev) => [order, ...prev]);
    setLastSchedule(schedule);
    setLastOrder(order);
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
    }
    pushNotif(`${data.failedMachineId} breakdown — ${data.remainingQty.toLocaleString()} pcs reassigned to ${data.backupMachineId}`, "warn");
  }

  function handleReset() {
    setMachines(DEFAULT_MACHINES);
  }

  const pageTitle: Record<string, string> = {
    dashboard: "Dashboard",
    orders: "Orders",
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
            <OrdersPage orders={orders} onScheduled={handleScheduled} />
          )}
          {page === "machines" && (
            <MachinesPage machines={machines} lastSchedule={lastSchedule} onFailure={handleFailure} onReset={handleReset} />
          )}
          {page === "schedule" && (
            <SchedulePage schedule={lastSchedule} order={lastOrder} />
          )}
          {page === "reports" && (
            <ReportsPage orders={orders} machines={machines} />
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

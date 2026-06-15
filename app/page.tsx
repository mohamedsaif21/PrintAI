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
  const [scheduleMap, setScheduleMap] = useState<Record<string, "SAFE" | "RISK">>(() => {
    // #9 — rehydrate scheduleMap from sessionStorage so refresh doesn't wipe SLA state
    if (typeof window === "undefined") return {};
    try { return JSON.parse(sessionStorage.getItem("scheduleMap") || "{}"); } catch { return {}; }
  });

  const pushNotif = (msg: string, type: Notif["type"]) =>
    setNotifications((n) => [{ msg, type }, ...n].slice(0, 5));

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders");
      const data = await res.json();
      if (data.orders?.length) setOrders(data.orders);
    } catch {}
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Called when a new order is scheduled from OrdersPage
  function handleScheduled(order: Order, schedule: ScheduleResult) {
    setOrders((prev) => [order, ...prev]);
    setLastSchedule(schedule);
    setLastOrder(order);
    setScheduleMap((prev) => {
      const updated = { ...prev, [order.id]: schedule.slaStatus };
      sessionStorage.setItem("scheduleMap", JSON.stringify(updated));
      return updated;
    });
    // Update machine utilisations based on schedule tasks
    setMachines((prev) =>
      prev.map((m) => {
        const task = schedule.tasks.find((t) => t.machineId === m.id);
        if (task) {
          const pct = Math.min(100, Math.round((task.assignedQty / m.capacity) * 100));
          return { ...m, utilisation: pct };
        }
        return m;
      })
    );
    pushNotif(
      `${order.id} scheduled — ETA ${new Date(schedule.overallFinish).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}, SLA ${schedule.slaStatus}`,
      schedule.slaStatus === "SAFE" ? "success" : "warn"
    );
    setPage("schedule");
  }

  // Called when a breakdown is simulated from MachinesPage
  function handleFailure(data: {
    newTasks: ScheduledTask[];
    result: ScheduleResult;
    failedMachineId: string;
    backupMachineId: string;
    remainingQty: number;
  }) {
    // Update machine statuses
    setMachines((prev) =>
      prev.map((m) => {
        if (m.id === data.failedMachineId) return { ...m, status: "breakdown", utilisation: 0 };
        if (m.id === data.backupMachineId) return { ...m, status: "available", utilisation: 50 };
        return m;
      })
    );
    // Update last schedule with the new tasks
    if (lastSchedule) {
      setLastSchedule({ ...data.result });
    }
    // #10 — use orderId from the result, not lastOrder, so any order's SLA is updated correctly
    const affectedOrderId = data.result.orderId;
    if (affectedOrderId) {
      setScheduleMap((prev) => {
        const updated = { ...prev, [affectedOrderId]: data.result.slaStatus };
        sessionStorage.setItem("scheduleMap", JSON.stringify(updated));
        return updated;
      });
      if (data.result.slaStatus === "RISK") {
        setOrders((prev) =>
          prev.map((o) => (o.id === affectedOrderId ? { ...o, status: "At Risk" } : o))
        );
      }
    }
    pushNotif(
      `${data.failedMachineId} breakdown — ${data.remainingQty.toLocaleString()} pcs reassigned to ${data.backupMachineId}`,
      "warn"
    );
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
        <header className="h-14 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 flex items-center justify-between flex-shrink-0">
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">{pageTitle[page]}</h1>
          <Clock />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {page === "dashboard" && (
            <DashboardPage
              orders={orders}
              machines={machines}
              lastSchedule={lastSchedule}
              notifications={notifications}
            />
          )}
          {page === "orders" && (
            <OrdersPage orders={orders} onScheduled={handleScheduled} />
          )}
          {page === "machines" && (
            <MachinesPage
              machines={machines}
              lastSchedule={lastSchedule}
              onFailure={handleFailure}
              onReset={handleReset}
            />
          )}
          {page === "schedule" && (
            <SchedulePage schedule={lastSchedule} order={lastOrder} />
          )}
          {page === "reports" && (
            <ReportsPage orders={orders} machines={machines} schedules={scheduleMap} />
          )}
        </main>
      </div>
    </div>
  );
}

function Clock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="text-xs text-gray-400 tabular-nums">{time}</span>;
}
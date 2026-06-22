"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Bell } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { DashboardPage } from "@/components/DashboardPage";
import { OrdersPage } from "@/components/OrdersPage";
import { MachinesPage } from "@/components/MachinesPage";
import { SchedulePage } from "@/components/SchedulePage";
import { ReportsPage } from "@/components/ReportsPage";
import { Order, Machine, OrderStatus, ScheduleResult, ScheduledTask, PreemptionEvent, QueuedJob, Material } from "@/types";
import { DEFAULT_MACHINES, dispatchScheduleToMachines, normaliseMachine, seedM2WithRunningJob, tickMachines, SEED_M2_ORDER_ID } from "@/lib/scheduler";
import { computeSlaStatus } from "@/lib/safeMath";

type Notif = { msg: string; type: "success" | "warn" | "info" };
type ScheduleMap = Record<string, { slaStatus: string; slaDiff: number; machines?: string }>;
const TICK_INTERVAL_MS = 3000;

function machinesFromSchedule(machines: Machine[], order: Order, schedule: ScheduleResult): Machine[] {
  return dispatchScheduleToMachines(order, schedule, machines.map(normaliseMachine)).machines;
}

export default function Home() {
  const [page, setPage] = useState("dashboard");
  const [orders, setOrders] = useState<Order[]>([]);
  const [machines, setMachines] = useState<Machine[]>(DEFAULT_MACHINES);
  const [lastSchedule, setLastSchedule] = useState<ScheduleResult | null>(null);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [materialsList, setMaterialsList] = useState<Material[]>([]);
  const machinesRef = useRef<Machine[]>(machines);
  const ordersRef = useRef<Order[]>(orders);
  const [scheduleMap, setScheduleMap] = useState<ScheduleMap>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = sessionStorage.getItem("scheduleMap");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const pushNotif = useCallback((msg: string, type: Notif["type"]) => {
    setNotifications((n) => [{ msg, type }, ...n].slice(0, 5));
  }, []);

  useEffect(() => {
    machinesRef.current = machines;
  }, [machines]);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

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
      const list: Machine[] = (data.machines || DEFAULT_MACHINES).map(normaliseMachine);
      
      const sanitized = list.map((m) => {
        if (m.id !== "M2" && m.queue.length === 0 && m.status === "busy") {
          return {
            ...m,
            status: m.id === "M5" ? ("backup" as const) : ("available" as const),
            utilisation: 0,
            assignedOrderId: undefined,
          };
        }
        return m;
      });

      sanitized.sort((a, b) => a.id.localeCompare(b.id));
      setMachines(seedM2WithRunningJob(sanitized));
    } catch {
      const list = [...DEFAULT_MACHINES].sort((a, b) => a.id.localeCompare(b.id));
      setMachines(seedM2WithRunningJob(list));
    }
  }, []);

  const loadMaterials = useCallback(async () => {
    try {
      const res = await fetch("/api/materials");
      if (res.ok) {
        const data = await res.json();
        setMaterialsList(data || []);
      }
    } catch (err) {
      console.error("Failed to load materials:", err);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void Promise.all([loadOrders(), loadMachines(), loadMaterials()]);
    });
  }, [loadOrders, loadMachines, loadMaterials]);

  // Reconcile machine busy status with existing orders (heal state if database/local queues are out of sync)
  useEffect(() => {
    if (machines.length === 0) return;
    
    let changed = false;
    const reconciled = machines.map((m) => {
      if (m.status === "busy" && m.assignedOrderId && m.assignedOrderId !== SEED_M2_ORDER_ID) {
        const orderExists = orders.some((o) => o.id === m.assignedOrderId && o.status !== "Completed" && o.status !== "Rejected");
        if (!orderExists) {
          changed = true;
          const nextStatus = m.id === "M5" ? "backup" as const : "available" as const;
          return {
            ...m,
            status: nextStatus,
            utilisation: 0,
            assignedOrderId: undefined,
            queue: m.queue.filter((q) => q.orderId !== m.assignedOrderId),
          };
        }
      }
      return m;
    });
    
    if (changed) {
      setMachines(reconciled);
      // Update database in background
      reconciled.forEach((m) => {
        fetch("/api/machines", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: m.id, status: m.status, utilisation: 0 }),
        }).catch(() => {});
      });
    }
  }, [orders, machines]);

  useEffect(() => {
    const id = setInterval(() => {
      const { machines: updatedMachines, justCompleted } = tickMachines(machinesRef.current, ordersRef.current);
      
      if (justCompleted.length === 0) {
        let hasChanges = false;
        for (let i = 0; i < machinesRef.current.length; i++) {
          if (machinesRef.current[i] !== updatedMachines[i]) hasChanges = true;
        }
        if (hasChanges) setMachines(updatedMachines);
        return;
      }

      const completedByOrder = justCompleted.reduce<Record<string, string[]>>((acc, item) => {
        acc[item.orderId] = [...(acc[item.orderId] || []), item.machineId];
        return acc;
      }, {});
      const remainingOrderIds = new Set(
        updatedMachines.flatMap((machine) =>
          machine.queue
            .filter((job) => job.status === "running" || job.status === "queued")
            .map((job) => job.orderId)
        )
      );

      // Track state changes when jobs complete
      const machinesWithStateUpdate = updatedMachines.map((m) => {
        const completed = justCompleted.find((c) => c.machineId === m.id);
        if (!completed) return m;
        
        const stateLog = {
          timestamp: new Date().toISOString(),
          status: m.status,
          orderId: completed.orderId,
          reason: `Job ${completed.orderId} completed`,
        };
        
        return {
          ...m,
          stateHistory: [...(m.stateHistory || []), stateLog],
        };
      });

      setMachines(machinesWithStateUpdate);
      Object.entries(completedByOrder).forEach(([orderId, machineIds]) => {
        if (orderId === SEED_M2_ORDER_ID) {
          pushNotif(`M2 seed job completed - machine is now available.`, "success");
          return;
        }
        if (remainingOrderIds.has(orderId)) {
          pushNotif(`${orderId} finished on ${machineIds.join(", ")}; other machine tasks are still running.`, "info");
          return;
        }

        setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, status: "Completed" } : order)));
        setLastOrder((prev) => (prev?.id === orderId ? { ...prev, status: "Completed" } : prev));
        pushNotif(`${orderId} completed on all assigned machines.`, "success");
        
        // Persist completion status to database
        fetch("/api/orders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: orderId, status: "Completed" }),
        }).then(() => {
          void loadMaterials();
        }).catch((err) => {
          console.error("Failed to persist order completion:", err);
          pushNotif(`Warning: ${orderId} completion not saved to database`, "warn");
        });
      });
    }, TICK_INTERVAL_MS);

    return () => clearInterval(id);
  }, [pushNotif]);

  function handleScheduled(order: Order, schedule: ScheduleResult, updatedMachines?: Machine[], preemptionEvents: PreemptionEvent[] = []) {
    setOrders((prev) => [order, ...prev]);
    setLastSchedule(schedule);
    setLastOrder(order);
    const nextMachines = updatedMachines?.map(normaliseMachine) || machinesFromSchedule(machines, order, schedule);
    
    // Track state changes for machines involved in this schedule
    const machinesWithHistory = nextMachines.map((m) => {
      const task = schedule.tasks.find((t) => t.machineId === m.id);
      if (!task) return m;
      
      const stateLog = {
        timestamp: new Date().toISOString(),
        status: "busy" as const,
        orderId: order.id,
        reason: "Order scheduled",
      };
      
      return {
        ...m,
        stateHistory: [...(m.stateHistory || []), stateLog],
      };
    });
    
    setMachines(machinesWithHistory);
    
    schedule.tasks.forEach((task) => {
      const machine = machines.find((item) => item.id === task.machineId);
      fetch("/api/machines", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: task.machineId,
          status: "busy",
          utilisation: machine ? Math.min(100, Math.max(10, Math.round((task.assignedQty / machine.capacity) * 100))) : 50,
          assignedOrderId: order.id,
        }),
      }).catch(() => {});
    });
    setScheduleMap((prev) => {
      const nextMap = {
        ...prev,
        [order.id]: {
          slaStatus: schedule.slaStatus,
          slaDiff: schedule.slaDiff,
          machines: schedule.tasks.map((task) => task.machineId).join(", "),
        },
      };
      sessionStorage.setItem("scheduleMap", JSON.stringify(nextMap));
      return nextMap;
    });
    preemptionEvents.forEach((event) => {
      const message =
        event.reason === "preempted"
          ? `${event.newOrderId} preempted ${event.bumpedOrderId} on ${event.machineId} at ${event.bumpedProgressPercent}% progress.`
          : `${event.newOrderId} moved to M5 because ${event.machineId} already had same-priority work.`;
      pushNotif(message, "warn");
    });
    pushNotif(`${order.id} scheduled — ETA ${new Date(schedule.overallFinish).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}, SLA ${schedule.slaStatus}`, schedule.slaStatus === "SAFE" ? "success" : "warn");
    setPage("schedule");
    void loadMaterials();
  }

  function handleReassignOrders(orderIds: string[], targetMachineId: string) {
    const targetMachine = machines.find((m) => m.id === targetMachineId);
    if (!targetMachine) return;

    setOrders((prevOrders) => {
      const affectedOrders = prevOrders.filter((o) => orderIds.includes(o.id));
      if (affectedOrders.length === 0) return prevOrders;

      setMachines((prevMachines) => {
        let working = prevMachines.map(normaliseMachine);

        // Remove these orders from all machine queues
        working = working.map((m) => {
          const filteredQueue = m.queue.filter((job) => !orderIds.includes(job.orderId));
          if (filteredQueue.length === m.queue.length) return m;

          // If we removed the currently running job on this machine, and there's a next job,
          // resume it or mark it paused so the tick engine auto-starts it
          let nextQueue = filteredQueue;
          if (nextQueue.length > 0 && m.queue[0] && orderIds.includes(m.queue[0].orderId)) {
            if (nextQueue[0].status === "queued") {
              nextQueue[0] = { ...nextQueue[0], status: "paused" as const };
            }
          }

          const nextStatus = nextQueue.length === 0 && m.status === "busy"
            ? (m.id === "M5" ? "backup" as const : "available" as const)
            : m.status;

          return {
            ...m,
            queue: nextQueue,
            status: nextStatus,
            assignedOrderId: nextQueue.length > 0 ? nextQueue[0].orderId : undefined,
            utilisation: nextQueue.length === 0 ? 0 : m.utilisation,
          };
        });

        // Add each order to target machine
        for (const order of affectedOrders) {
          const quantity = order.quantity;
          const speed = targetMachine.speed;
          const estimatedHours = parseFloat((quantity / speed).toFixed(2));
          const estimatedFinish = new Date(Date.now() + estimatedHours * 60 * 60 * 1000).toISOString();

          // Recompute SLA status
          const { slaStatus, slaDiff } = computeSlaStatus(order.deadline, estimatedFinish);

          // Update local scheduleMap state & sessionStorage
          setScheduleMap((prevMap) => {
            const nextMap = {
              ...prevMap,
              [order.id]: {
                slaStatus,
                slaDiff,
                machines: targetMachineId,
              },
            };
            sessionStorage.setItem("scheduleMap", JSON.stringify(nextMap));
            return nextMap;
          });

          // Build new QueuedJob and append to target machine queue
          const targetIdx = working.findIndex((m) => m.id === targetMachineId);
          if (targetIdx !== -1) {
            const m = working[targetIdx];
            const newJob: QueuedJob = {
              jobId: `${targetMachineId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              orderId: order.id,
              machineId: targetMachineId,
              priority: order.priority,
              assignedQty: quantity,
              estimatedHours,
              totalEstimatedHours: estimatedHours,
              startedAt: new Date().toISOString(),
              realFinishAt: estimatedFinish,
              status: m.queue.length === 0 ? "running" as const : "queued" as const,
            };

            const queue = [...m.queue, newJob];
            const nextStatus = m.status === "available" || m.status === "backup" ? "busy" as const : m.status;

            working[targetIdx] = {
              ...m,
              status: nextStatus,
              queue,
              assignedOrderId: queue[0].orderId,
              utilisation: Math.min(100, Math.max(10, Math.round((queue[0].assignedQty / m.capacity) * 100))),
            };
          }

          // Persist schedule changes to the database
          const tasks = [{
            machineId: targetMachineId,
            machineSpeed: speed,
            assignedQty: quantity,
            estimatedHours,
            estimatedFinish,
          }];

          fetch("/api/schedule", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: order.id,
              tasks,
              overallFinish: estimatedFinish,
              slaStatus,
              slaDiff,
            }),
          }).catch((err) => console.error("Database error reassigning order:", err));
        }

        return working;
      });

      // Map orders state to update status if needed
      return prevOrders.map((o) => {
        if (orderIds.includes(o.id) && o.status === "Pending Approval") {
          return { ...o, status: "Scheduled" as const };
        }
        return o;
      });
    });

    pushNotif(`Manually reassigned ${orderIds.length} job(s) to ${targetMachineId}`, "success");
    void loadMaterials();
  }

  async function handleDeleteOrder(orderId: string) {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete order");

      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setMachines((prev) =>
        prev.map((m) => {
          const newQueue = m.queue.filter((job) => job.orderId !== orderId);
          if (newQueue.length === m.queue.length) return m;

          // If we removed the currently active job, and the next job is 'queued',
          // mark it as 'paused' so the tick engine will automatically start it cleanly.
          if (newQueue.length > 0 && m.queue[0].orderId === orderId && newQueue[0].status === "queued") {
            newQueue[0] = { ...newQueue[0], status: "paused" as const };
          }

          const newStatus = newQueue.length === 0 && m.status === "busy" 
            ? (m.id === "M5" ? "backup" as const : "available" as const) 
            : m.status;

          return {
            ...m,
            queue: newQueue,
            status: newStatus,
            assignedOrderId: newQueue.length > 0 ? newQueue[0].orderId : undefined,
            utilisation: newQueue.length === 0 ? 0 : m.utilisation,
          };
        })
      );
      pushNotif(`Order ${orderId} deleted successfully`, "success");
      void loadMaterials();
    } catch (err) {
      console.error(err);
      pushNotif(`Failed to delete order ${orderId}`, "warn");
    }
  }

  async function handleOrderStatusUpdate(orderId: string, status: Order["status"]) {
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, status }),
      });
      if (!res.ok) throw new Error("Failed to update status");

      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));

      if (status === "Completed") {
        setMachines((prev) =>
          prev.map((m) => {
            const newQueue = m.queue.filter((job) => job.orderId !== orderId);
            if (newQueue.length === m.queue.length) return m;

            // If we removed the currently active job, and the next job is 'queued',
            // mark it as 'paused' so the tick engine will automatically start it cleanly.
            if (newQueue.length > 0 && m.queue[0].orderId === orderId && newQueue[0].status === "queued") {
              newQueue[0] = { ...newQueue[0], status: "paused" as const };
            }

            const newStatus = newQueue.length === 0 && m.status === "busy" 
              ? (m.id === "M5" ? "backup" as const : "available" as const) 
              : m.status;

            return {
              ...m,
              queue: newQueue,
              status: newStatus,
              assignedOrderId: newQueue.length > 0 ? newQueue[0].orderId : undefined,
              utilisation: newQueue.length === 0 ? 0 : m.utilisation,
            };
          })
        );
      }
      pushNotif(`Order ${orderId} marked as ${status}`, "success");
      void loadMaterials();
    } catch (err) {
      console.error(err);
      pushNotif(`Failed to update status for ${orderId}`, "warn");
    }
  }

  function handleApprovalDecision(orderId: string, status: any) {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    setLastOrder((prev) => (prev?.id === orderId ? { ...prev, status } : prev));
    pushNotif(`${orderId} ${status === "In Progress" ? "approved for execution" : "rejected for review"}`, status === "In Progress" ? "success" : "warn");

    if (status === "Rejected") {
      setMachines((prev) =>
        prev.map((m) => {
          const newQueue = m.queue.filter((job) => job.orderId !== orderId);
          if (newQueue.length === m.queue.length) return m;
          
          // If we removed the currently active job, and the next job is 'queued',
          // mark it as 'paused' so the tick engine will automatically start it cleanly.
          if (newQueue.length > 0 && m.queue[0].orderId === orderId && newQueue[0].status === "queued") {
            newQueue[0] = { ...newQueue[0], status: "paused" };
          }
          
          const newStatus = newQueue.length === 0 && m.status === "busy" 
            ? (m.id === "M5" ? "backup" : "available") 
            : m.status;
            
          return {
            ...m,
            queue: newQueue,
            status: newStatus,
            assignedOrderId: newQueue.length > 0 ? newQueue[0].orderId : undefined,
            utilisation: newQueue.length === 0 ? 0 : m.utilisation,
          };
        })
      );
    }

    fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, status }),
    }).then(() => {
      void loadMaterials();
    }).catch(() => {});
  }

  function handleFailure(data: { newTasks: ScheduledTask[]; result: ScheduleResult; failedMachineId: string; backupMachineId: string; remainingQty: number }) {
    const breakdownTimestamp = new Date();
    setMachines((prev) =>
      prev.map((m) => {
        if (m.id === data.failedMachineId) {
          const newLog = {
            date: breakdownTimestamp.toLocaleDateString(),
            start: breakdownTimestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            duration: "Ongoing",
            reason: "Simulated breakdown",
            action: "Pending resolution",
            loggedBy: "System",
            impact: m.assignedOrderId || "N/A",
          };
          
          const stateLog = {
            timestamp: breakdownTimestamp.toISOString(),
            status: "breakdown" as const,
            orderId: m.assignedOrderId,
            reason: "Machine breakdown",
          };
          
          return { 
            ...m, 
            status: "breakdown", 
            utilisation: 0, 
            assignedOrderId: undefined, 
            queue: [],
            downtimeLogs: [newLog, ...(m.downtimeLogs || [])],
            stateHistory: [...(m.stateHistory || []), stateLog],
          };
        }
        if (m.id === data.backupMachineId) {
          const task = data.newTasks.find((item) => item.machineId === m.id);
          if (!task) return { ...m, status: "busy", utilisation: 50 };
          
          const stateLog = {
            timestamp: new Date().toISOString(),
            status: "busy" as const,
            orderId: data.result.orderId,
            reason: "Backup assignment",
          };
          
          return {
            ...m,
            status: "busy",
            assignedOrderId: data.result.orderId,
            utilisation: Math.min(100, Math.max(10, Math.round((task.assignedQty / m.capacity) * 100))),
            queue: [
              {
                jobId: `${task.machineId}-${Date.now()}`,
                orderId: data.result.orderId,
                machineId: m.id,
                priority: lastOrder?.priority || "High",
                assignedQty: task.assignedQty,
                estimatedHours: task.estimatedHours,
                totalEstimatedHours: task.estimatedHours,
                startedAt: new Date().toISOString(),
                realFinishAt: task.estimatedFinish,
                status: "running",
              },
            ],
            stateHistory: [...(m.stateHistory || []), stateLog],
          };
        }
        return m;
      })
    );
    if (lastSchedule) {
      setLastSchedule({ ...data.result });
      setScheduleMap((prev) => {
        const nextMap = {
          ...prev,
          [data.result.orderId]: {
            slaStatus: data.result.slaStatus,
            slaDiff: data.result.slaDiff,
            machines: data.result.tasks.map((task) => task.machineId).join(", "),
          },
        };
        sessionStorage.setItem("scheduleMap", JSON.stringify(nextMap));
        return nextMap;
      });
    }
    pushNotif(`${data.failedMachineId} breakdown — ${data.remainingQty.toLocaleString()} pcs reassigned to ${data.backupMachineId}`, "warn");
  }

  function handleReset() {
    setMachines((prev) => 
      seedM2WithRunningJob(DEFAULT_MACHINES).map((defaultMachine) => {
        const existing = prev.find((m) => m.id === defaultMachine.id);
        if (!existing) return defaultMachine;
        
        // Preserve downtime logs and update any ongoing breakdowns to completed
        const updatedLogs = (existing.downtimeLogs || []).map((log) => {
          if (log.duration === "Ongoing") {
            const endTime = new Date();
            const startTime = new Date(`${log.date} ${log.start}`);
            const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);
            return {
              ...log,
              end: endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              duration: durationMinutes > 60 
                ? `${Math.floor(durationMinutes / 60)} hr ${durationMinutes % 60} min`
                : `${durationMinutes} min`,
              action: "Machine reset and repaired",
            };
          }
          return log;
        });
        
        // Add state log for repair/reset
        const stateLog = {
          timestamp: new Date().toISOString(),
          status: defaultMachine.status,
          reason: "Machine repaired and reset",
        };
        
        return {
          ...defaultMachine,
          downtimeLogs: updatedLogs,
          stateHistory: [...(existing.stateHistory || []), stateLog],
        };
      })
    );
  }

  const getDynamicMaterials = (): Material[] => {
    return materialsList.map((mat) => {
      let consumedFromAvailable = 0;
      
      machines.forEach((m) => {
        m.queue.forEach((job) => {
          if (job.status === "running") {
            const order = orders.find((o) => o.id === job.orderId);
            const paperType = order ? order.paperType : (m.paperTypes[0] || "Glossy");
            
            if (mat.name.toLowerCase().includes(paperType.toLowerCase())) {
              const start = new Date(job.startedAt).getTime();
              const finish = new Date(job.realFinishAt).getTime();
              const now = Date.now();
              const duration = finish - start;
              const percent = duration > 0 ? Math.min(1, Math.max(0, (now - start) / duration)) : 0;
              
              consumedFromAvailable += Math.round(percent * job.assignedQty);
            }
          }
        });
      });
      
      const dynamicAvailable = Math.max(0, mat.available_stock - consumedFromAvailable);
      
      return {
        ...mat,
        // total_stock is the original total, it should not change dynamically here.
        // available_stock is what we update for the UI to show live progress.
        available_stock: dynamicAvailable
      };
    });
  };

  const pageTitle: Record<string, string> = {
    dashboard: "Dashboard",
    orders: "Orders",
    machines: "Machines",
    schedule: "AI Schedule",
    reports: "Reports",
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'rgb(242,243,248)' }}>
      <Sidebar active={page} onChange={setPage} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 px-6 flex items-center justify-between flex-shrink-0" style={{ backgroundColor: 'rgb(82, 82, 82)', borderBottom: '1px solid rgb(82, 82, 82)' }}>
          <div>
            <h1 className="text-sm font-semibold text-white leading-tight">{pageTitle[page]}</h1>
            <p className="text-[10px] text-gray-300">Production Plan / {pageTitle[page]}</p>
          </div>
          
          <div className="flex items-center gap-4">
            <Clock />
            <button className="p-1.5 rounded-full text-gray-300 hover:text-white hover:bg-gray-700/50 transition-colors">
              <Bell className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-gray-700" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center">
                PU
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-semibold text-white leading-none">Planner User</p>
                <p className="text-[9px] text-gray-300 mt-0.5">Admin</p>
              </div>
            </div>
          </div>
        </header>
        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {page === "dashboard" && (
            <DashboardPage orders={orders} machines={machines} lastSchedule={lastSchedule} notifications={notifications} materials={getDynamicMaterials()} rawMaterials={materialsList} onRestockComplete={loadMaterials} />
          )}
          {page === "orders" && (
            <OrdersPage
              orders={orders}
              machines={machines}
              scheduleMap={scheduleMap}
              onScheduled={handleScheduled}
              onReassignOrders={handleReassignOrders}
              onOrderDeleted={handleDeleteOrder}
              onOrderStatusUpdate={handleOrderStatusUpdate}
              addNotification={pushNotif}
            />
          )}
          {page === "machines" && (
            <MachinesPage machines={machines} orders={orders} lastSchedule={lastSchedule} onFailure={handleFailure} onReset={handleReset} />
          )}
          {page === "schedule" && (
            <SchedulePage schedule={lastSchedule} order={lastOrder} onApprovalDecision={handleApprovalDecision} />
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
  return <span className="text-xs text-gray-200 tabular-nums">{time}</span>;
}

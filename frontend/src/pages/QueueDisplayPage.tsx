import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Doctor, Queue } from "../api/types";

/** Full-screen "now serving" board for a TV in the waiting area. Shows tokens only, no patient names. */
export default function QueueDisplayPage() {
  const [params] = useSearchParams();
  const doctorId = params.get("doctor");
  const [queue, setQueue] = useState<Queue | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);

  useEffect(() => {
    if (!doctorId) return;
    api.get<Doctor>(`/doctors/${doctorId}/`).then((r) => setDoctor(r.data));
    const load = () => api.get<Queue>("/appointments/queue/", { params: { doctor: doctorId } }).then((r) => setQueue(r.data));
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [doctorId]);

  const serving = queue?.current[0]?.token_no;
  const next = queue?.waiting.slice(0, 5).map((a) => a.token_no) ?? [];

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#063f50", color: "#fff", padding: "4vh 4vw", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ fontSize: "4vh", opacity: 0.85 }}>{doctor ? `${doctor.name} · ${doctor.department_name}` : ""}</div>
      <div style={{ marginTop: "6vh", fontSize: "5vh", opacity: 0.8 }}>Now serving</div>
      <div style={{ fontSize: "30vh", fontWeight: 700, lineHeight: 1 }}>{serving ?? "–"}</div>
      <div style={{ marginTop: "6vh", fontSize: "4vh", opacity: 0.8 }}>Next</div>
      <div style={{ display: "flex", gap: "3vw", fontSize: "10vh", fontWeight: 600 }}>
        {next.length ? next.map((t) => <span key={t}>{t}</span>) : <span style={{ opacity: 0.5 }}>–</span>}
      </div>
    </div>
  );
}

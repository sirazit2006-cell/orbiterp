import { Spin } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, Page } from "../api/client";
import type { Appointment, Consultation, Doctor, Hospital, Vitals } from "../api/types";
import { vitalsLine } from "../components/VitalsSummary";

/** A4 prescription on the hospital's letterhead; opens the print dialog once loaded. */
export default function PrintPrescriptionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<{ a: Appointment; c: Consultation; v: Vitals | null; h: Hospital; d: Doctor | undefined } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const a = (await api.get<Appointment>(`/appointments/${id}/`)).data;
        const [c, v, h, d] = await Promise.all([
          api.get<Consultation>(`/appointments/${id}/consultation/`),
          api.get<Vitals | null>(`/appointments/${id}/vitals/`),
          api.get<Hospital>("/hospital/"),
          api.get<Page<Doctor>>("/doctors/", { params: { page_size: 500 } }),
        ]);
        setData({ a, c: c.data, v: v.data || null, h: h.data, d: d.data.results.find((x) => x.id === a.doctor) });
      } catch {
        setError(true);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (data) window.setTimeout(() => window.print(), 300);
  }, [data]);

  if (error) return <p style={{ padding: 24 }}>Could not load this prescription.</p>;
  if (!data) return <Spin style={{ margin: 24 }} />;
  const { a, c, v, h, d } = data;

  return (
    <div className="rx">
      <style>{`
        @page { size: A4; margin: 14mm; }
        body { background: #fff; }
        .rx { max-width: 760px; margin: 0 auto; padding: 24px; font: 13px/1.5 system-ui, sans-serif; color: #111; }
        .rx h1 { font-size: 20px; margin: 0; color: #0b6e8a; }
        .rx .head { display: flex; justify-content: space-between; border-bottom: 2px solid #0b6e8a; padding-bottom: 8px; }
        .rx .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 24px; margin: 12px 0; padding-bottom: 8px; border-bottom: 1px solid #ccc; }
        .rx table { width: 100%; border-collapse: collapse; margin: 8px 0; }
        .rx th, .rx td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #e3e3e3; vertical-align: top; }
        .rx th { font-size: 12px; color: #555; }
        .rx h3 { font-size: 13px; margin: 14px 0 4px; text-transform: uppercase; letter-spacing: .04em; color: #444; }
        .rx .sign { margin-top: 48px; text-align: right; }
        @media print { .noprint { display: none; } .rx { padding: 0; } }
      `}</style>
      <div className="head">
        <div>
          <h1>{h.name}</h1>
          {h.address && <div>{h.address}</div>}
          {h.phone && <div>Phone: {h.phone}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <b>{a.doctor_name}</b>
          {d?.qualification && <div>{d.qualification}</div>}
          <div>{d?.specialization || a.department_name}</div>
          {d && <div>Reg. no. {d.registration_no}</div>}
        </div>
      </div>
      <div className="meta">
        <div><b>{a.patient_name}</b> · {a.patient_age ?? "?"} yrs · {{ M: "Male", F: "Female", O: "Other" }[a.patient_gender]}</div>
        <div style={{ textAlign: "right" }}>Date: {dayjs(a.date).format("DD MMM YYYY")}</div>
        <div>UHID: {a.patient_uhid}</div>
        <div style={{ textAlign: "right" }}>Mobile: {a.patient_mobile}</div>
        {v && vitalsLine(v) && <div style={{ gridColumn: "1 / 3" }}>Vitals: {vitalsLine(v)}</div>}
        {v?.allergies && <div style={{ gridColumn: "1 / 3" }}><b>Allergies: {v.allergies}</b></div>}
      </div>
      {c.complaints && (<><h3>Complaints</h3><div style={{ whiteSpace: "pre-wrap" }}>{c.complaints}</div></>)}
      {c.examination && (<><h3>Examination</h3><div style={{ whiteSpace: "pre-wrap" }}>{c.examination}</div></>)}
      {c.diagnoses.length > 0 && (
        <><h3>Diagnosis</h3><div>{c.diagnoses.map((x) => x.text + (x.icd10_code ? ` (${x.icd10_code})` : "")).join("; ")}</div></>
      )}
      {c.prescriptions.length > 0 && (
        <>
          <h3>℞</h3>
          <table>
            <thead><tr><th>#</th><th>Medicine</th><th>Dose</th><th>When</th><th>For</th><th>Route</th><th>Instructions</th></tr></thead>
            <tbody>
              {c.prescriptions.map((p, i) => (
                <tr key={i}>
                  <td>{i + 1}</td><td><b>{p.medicine_name}</b></td><td>{p.dose}</td><td>{p.frequency}</td>
                  <td>{p.duration}</td><td>{p.route_label}</td><td>{p.instructions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {c.investigations.length > 0 && (<><h3>Investigations</h3><div>{c.investigations.map((i) => i.service_name).join(", ")}</div></>)}
      {c.advice && (<><h3>Advice</h3><div style={{ whiteSpace: "pre-wrap" }}>{c.advice}</div></>)}
      {c.follow_up_date && (<><h3>Follow-up</h3><div>{dayjs(c.follow_up_date).format("dddd, DD MMM YYYY")}</div></>)}
      {c.referral_doctor_name && (<><h3>Referred to</h3><div>{c.referral_doctor_name}{c.referral_note ? `: ${c.referral_note}` : ""}</div></>)}
      <div className="sign">
        <div style={{ height: 40 }} />
        <b>{a.doctor_name}</b>
        <div>Signature</div>
      </div>
      <div className="noprint" style={{ marginTop: 24, display: "flex", gap: 8 }}>
        <button onClick={() => window.print()}>Print again</button>
        <button onClick={() => navigate(`/opd/${id}`)}>Back to the consultation</button>
        <button onClick={() => navigate(`/queue?doctor=${a.doctor}`)}>Back to the queue</button>
      </div>
    </div>
  );
}

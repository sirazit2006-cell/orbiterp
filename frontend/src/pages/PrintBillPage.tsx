import { Spin } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Bill, Hospital } from "../api/types";
import { CATEGORY_LABEL, inr, inWords, num } from "../components/billing/money";

/** A5 OPD bill with its receipts; opens the print dialog once loaded. */
export default function PrintBillPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<{ b: Bill; h: Hospital } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([api.get<Bill>(`/bills/${id}/`), api.get<Hospital>("/hospital/")])
      .then(([b, h]) => setData({ b: b.data, h: h.data }))
      .catch(() => setError(true));
  }, [id]);

  useEffect(() => {
    if (data) window.setTimeout(() => window.print(), 300);
  }, [data]);

  if (error) return <p style={{ padding: 24 }}>Could not load this bill.</p>;
  if (!data) return <Spin style={{ margin: 24 }} />;
  const { b, h } = data;
  const taxed = b.items.some((i) => num(i.tax_amount) > 0);
  const discounted = num(b.discount_total) > 0;
  const received = num(b.paid_total) - num(b.refunded_total);

  return (
    <div className="bill">
      <style>{`
        @page { size: A5; margin: 10mm; }
        body { background: #fff; }
        .ant-message { display: none !important; }
        .bill { max-width: 560px; margin: 0 auto; padding: 20px; font: 12px/1.45 system-ui, sans-serif; color: #111; }
        .bill h1 { font-size: 17px; margin: 0; color: #0b6e8a; }
        .bill .head { text-align: center; border-bottom: 2px solid #0b6e8a; padding-bottom: 6px; }
        .bill .title { text-align: center; font-weight: 700; letter-spacing: .08em; margin: 8px 0; }
        .bill .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 16px; padding-bottom: 6px; border-bottom: 1px solid #ccc; }
        .bill table { width: 100%; border-collapse: collapse; margin: 6px 0; }
        .bill th, .bill td { padding: 4px 3px; border-bottom: 1px solid #e3e3e3; vertical-align: top; }
        .bill th { font-size: 11px; color: #555; text-align: left; }
        .bill .r { text-align: right; white-space: nowrap; }
        .bill .tot td { border: 0; padding: 2px 3px; }
        .bill .net td { font-weight: 700; font-size: 13px; border-top: 1px solid #111; }
        .bill .stamp { display: inline-block; border: 2px solid; padding: 2px 10px; font-weight: 700; letter-spacing: .1em; }
        .bill .foot { display: flex; justify-content: space-between; margin-top: 32px; }
        @media print { .noprint { display: none; } .bill { padding: 0; } }
      `}</style>
      <div className="head">
        <h1>{h.name}</h1>
        {h.address && <div>{h.address}</div>}
        {(h.phone || h.gstin) && (
          <div>
            {h.phone && `Phone: ${h.phone}`}
            {h.phone && h.gstin && " · "}
            {h.gstin && `GSTIN: ${h.gstin}`}
          </div>
        )}
      </div>
      <div className="title">{b.bill_no ? (taxed ? "OPD BILL / TAX INVOICE" : "OPD BILL") : "ESTIMATE (NOT A BILL)"}</div>
      <div className="meta">
        <div>Bill no: <b>{b.bill_no ?? "–"}</b></div>
        <div className="r">Date: {dayjs(b.date).format("DD MMM YYYY")}</div>
        <div><b>{b.patient_name}</b>, {b.patient_age ?? "?"} yrs, {{ M: "Male", F: "Female", O: "Other" }[b.patient_gender]}</div>
        <div className="r">UHID: {b.patient_uhid}</div>
        <div>{b.doctor_name ? `Doctor: ${b.doctor_name}` : ""}</div>
        <div className="r">Mobile: {b.patient_mobile}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Particulars</th><th className="r">Qty</th><th className="r">Rate</th>
            {discounted && <th className="r">Disc.</th>}
            {taxed && <th className="r">GST</th>}
            <th className="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          {b.items.map((i, n) => (
            <tr key={i.id}>
              <td>{n + 1}</td>
              <td>
                {i.description}
                <div style={{ fontSize: 10, color: "#777" }}>{CATEGORY_LABEL[i.category]}</div>
              </td>
              <td className="r">{i.qty}</td>
              <td className="r">{inr(i.rate)}</td>
              {discounted && <td className="r">{num(i.discount) ? inr(i.discount) : ""}</td>}
              {taxed && <td className="r">{num(i.tax_amount) ? inr(i.tax_amount) : ""}</td>}
              <td className="r">{inr(i.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="tot" style={{ width: "60%", marginLeft: "40%" }}>
        <tbody>
          <tr><td>Total</td><td className="r">{inr(b.subtotal)}</td></tr>
          {discounted && <tr><td>Discount{b.discount_reason ? ` (${b.discount_reason})` : ""}</td><td className="r">−{inr(b.discount_total)}</td></tr>}
          {taxed && <tr><td>GST</td><td className="r">{inr(b.tax_total)}</td></tr>}
          <tr className="net"><td>Net amount</td><td className="r">{inr(b.net_total)}</td></tr>
          {num(b.refunded_total) > 0 ? (
            <>
              <tr><td>Paid</td><td className="r">{inr(b.paid_total)}</td></tr>
              <tr><td>Refunded</td><td className="r">−{inr(b.refunded_total)}</td></tr>
              <tr><td><b>Net received</b></td><td className="r"><b>{inr(received)}</b></td></tr>
            </>
          ) : (
            <tr><td>Received</td><td className="r">{inr(received)}</td></tr>
          )}
          {num(b.balance) > 0 && <tr><td><b>Balance due</b></td><td className="r"><b>{inr(b.balance)}</b></td></tr>}
        </tbody>
      </table>
      <div style={{ margin: "6px 0" }}>{inWords(b.net_total)}</div>
      {b.payments.length > 0 && (
        <table>
          <thead><tr><th>Receipt</th><th>Time</th><th>Mode</th><th className="r">Amount</th></tr></thead>
          <tbody>
            {b.payments.map((p) => (
              <tr key={p.id}>
                <td>{p.receipt_no}</td>
                <td>{dayjs(p.received_at).format("DD MMM, HH:mm")}</td>
                <td>{p.mode_label}{p.reference ? ` (${p.reference})` : ""}</td>
                <td className="r">{inr(p.amount)}</td>
              </tr>
            ))}
            {b.refunds.map((r) => (
              <tr key={`r${r.id}`}>
                <td>{r.refund_no}</td>
                <td>{dayjs(r.refunded_at).format("DD MMM, HH:mm")}</td>
                <td>Refund, {r.mode_label}</td>
                <td className="r">−{inr(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="foot">
        <div>
          {b.status === "paid" && <span className="stamp" style={{ color: "#237804" }}>PAID</span>}
          {b.status === "cancelled" && <span className="stamp" style={{ color: "#a8071a" }}>CANCELLED</span>}
          {b.status === "refunded" && <span className="stamp" style={{ color: "#531dab" }}>REFUNDED</span>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div>{b.payments[b.payments.length - 1]?.received_by_name ?? ""}</div>
          <div>Cashier</div>
        </div>
      </div>
      <div className="noprint" style={{ marginTop: 24, display: "flex", gap: 8 }}>
        <button onClick={() => window.print()}>Print again</button>
        <button onClick={() => navigate(`/billing/${b.id}`)}>Back to the bill</button>
        <button onClick={() => navigate("/billing")}>Back to billing</button>
      </div>
    </div>
  );
}

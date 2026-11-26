import { Descriptions } from "antd";
import type { Vitals } from "../api/types";

export function vitalsLine(v: Vitals) {
  const parts = [
    v.bp_systolic && v.bp_diastolic ? `BP ${v.bp_systolic}/${v.bp_diastolic}` : null,
    v.pulse ? `Pulse ${v.pulse}` : null,
    v.temperature_f ? `Temp ${v.temperature_f}°F` : null,
    v.spo2 ? `SpO2 ${v.spo2}%` : null,
    v.respiratory_rate ? `RR ${v.respiratory_rate}` : null,
    v.weight_kg ? `Wt ${v.weight_kg} kg` : null,
    v.height_cm ? `Ht ${v.height_cm} cm` : null,
    v.bmi ? `BMI ${v.bmi}` : null,
    v.blood_sugar ? `RBS ${v.blood_sugar}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export default function VitalsSummary({ vitals }: { vitals: Vitals }) {
  return (
    <Descriptions size="small" column={2} colon={false}>
      <Descriptions.Item label="BP">
        {vitals.bp_systolic ? `${vitals.bp_systolic}/${vitals.bp_diastolic}` : "–"}
      </Descriptions.Item>
      <Descriptions.Item label="Pulse">{vitals.pulse ?? "–"}</Descriptions.Item>
      <Descriptions.Item label="Temp">{vitals.temperature_f ? `${vitals.temperature_f}°F` : "–"}</Descriptions.Item>
      <Descriptions.Item label="SpO2">{vitals.spo2 ? `${vitals.spo2}%` : "–"}</Descriptions.Item>
      <Descriptions.Item label="Weight">{vitals.weight_kg ? `${vitals.weight_kg} kg` : "–"}</Descriptions.Item>
      <Descriptions.Item label="BMI">{vitals.bmi ?? "–"}</Descriptions.Item>
      {vitals.blood_sugar && <Descriptions.Item label="RBS">{vitals.blood_sugar}</Descriptions.Item>}
      {vitals.respiratory_rate && <Descriptions.Item label="RR">{vitals.respiratory_rate}</Descriptions.Item>}
      {vitals.allergies && (
        <Descriptions.Item label="Allergies" span={2}>
          <b style={{ color: "#c0392b" }}>{vitals.allergies}</b>
        </Descriptions.Item>
      )}
      {vitals.chief_complaint && (
        <Descriptions.Item label="Complaint" span={2}>
          {vitals.chief_complaint}
        </Descriptions.Item>
      )}
    </Descriptions>
  );
}

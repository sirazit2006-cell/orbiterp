import { Tag } from "antd";
import type { AppointmentStatus } from "../api/types";

const COLORS: Record<AppointmentStatus, string> = {
  booked: "blue",
  checked_in: "gold",
  with_doctor: "purple",
  completed: "green",
  cancelled: "default",
  no_show: "red",
};

export default function StatusTag({ status, label }: { status: AppointmentStatus; label: string }) {
  return <Tag color={COLORS[status]}>{label}</Tag>;
}

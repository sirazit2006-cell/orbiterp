import { Tag } from "antd";
import type { BillStatus } from "../../api/types";

const COLORS: Record<BillStatus, string> = {
  draft: "gold",
  partly_paid: "orange",
  paid: "green",
  cancelled: "default",
  refunded: "purple",
};

const LABELS: Record<BillStatus, string> = {
  draft: "Unpaid",
  partly_paid: "Partly paid",
  paid: "Paid",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** "Draft" means nothing paid yet, which is what the counter cares about, so it reads "Unpaid". */
export default function BillStatusTag({ status }: { status: BillStatus }) {
  return <Tag color={COLORS[status]}>{LABELS[status]}</Tag>;
}

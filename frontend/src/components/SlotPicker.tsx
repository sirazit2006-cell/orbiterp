import { Alert, Button, Empty, Space, Spin, Typography } from "antd";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { DoctorSlots } from "../api/types";

interface Props {
  doctor?: number;
  date?: string;
  value?: string;
  onChange?: (time: string) => void;
}

/** Grid of a doctor's slots on one date; taken and past slots are disabled. */
export default function SlotPicker({ doctor, date, value, onChange }: Props) {
  const [data, setData] = useState<DoctorSlots | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!doctor || !date) {
      setData(null);
      return;
    }
    setLoading(true);
    api
      .get<DoctorSlots>(`/doctors/${doctor}/slots/`, { params: { date } })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [doctor, date]);

  if (!doctor || !date) return <Typography.Text type="secondary">Choose a doctor and a date first.</Typography.Text>;
  if (loading || !data) return <Spin />;
  if (data.on_leave) return <Alert type="warning" showIcon message="The doctor is on leave that day." />;
  if (!data.sessions.length) return <Empty description="No OPD session that day" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      {data.sessions.map((s) => {
        const free = s.slots.filter((x) => x.available).length;
        return (
          <div key={s.session}>
            <Typography.Text strong>
              {s.start} to {s.end}
            </Typography.Text>{" "}
            <Typography.Text type="secondary">
              {s.full ? "session full" : `${free} of ${s.slots.length} free`}
            </Typography.Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {s.slots.map((slot) => (
                <Button
                  key={slot.time}
                  size="small"
                  type={value === slot.time ? "primary" : "default"}
                  disabled={!slot.available}
                  onClick={() => onChange?.(slot.time)}
                >
                  {slot.time}
                </Button>
              ))}
            </div>
          </div>
        );
      })}
    </Space>
  );
}

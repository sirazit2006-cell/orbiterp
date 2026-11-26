import { App, DatePicker, Form, Modal } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { api, fieldErrors } from "../api/client";
import type { Appointment } from "../api/types";
import SlotPicker from "./SlotPicker";

interface Props {
  appointment: Appointment | null;
  onClose: () => void;
  onDone: (appt: Appointment) => void;
}

export default function RescheduleModal({ appointment, onClose, onDone }: Props) {
  const [form] = Form.useForm<{ date: Dayjs; slot_time: string }>();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const date = Form.useWatch("date", form);

  useEffect(() => {
    if (appointment) form.setFieldsValue({ date: dayjs(appointment.date), slot_time: undefined });
  }, [appointment, form]);

  const submit = async (values: { date: Dayjs; slot_time: string }) => {
    if (!appointment) return;
    setSaving(true);
    try {
      const { data } = await api.post<Appointment>(`/appointments/${appointment.id}/reschedule/`, {
        date: values.date.format("YYYY-MM-DD"),
        slot_time: values.slot_time,
      });
      message.success(`Moved to ${dayjs(data.date).format("DD MMM")} at ${data.slot_time?.slice(0, 5)}`);
      onDone(data);
      onClose();
    } catch (err) {
      const errors = fieldErrors(err);
      message.error(Object.values(errors)[0] ?? "Could not reschedule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={appointment ? `Reschedule ${appointment.patient_name}` : ""}
      open={!!appointment}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Move appointment"
      confirmLoading={saving}
      width={640}
    >
      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item name="date" label="New date" rules={[{ required: true }]}>
          <DatePicker
            format="ddd, DD MMM YYYY"
            disabledDate={(d) => d.isBefore(dayjs(), "day")}
            allowClear={false}
            onChange={() => form.setFieldValue("slot_time", undefined)}
          />
        </Form.Item>
        <Form.Item name="slot_time" label="New slot" rules={[{ required: true, message: "Choose a slot" }]}>
          <SlotPicker doctor={appointment?.doctor} date={date?.format("YYYY-MM-DD")} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

import { App, DatePicker, Form, Input, Modal, Segmented, Select } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { api, fieldErrors } from "../api/client";
import type { Appointment, PatientSummary } from "../api/types";
import PatientSelect from "./PatientSelect";
import SlotPicker from "./SlotPicker";
import { useDoctors } from "./useDoctors";

interface Props {
  open: boolean;
  onClose: () => void;
  onBooked: (appt: Appointment) => void;
  walkIn?: boolean;
  patient?: PatientSummary;
  doctor?: number;
}

interface Values {
  patient: number;
  doctor: number;
  date: Dayjs;
  slot_time?: string;
  reason?: string;
}

export default function BookAppointmentModal({ open, onClose, onBooked, walkIn = false, patient, doctor }: Props) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const { options } = useDoctors();
  const [mode, setMode] = useState<"booking" | "walk_in">(walkIn ? "walk_in" : "booking");
  const [saving, setSaving] = useState(false);
  const doctorId = Form.useWatch("doctor", form);
  const date = Form.useWatch("date", form);

  useEffect(() => {
    if (open) {
      setMode(walkIn ? "walk_in" : "booking");
      form.resetFields();
      form.setFieldsValue({ patient: patient?.id, doctor, date: dayjs() });
    }
  }, [open, walkIn, patient, doctor, form]);

  const submit = async (values: Values) => {
    setSaving(true);
    try {
      const { data } = await api.post<Appointment>("/appointments/", {
        patient: values.patient,
        doctor: values.doctor,
        date: (mode === "walk_in" ? dayjs() : values.date).format("YYYY-MM-DD"),
        slot_time: mode === "walk_in" ? null : values.slot_time,
        source: mode === "walk_in" ? "walk_in" : "phone",
        reason: values.reason ?? "",
      });
      message.success(
        mode === "walk_in"
          ? `${data.patient_name} checked in with token ${data.token_no}`
          : `Booked ${data.patient_name} on ${dayjs(data.date).format("DD MMM")} at ${data.slot_time?.slice(0, 5)}`,
      );
      onBooked(data);
      onClose();
    } catch (err) {
      const errors = fieldErrors(err);
      const known = ["patient", "doctor", "date", "slot_time", "reason"];
      form.setFields(known.filter((k) => errors[k]).map((k) => ({ name: k as keyof Values, errors: [errors[k]] })));
      const other = Object.entries(errors).filter(([k]) => !known.includes(k));
      message.error(other.length ? other[0][1] : "Please correct the highlighted fields.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={mode === "walk_in" ? "Walk-in patient" : "Book appointment"}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={mode === "walk_in" ? "Check in and give token" : "Book"}
      confirmLoading={saving}
      width={640}
      destroyOnClose
    >
      <Segmented
        block
        value={mode}
        onChange={(v) => setMode(v as "booking" | "walk_in")}
        options={[
          { label: "Book a slot", value: "booking" },
          { label: "Walk-in today", value: "walk_in" },
        ]}
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item name="patient" label="Patient" rules={[{ required: true, message: "Choose a patient" }]}>
          <PatientSelect initial={patient} />
        </Form.Item>
        <Form.Item name="doctor" label="Doctor" rules={[{ required: true, message: "Choose a doctor" }]}>
          <Select showSearch optionFilterProp="label" options={options} placeholder="Choose a doctor" onChange={() => form.setFieldValue("slot_time", undefined)} />
        </Form.Item>
        {mode === "booking" && (
          <>
            <Form.Item name="date" label="Date" rules={[{ required: true }]}>
              <DatePicker
                format="ddd, DD MMM YYYY"
                disabledDate={(d) => d.isBefore(dayjs(), "day")}
                allowClear={false}
                onChange={() => form.setFieldValue("slot_time", undefined)}
              />
            </Form.Item>
            <Form.Item name="slot_time" label="Slot" rules={[{ required: true, message: "Choose a slot" }]}>
              <SlotPicker doctor={doctorId} date={date?.format("YYYY-MM-DD")} />
            </Form.Item>
          </>
        )}
        <Form.Item name="reason" label="Reason for visit">
          <Input maxLength={255} placeholder="Optional, e.g. fever for 3 days" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

import { App, Col, Form, Input, InputNumber, Modal, Row } from "antd";
import { useEffect, useState } from "react";
import { api, fieldErrors } from "../api/client";
import type { Appointment, Vitals } from "../api/types";

interface Props {
  appointment: Appointment | null;
  onClose: () => void;
  onSaved?: (v: Vitals) => void;
}

const NUM = { style: { width: "100%" } };

export default function VitalsModal({ appointment, onClose, onSaved }: Props) {
  const [form] = Form.useForm<Vitals>();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!appointment) return;
    form.resetFields();
    api.get<Vitals | null>(`/appointments/${appointment.id}/vitals/`).then((r) => r.data && form.setFieldsValue(r.data));
  }, [appointment, form]);

  const submit = async (values: Vitals) => {
    if (!appointment) return;
    setSaving(true);
    try {
      const { data } = await api.put<Vitals>(`/appointments/${appointment.id}/vitals/`, values);
      message.success(`Vitals saved for ${appointment.patient_name}`);
      onSaved?.(data);
      onClose();
    } catch (err) {
      const errors = fieldErrors(err);
      form.setFields(Object.entries(errors).map(([name, msg]) => ({ name: name as keyof Vitals, errors: [msg] })));
      message.error(Object.values(errors)[0] ?? "Could not save vitals.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={appointment ? `Vitals · token ${appointment.token_no ?? "–"} · ${appointment.patient_name}` : ""}
      open={!!appointment}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Save vitals"
      confirmLoading={saving}
      width={680}
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <Row gutter={12}>
          <Col xs={12} md={6}>
            <Form.Item name="bp_systolic" label="BP systolic">
              <InputNumber {...NUM} min={50} max={260} addonAfter="mmHg" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="bp_diastolic" label="BP diastolic">
              <InputNumber {...NUM} min={30} max={160} addonAfter="mmHg" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="pulse" label="Pulse">
              <InputNumber {...NUM} min={20} max={250} addonAfter="/min" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="spo2" label="SpO2">
              <InputNumber {...NUM} min={50} max={100} addonAfter="%" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="temperature_f" label="Temperature">
              <InputNumber {...NUM} min={90} max={110} step={0.1} addonAfter="°F" stringMode />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="respiratory_rate" label="Resp. rate">
              <InputNumber {...NUM} min={5} max={60} addonAfter="/min" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="height_cm" label="Height">
              <InputNumber {...NUM} min={20} max={250} step={0.5} addonAfter="cm" stringMode />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="weight_kg" label="Weight">
              <InputNumber {...NUM} min={0.5} max={350} step={0.1} addonAfter="kg" stringMode />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="blood_sugar" label="Random sugar">
              <InputNumber {...NUM} min={20} max={700} addonAfter="mg/dL" />
            </Form.Item>
          </Col>
          <Col xs={24} md={18}>
            <Form.Item name="allergies" label="Allergies">
              <Input maxLength={255} placeholder="e.g. penicillin; none known" />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="chief_complaint" label="Chief complaint">
              <Input maxLength={255} placeholder="In the patient's words" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

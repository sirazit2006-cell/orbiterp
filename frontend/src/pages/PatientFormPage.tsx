import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  List,
  Row,
  Select,
  Space,
  Spin,
  Typography,
} from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, fieldErrors } from "../api/client";
import type { Patient, PatientSummary } from "../api/types";

const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const ID_PROOFS = ["Aadhaar", "PAN", "Voter ID", "Driving licence", "Passport", "Other"];

type FormValues = Omit<Patient, "date_of_birth"> & { date_of_birth?: Dayjs; consent_given?: boolean };

export default function PatientFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<PatientSummary[]>([]);
  const [confirmedNew, setConfirmedNew] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api.get<Patient>(`/patients/${id}/`).then(({ data }) => {
      form.setFieldsValue({ ...data, date_of_birth: data.date_of_birth ? dayjs(data.date_of_birth) : undefined });
      setLoading(false);
    });
  }, [editing, id, form]);

  // Before a new registration is saved, look for the same person already on file.
  const checkDuplicates = async () => {
    if (editing) return;
    const { mobile, first_name, date_of_birth } = form.getFieldsValue();
    if (!mobile && !(first_name && date_of_birth)) return;
    const { data } = await api.get<PatientSummary[]>("/patients/duplicates/", {
      params: {
        mobile: /^\d{10}$/.test(mobile ?? "") ? mobile : undefined,
        first_name: first_name || undefined,
        date_of_birth: date_of_birth ? date_of_birth.format("YYYY-MM-DD") : undefined,
      },
    });
    setDuplicates(data);
    setConfirmedNew(false);
  };

  const onFinish = async (values: FormValues) => {
    if (duplicates.length && !confirmedNew && !editing) {
      message.warning("Check the possible matches first, or confirm this is a new patient.");
      return;
    }
    setSaving(true);
    const payload = { ...values, date_of_birth: values.date_of_birth?.format("YYYY-MM-DD") ?? null };
    try {
      const { data } = editing
        ? await api.patch<Patient>(`/patients/${id}/`, payload)
        : await api.post<Patient>("/patients/", payload);
      message.success(editing ? "Patient updated" : `Registered ${data.full_name} as ${data.uhid}`);
      navigate(`/patients/${data.id}`);
    } catch (err) {
      const errors = fieldErrors(err);
      form.setFields(Object.entries(errors).map(([name, msg]) => ({ name: name as keyof FormValues, errors: [msg] })));
      message.error(errors.detail ?? "Please correct the highlighted fields.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin />;

  return (
    <>
      <Typography.Title level={3}>{editing ? "Edit patient" : "Register patient"}</Typography.Title>
      <Form<FormValues>
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{ state: "Gujarat" }}
        scrollToFirstError
      >
        <Card title="Patient" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="mobile" label="Mobile number" rules={[{ required: true }, { pattern: /^[6-9]\d{9}$/, message: "10-digit mobile number" }]}>
                <Input maxLength={10} inputMode="numeric" onBlur={checkDuplicates} autoFocus={!editing} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="first_name" label="First name" rules={[{ required: true }]}>
                <Input onBlur={checkDuplicates} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="last_name" label="Last name">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="gender" label="Gender" rules={[{ required: true }]}>
                <Select options={[{ value: "M", label: "Male" }, { value: "F", label: "Female" }, { value: "O", label: "Other" }]} />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="date_of_birth" label="Date of birth">
                <DatePicker
                  format="DD/MM/YYYY"
                  style={{ width: "100%" }}
                  disabledDate={(d) => d.isAfter(dayjs())}
                  onChange={checkDuplicates}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item
                name="age_years"
                label="Or age in years"
                dependencies={["date_of_birth"]}
                rules={[
                  ({ getFieldValue }) => ({
                    validator: (_, v) =>
                      v != null || getFieldValue("date_of_birth")
                        ? Promise.resolve()
                        : Promise.reject(new Error("Enter a date of birth or an age")),
                  }),
                ]}
              >
                <InputNumber min={0} max={130} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          {duplicates.length > 0 && !editing && (
            <Alert
              type="warning"
              showIcon
              message="This patient may already be registered"
              description={
                <>
                  <List
                    size="small"
                    dataSource={duplicates}
                    renderItem={(p) => (
                      <List.Item>
                        <Link to={`/patients/${p.id}`}>
                          {p.uhid} · {p.full_name} · {p.age ?? "?"} yrs · {p.mobile}
                        </Link>
                      </List.Item>
                    )}
                  />
                  <Checkbox checked={confirmedNew} onChange={(e) => setConfirmedNew(e.target.checked)}>
                    None of these is the same person; register as a new patient
                  </Checkbox>
                </>
              }
            />
          )}
        </Card>

        <Card title="Address and contact" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item name="address_line" label="Address" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="city" label="City" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="state" label="State" rules={[{ required: true }]}>
                <Select showSearch options={STATES.map((s) => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="pin_code" label="PIN code" rules={[{ required: true }, { pattern: /^\d{6}$/, message: "6-digit PIN code" }]}>
                <Input maxLength={6} inputMode="numeric" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="email" label="Email" rules={[{ type: "email" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="emergency_contact_name" label="Emergency contact name">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="emergency_contact_phone" label="Emergency contact phone">
                <Input maxLength={15} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card title="Other details" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item name="blood_group" label="Blood group">
                <Select allowClear options={BLOOD_GROUPS.map((b) => ({ value: b, label: b }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="id_proof_type" label="ID proof">
                <Select allowClear options={ID_PROOFS.map((v) => ({ value: v, label: v }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="id_proof_number" label="ID proof number">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="abha_number" label="ABHA number">
                <Input maxLength={17} />
              </Form.Item>
            </Col>
          </Row>
          {!editing && (
            <Form.Item
              name="consent_given"
              valuePropName="checked"
              rules={[{ validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error("Consent is required"))) }]}
            >
              <Checkbox>
                The patient agrees to the hospital storing and using their details for treatment and billing.
              </Checkbox>
            </Form.Item>
          )}
        </Card>

        <Space>
          <Button type="primary" htmlType="submit" loading={saving}>
            {editing ? "Save changes" : "Register patient"}
          </Button>
          <Button onClick={() => navigate(-1)}>Cancel</Button>
        </Space>
      </Form>
    </>
  );
}

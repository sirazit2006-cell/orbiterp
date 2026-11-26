import { DeleteOutlined, HistoryOutlined, PlusOutlined, PrinterOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Col,
  Collapse,
  DatePicker,
  Divider,
  Empty,
  Form,
  Input,
  List,
  Result,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, fieldErrors, Page } from "../api/client";
import type { Appointment, Consultation, HistoryVisit, Medicine, PrescriptionLine, Service, Vitals } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useDoctors } from "../components/useDoctors";
import VitalsModal from "../components/VitalsModal";
import VitalsSummary, { vitalsLine } from "../components/VitalsSummary";

const FREQUENCIES = ["1-0-0", "0-0-1", "1-0-1", "1-1-1", "0-1-0", "1-1-1-1", "SOS", "Once a week"];
const DURATIONS = ["1 day", "3 days", "5 days", "7 days", "10 days", "14 days", "1 month", "Continue"];
const ROUTES = [
  ["oral", "Oral"], ["topical", "Topical"], ["iv", "IV"], ["im", "IM"], ["sc", "Subcutaneous"],
  ["inhaled", "Inhaled"], ["eye", "Eye"], ["ear", "Ear"], ["nasal", "Nasal"], ["other", "Other"],
].map(([value, label]) => ({ value, label }));
const INSTRUCTIONS = ["After food", "Before food", "At bedtime", "Empty stomach", "With plenty of water"];

interface FormValues {
  complaints: string;
  history: string;
  examination: string;
  advice: string;
  follow_up_date?: Dayjs | null;
  referral_doctor?: number | null;
  referral_note: string;
  diagnoses: { text: string; icd10_code: string }[];
  prescriptions: PrescriptionLine[];
  investigations: number[];
}

const EMPTY_RX: PrescriptionLine = {
  medicine: null, medicine_name: "", dose: "", frequency: "", duration: "", route: "oral", instructions: "",
};

function toForm(c: Consultation | null, vitals: Vitals | null): Partial<FormValues> {
  if (!c) {
    return {
      complaints: vitals?.chief_complaint ?? "",
      diagnoses: [{ text: "", icd10_code: "" }],
      prescriptions: [{ ...EMPTY_RX }],
      investigations: [],
    };
  }
  return {
    ...c,
    follow_up_date: c.follow_up_date ? dayjs(c.follow_up_date) : null,
    diagnoses: c.diagnoses.length ? c.diagnoses : [{ text: "", icd10_code: "" }],
    prescriptions: c.prescriptions.length ? c.prescriptions : [{ ...EMPTY_RX }],
    investigations: c.investigations.filter((i) => i.status !== "billed").map((i) => i.service),
  };
}

function MedicineName({ index, form }: { index: number; form: ReturnType<typeof Form.useForm<FormValues>>[0] }) {
  const [options, setOptions] = useState<Medicine[]>([]);
  const timer = useRef<number>();
  const search = (q: string) => {
    window.clearTimeout(timer.current);
    if (q.length < 2) return;
    timer.current = window.setTimeout(() => {
      api.get<Page<Medicine>>("/medicines/", { params: { search: q, is_active: true } }).then((r) => setOptions(r.data.results));
    }, 250);
  };
  return (
    <Form.Item name={[index, "medicine_name"]} rules={[{ required: true, message: "Medicine" }]} style={{ marginBottom: 8 }}>
      <AutoComplete
        placeholder="Medicine"
        onSearch={search}
        options={options.map((m) => ({ value: m.label, label: `${m.label}${m.generic_name && m.generic_name !== m.name ? ` (${m.generic_name})` : ""} · ${m.form}`, id: m.id }))}
        onSelect={(_, option) => form.setFieldValue(["prescriptions", index, "medicine"], (option as { id: number }).id)}
        onChange={() => form.setFieldValue(["prescriptions", index, "medicine"], null)}
      />
    </Form.Item>
  );
}

export default function ConsultationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { message, modal } = App.useApp();
  const { options: doctorOptions, doctors } = useDoctors();
  const [form] = Form.useForm<FormValues>();
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [vitals, setVitals] = useState<Vitals | null>(null);
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [history, setHistory] = useState<HistoryVisit[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const [amendment, setAmendment] = useState("");

  const ownDoctor = doctors.find((d) => d.user === user?.id);
  const isOwn = !!appt && ownDoctor?.id === appt.doctor;
  const canWrite = isOwn && !consultation?.is_locked && (appt?.status === "with_doctor" || appt?.status === "completed");

  const load = useCallback(async () => {
    try {
      const a = (await api.get<Appointment>(`/appointments/${id}/`)).data;
      setAppt(a);
      const [v, c, h] = await Promise.all([
        api.get<Vitals | null>(`/appointments/${id}/vitals/`),
        api.get<Consultation | null>(`/appointments/${id}/consultation/`),
        api.get<HistoryVisit[]>(`/patients/${a.patient}/clinical-history/`),
      ]);
      // The API answers with an empty body when nothing is recorded yet.
      const vit = v.data || null;
      const con = c.data || null;
      setVitals(vit);
      setConsultation(con);
      setHistory(h.data.filter((x) => x.appointment !== a.id));
      form.setFieldsValue(toForm(con, vit));
    } catch (err) {
      if ((err as { response?: { status?: number } }).response?.status === 403) setForbidden(true);
    } finally {
      setLoading(false);
    }
  }, [id, form]);

  useEffect(() => {
    load();
    api
      .get<Page<Service>>("/services/", { params: { category__in: "lab,radiology,procedure", is_active: true, page_size: 500 } })
      .then((r) => setServices(r.data.results));
  }, [load]);

  const save = async (complete: boolean) => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      message.error("Please fill the highlighted fields.");
      return false;
    }
    setSaving(true);
    try {
      const payload = {
        ...values,
        follow_up_date: values.follow_up_date ? values.follow_up_date.format("YYYY-MM-DD") : null,
        referral_doctor: values.referral_doctor ?? null,
        diagnoses: (values.diagnoses ?? []).filter((d) => d.text?.trim()),
        prescriptions: (values.prescriptions ?? []).filter((p) => p.medicine_name?.trim()),
        investigations: (values.investigations ?? []).map((service) => ({ service, notes: "" })),
      };
      const { data } = await api.put<Consultation>(`/appointments/${id}/consultation/`, payload);
      setConsultation(data);
      if (complete) {
        await api.post(`/appointments/${id}/complete/`);
        message.success("Visit completed");
        return true;
      }
      message.success("Saved");
      return true;
    } catch (err) {
      const errors = fieldErrors(err);
      message.error(Object.values(errors)[0] ?? "Could not save.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const completeVisit = async () => {
    if (await save(true)) {
      modal.confirm({
        title: "Visit completed",
        content: "Print the prescription now?",
        okText: "Print",
        cancelText: "Back to queue",
        onOk: () => navigate(`/print/prescription/${id}`),
        onCancel: () => navigate(`/queue?doctor=${appt?.doctor}`),
      });
      load();
    }
  };

  const repeatLast = () => {
    const last = history.find((h) => h.consultation?.prescriptions.length);
    if (!last?.consultation) {
      message.info("No earlier prescription for this patient.");
      return;
    }
    form.setFieldValue("prescriptions", last.consultation.prescriptions.map((p) => ({ ...p })));
    message.success(`Copied ${last.consultation.prescriptions.length} medicine(s) from ${dayjs(last.date).format("DD MMM YYYY")}`);
  };

  const addAmendment = async () => {
    if (!amendment.trim()) return;
    await api.post(`/appointments/${id}/consultation/amend/`, { text: amendment });
    setAmendment("");
    load();
  };

  if (loading) return <Spin />;
  if (forbidden) return <Result status="403" title="Not your patient" subTitle="Clinical notes are visible only to the patient's doctors." />;
  if (!appt) return <Result status="404" title="Visit not found" />;

  const allergy = vitals?.allergies || history.find((h) => h.vitals?.allergies)?.vitals?.allergies;

  return (
    <>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }} wrap>
        <Space wrap align="center">
          <Typography.Title level={3} style={{ margin: 0 }}>
            {appt.patient_name}
          </Typography.Title>
          <Tag color="blue">{appt.patient_uhid}</Tag>
          <Typography.Text type="secondary">
            {appt.patient_age ?? "?"} yrs · {{ M: "Male", F: "Female", O: "Other" }[appt.patient_gender]} · token {appt.token_no ?? "–"}
          </Typography.Text>
          <Tag color={appt.visit_type === "follow_up" ? "cyan" : "default"}>{appt.visit_type === "follow_up" ? "Follow-up" : "New visit"}</Tag>
          {appt.status === "completed" && <Tag color="green">Completed</Tag>}
        </Space>
        <Space wrap>
          {consultation && (
            <Button icon={<PrinterOutlined />} onClick={() => navigate(`/print/prescription/${id}`)}>
              Print prescription
            </Button>
          )}
          {canWrite && (
            <>
              <Button onClick={() => save(false)} loading={saving}>
                Save
              </Button>
              {appt.status === "with_doctor" && (
                <Button type="primary" onClick={completeVisit} loading={saving}>
                  Save and complete visit
                </Button>
              )}
            </>
          )}
        </Space>
      </Space>

      {allergy && <Alert type="error" showIcon message={`Allergies: ${allergy}`} style={{ marginBottom: 16 }} />}
      {appt.status === "checked_in" && isOwn && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="The patient is still waiting. Call them in from the queue to start writing notes."
          action={<Button size="small" onClick={() => api.post(`/appointments/${id}/start/`).then(load)}>Call in now</Button>}
        />
      )}
      {consultation?.is_locked && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="This consultation is locked 24 hours after the visit. Add an amendment below to record anything new." />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card
            title="Vitals"
            size="small"
            extra={(isOwn || user?.roles.includes("nurse")) && appt.status !== "completed" && (
              <Button size="small" onClick={() => setVitalsOpen(true)}>{vitals ? "Edit" : "Record"}</Button>
            )}
            style={{ marginBottom: 16 }}
          >
            {vitals ? <VitalsSummary vitals={vitals} /> : <Typography.Text type="secondary">Not recorded yet</Typography.Text>}
          </Card>
          <Card title={<><HistoryOutlined /> Past visits ({history.length})</>} size="small">
            {history.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="First visit to the hospital" />
            ) : (
              <Collapse
                size="small"
                items={history.map((h) => ({
                  key: h.appointment,
                  label: `${dayjs(h.date).format("DD MMM YYYY")} · ${h.doctor_name}`,
                  children: (
                    <div style={{ fontSize: 13 }}>
                      {h.vitals && <p style={{ color: "#666" }}>{vitalsLine(h.vitals)}</p>}
                      {h.consultation ? (
                        <>
                          {h.consultation.complaints && <p><b>Complaints:</b> {h.consultation.complaints}</p>}
                          {h.consultation.diagnoses.length > 0 && (
                            <p><b>Diagnosis:</b> {h.consultation.diagnoses.map((d) => d.text + (d.icd10_code ? ` (${d.icd10_code})` : "")).join("; ")}</p>
                          )}
                          {h.consultation.prescriptions.length > 0 && (
                            <ul style={{ paddingLeft: 18, margin: 0 }}>
                              {h.consultation.prescriptions.map((p, i) => (
                                <li key={i}>{p.medicine_name} {p.dose} · {p.frequency} · {p.duration}</li>
                              ))}
                            </ul>
                          )}
                          {h.consultation.investigations.length > 0 && (
                            <p><b>Tests:</b> {h.consultation.investigations.map((i) => i.service_name).join(", ")}</p>
                          )}
                          {h.consultation.amendments.map((a) => (
                            <p key={a.id}><i>Amendment {dayjs(a.created_at).format("DD MMM")}: {a.text}</i></p>
                          ))}
                        </>
                      ) : (
                        <Typography.Text type="secondary">No notes</Typography.Text>
                      )}
                    </div>
                  ),
                }))}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Form<FormValues> form={form} layout="vertical" disabled={!canWrite}>
            <Card size="small" title="Notes" style={{ marginBottom: 16 }}>
              <Form.Item name="complaints" label="Chief complaints">
                <Input.TextArea autoSize={{ minRows: 2 }} />
              </Form.Item>
              <Form.Item name="history" label="History">
                <Input.TextArea autoSize={{ minRows: 2 }} />
              </Form.Item>
              <Form.Item name="examination" label="Examination findings">
                <Input.TextArea autoSize={{ minRows: 2 }} />
              </Form.Item>
              <Typography.Text strong>Diagnosis</Typography.Text>
              <Form.List name="diagnoses">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((f) => (
                      <Row gutter={8} key={f.key} style={{ marginTop: 8 }}>
                        <Col flex="auto">
                          <Form.Item name={[f.name, "text"]} style={{ marginBottom: 0 }}>
                            <Input placeholder="Diagnosis" />
                          </Form.Item>
                        </Col>
                        <Col style={{ width: 130 }}>
                          <Form.Item name={[f.name, "icd10_code"]} style={{ marginBottom: 0 }}>
                            <Input placeholder="ICD-10" maxLength={10} />
                          </Form.Item>
                        </Col>
                        <Col>
                          <Button type="text" icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
                        </Col>
                      </Row>
                    ))}
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ text: "", icd10_code: "" })} style={{ marginTop: 8 }}>
                      Add diagnosis
                    </Button>
                  </>
                )}
              </Form.List>
            </Card>

            <Card
              size="small"
              title="Prescription"
              extra={canWrite && <Button size="small" onClick={repeatLast}>Repeat last prescription</Button>}
              style={{ marginBottom: 16 }}
            >
              <Form.List name="prescriptions">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((f) => (
                      <Row gutter={8} key={f.key} align="top">
                        <Form.Item name={[f.name, "medicine"]} hidden>
                          <Input />
                        </Form.Item>
                        <Col xs={24} md={7}>
                          <MedicineName index={f.name} form={form} />
                        </Col>
                        <Col xs={8} md={3}>
                          <Form.Item name={[f.name, "dose"]} style={{ marginBottom: 8 }}>
                            <Input placeholder="Dose" />
                          </Form.Item>
                        </Col>
                        <Col xs={8} md={3}>
                          <Form.Item name={[f.name, "frequency"]} rules={[{ required: true, message: "How often" }]} style={{ marginBottom: 8 }}>
                            <AutoComplete placeholder="1-0-1" options={FREQUENCIES.map((value) => ({ value }))} />
                          </Form.Item>
                        </Col>
                        <Col xs={8} md={3}>
                          <Form.Item name={[f.name, "duration"]} rules={[{ required: true, message: "How long" }]} style={{ marginBottom: 8 }}>
                            <AutoComplete placeholder="5 days" options={DURATIONS.map((value) => ({ value }))} />
                          </Form.Item>
                        </Col>
                        <Col xs={10} md={3}>
                          <Form.Item name={[f.name, "route"]} style={{ marginBottom: 8 }}>
                            <Select options={ROUTES} />
                          </Form.Item>
                        </Col>
                        <Col xs={12} md={4}>
                          <Form.Item name={[f.name, "instructions"]} style={{ marginBottom: 8 }}>
                            <AutoComplete placeholder="After food" options={INSTRUCTIONS.map((value) => ({ value }))} />
                          </Form.Item>
                        </Col>
                        <Col xs={2} md={1}>
                          <Button type="text" icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
                        </Col>
                      </Row>
                    ))}
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ ...EMPTY_RX })}>
                      Add medicine
                    </Button>
                  </>
                )}
              </Form.List>
            </Card>

            <Card size="small" title="Investigations, advice and follow-up">
              <Form.Item name="investigations" label="Tests to order">
                <Select
                  mode="multiple"
                  optionFilterProp="label"
                  placeholder="Search lab tests, scans and procedures"
                  options={["lab", "radiology", "procedure"].map((cat) => ({
                    label: { lab: "Laboratory", radiology: "Radiology", procedure: "Procedures" }[cat],
                    options: services.filter((s) => s.category === cat).map((s) => ({ value: s.id, label: s.name })),
                  }))}
                />
              </Form.Item>
              {consultation?.investigations.some((i) => i.status === "billed") && (
                <Typography.Paragraph type="secondary">
                  Already billed: {consultation.investigations.filter((i) => i.status === "billed").map((i) => i.service_name).join(", ")}
                </Typography.Paragraph>
              )}
              <Form.Item name="advice" label="Advice">
                <Input.TextArea autoSize={{ minRows: 2 }} />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} md={10}>
                  <Form.Item name="follow_up_date" label="Follow-up on">
                    <DatePicker
                      format="ddd, DD MMM YYYY"
                      style={{ width: "100%" }}
                      disabledDate={(d) => !d.isAfter(dayjs(appt.date), "day")}
                      renderExtraFooter={() => (
                        <Space>
                          {[3, 7, 15, 30].map((n) => (
                            <Button key={n} size="small" type="link" onClick={() => form.setFieldValue("follow_up_date", dayjs(appt.date).add(n, "day"))}>
                              +{n} days
                            </Button>
                          ))}
                        </Space>
                      )}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={14}>
                  <Form.Item name="referral_doctor" label="Refer to">
                    <Select allowClear showSearch optionFilterProp="label" options={doctorOptions.map((g) => ({ ...g, options: g.options.filter((o) => o.value !== appt.doctor) }))} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="referral_note" label="Referral note">
                <Input maxLength={255} />
              </Form.Item>
            </Card>
          </Form>

          {consultation && (consultation.is_locked || consultation.amendments.length > 0) && (
            <Card size="small" title="Amendments" style={{ marginTop: 16 }}>
              <List
                size="small"
                dataSource={consultation.amendments}
                locale={{ emptyText: "None" }}
                renderItem={(a) => (
                  <List.Item>
                    <span>
                      <b>{dayjs(a.created_at).format("DD MMM YYYY HH:mm")}</b> · {a.author_name}: {a.text}
                    </span>
                  </List.Item>
                )}
              />
              {isOwn && (
                <>
                  <Divider style={{ margin: "12px 0" }} />
                  <Input.TextArea value={amendment} onChange={(e) => setAmendment(e.target.value)} placeholder="Add an amendment" autoSize={{ minRows: 2 }} />
                  <Button style={{ marginTop: 8 }} onClick={addAmendment} disabled={!amendment.trim()}>
                    Add amendment
                  </Button>
                </>
              )}
            </Card>
          )}
          <div style={{ marginTop: 16 }}>
            <Link to={`/queue?doctor=${appt.doctor}`}>Back to the queue</Link>
          </div>
        </Col>
      </Row>
      <VitalsModal appointment={vitalsOpen ? appt : null} onClose={() => setVitalsOpen(false)} onSaved={setVitals} />
    </>
  );
}

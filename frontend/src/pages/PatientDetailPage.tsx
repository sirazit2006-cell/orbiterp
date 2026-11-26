import { CalendarOutlined, EditOutlined } from "@ant-design/icons";
import { Button, Card, Descriptions, Result, Space, Spin, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, Page } from "../api/client";
import type { Appointment, Patient } from "../api/types";
import BookAppointmentModal from "../components/BookAppointmentModal";
import StatusTag from "../components/StatusTag";
import { useAuth } from "../auth/AuthContext";

const GENDER = { M: "Male", F: "Female", O: "Other" } as const;

export default function PatientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [missing, setMissing] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [booking, setBooking] = useState(false);

  const loadAppointments = () =>
    api
      .get<Page<Appointment>>("/appointments/", { params: { patient: id, ordering: "-date,-slot_time", page_size: 50 } })
      .then((r) => setAppointments(r.data.results));

  useEffect(() => {
    loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    api
      .get<Patient>(`/patients/${id}/`)
      .then((r) => setPatient(r.data))
      .catch(() => setMissing(true));
  }, [id]);

  if (missing) return <Result status="404" title="Patient not found" />;
  if (!patient) return <Spin />;

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
        <Space align="center">
          <Typography.Title level={3} style={{ margin: 0 }}>
            {patient.full_name}
          </Typography.Title>
          <Tag color="blue">{patient.uhid}</Tag>
          {!patient.is_active && <Tag color="red">Inactive</Tag>}
        </Space>
        {hasRole("reception") && (
          <Space>
            <Button icon={<EditOutlined />} onClick={() => navigate(`/patients/${patient.id}/edit`)}>
              Edit
            </Button>
            <Button type="primary" icon={<CalendarOutlined />} onClick={() => setBooking(true)}>
              Book appointment
            </Button>
          </Space>
        )}
      </Space>
      <Card title="Details">
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }}>
          <Descriptions.Item label="Gender">{GENDER[patient.gender]}</Descriptions.Item>
          <Descriptions.Item label="Age">{patient.age ?? "–"}</Descriptions.Item>
          <Descriptions.Item label="Date of birth">
            {patient.date_of_birth ? dayjs(patient.date_of_birth).format("DD MMM YYYY") : "–"}
          </Descriptions.Item>
          <Descriptions.Item label="Mobile">{patient.mobile}</Descriptions.Item>
          <Descriptions.Item label="Email">{patient.email || "–"}</Descriptions.Item>
          <Descriptions.Item label="Blood group">{patient.blood_group || "–"}</Descriptions.Item>
          <Descriptions.Item label="Address" span={3}>
            {patient.address_line}, {patient.city}, {patient.state} {patient.pin_code}
          </Descriptions.Item>
          <Descriptions.Item label="Emergency contact">
            {patient.emergency_contact_name
              ? `${patient.emergency_contact_name} (${patient.emergency_contact_phone})`
              : "–"}
          </Descriptions.Item>
          <Descriptions.Item label="ID proof">
            {patient.id_proof_type ? `${patient.id_proof_type} ${patient.id_proof_number}` : "–"}
          </Descriptions.Item>
          <Descriptions.Item label="ABHA number">{patient.abha_number || "–"}</Descriptions.Item>
          <Descriptions.Item label="Registered">{dayjs(patient.created_at).format("DD MMM YYYY, HH:mm")}</Descriptions.Item>
          <Descriptions.Item label="Consent recorded">
            {dayjs(patient.consent_given_at).format("DD MMM YYYY, HH:mm")}
          </Descriptions.Item>
        </Descriptions>
      </Card>
      <Card title="Appointments">
        <Table<Appointment>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={appointments}
          locale={{ emptyText: "No appointments yet" }}
          scroll={{ x: 600 }}
          columns={[
            {
              title: "Date",
              render: (_, a) => `${dayjs(a.date).format("DD MMM YYYY")} ${a.slot_time ? a.slot_time.slice(0, 5) : "(walk-in)"}`,
            },
            { title: "Doctor", dataIndex: "doctor_name" },
            { title: "Department", dataIndex: "department_name" },
            { title: "Visit", render: (_, a) => (a.visit_type === "follow_up" ? "Follow-up" : "New") },
            { title: "Status", render: (_, a) => <StatusTag status={a.status} label={a.status_label} /> },
            {
              title: "",
              render: (_, a) =>
                a.has_consultation && hasRole("doctor") ? <Link to={`/opd/${a.id}`}>Notes</Link> : null,
            },
          ]}
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          Consultation notes and bills appear here once OPD and billing are added.
        </Typography.Paragraph>
      </Card>
      <BookAppointmentModal
        open={booking}
        patient={patient}
        onClose={() => setBooking(false)}
        onBooked={loadAppointments}
      />
    </Space>
  );
}

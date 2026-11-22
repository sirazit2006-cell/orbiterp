import { EditOutlined } from "@ant-design/icons";
import { Button, Card, Descriptions, Result, Space, Spin, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Patient } from "../api/types";
import { useAuth } from "../auth/AuthContext";

const GENDER = { M: "Male", F: "Female", O: "Other" } as const;

export default function PatientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [missing, setMissing] = useState(false);

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
          <Button icon={<EditOutlined />} onClick={() => navigate(`/patients/${patient.id}/edit`)}>
            Edit
          </Button>
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
      <Card title="Visits and bills">
        <Typography.Text type="secondary">Visit history and bills appear here once OPD and billing are added.</Typography.Text>
      </Card>
    </Space>
  );
}

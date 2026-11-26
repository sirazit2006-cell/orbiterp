import { Card, Col, Row, Statistic, Typography } from "antd";
import { useEffect, useState } from "react";
import { api, Page } from "../api/client";
import type { Doctor, PatientSummary } from "../api/types";
import { useAuth } from "../auth/AuthContext";

export default function DashboardPage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<number | null>(null);
  const [doctors, setDoctors] = useState<number | null>(null);

  useEffect(() => {
    api.get<Page<PatientSummary>>("/patients/").then((r) => setPatients(r.data.count));
    api.get<Page<Doctor>>("/doctors/", { params: { is_active: true } }).then((r) => setDoctors(r.data.count));
  }, []);

  return (
    <>
      <Typography.Title level={3}>Welcome, {user?.full_name}</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Registered patients" value={patients ?? "–"} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Active doctors" value={doctors ?? "–"} />
          </Card>
        </Col>
      </Row>
      <Typography.Paragraph type="secondary" style={{ marginTop: 24 }}>
        Today's visits, queue and collections will be summarised here in the pilot release.
      </Typography.Paragraph>
    </>
  );
}

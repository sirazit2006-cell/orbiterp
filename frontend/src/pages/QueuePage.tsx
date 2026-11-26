import { DesktopOutlined } from "@ant-design/icons";
import { App, Button, Card, Col, Empty, List, Row, Select, Space, Statistic, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, fieldErrors } from "../api/client";
import type { Appointment, Queue } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useDoctors } from "../components/useDoctors";

const REFRESH_MS = 15000;

/** The token queue for one doctor today. Doctors see their own; others pick a doctor. */
export default function QueuePage() {
  const { hasRole, user } = useAuth();
  const { message } = App.useApp();
  const { options, doctors } = useDoctors();
  const [params, setParams] = useSearchParams();
  const ownDoctor = doctors.find((d) => d.user === user?.id);
  const doctorId = params.get("doctor") ? Number(params.get("doctor")) : ownDoctor?.id;
  const [queue, setQueue] = useState<Queue | null>(null);
  const isDoctor = !!ownDoctor && ownDoctor.id === doctorId;
  const canAct = isDoctor || hasRole("admin");

  const load = useCallback(() => {
    if (!doctorId) return;
    api.get<Queue>("/appointments/queue/", { params: { doctor: doctorId } }).then((r) => setQueue(r.data));
  }, [doctorId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const act = async (appt: Appointment, action: "start" | "complete") => {
    try {
      await api.post(`/appointments/${appt.id}/${action}/`);
      load();
    } catch (err) {
      message.error(Object.values(fieldErrors(err))[0] ?? "That did not work.");
    }
  };

  const callNext = () => {
    const next = queue?.waiting[0];
    if (next) act(next, "start");
  };

  const current = queue?.current[0];

  return (
    <>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>
          OPD queue · {dayjs().format("ddd, DD MMM")}
        </Typography.Title>
        <Space wrap>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Choose a doctor"
            style={{ minWidth: 260 }}
            value={doctorId}
            options={options}
            onChange={(v) => setParams({ doctor: String(v) })}
          />
          {doctorId && (
            <Button icon={<DesktopOutlined />} href={`/queue/display?doctor=${doctorId}`} target="_blank">
              Waiting-room display
            </Button>
          )}
        </Space>
      </Space>

      {!doctorId ? (
        <Empty description="Choose a doctor to see their queue" />
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={8}>
            <Card title="With the doctor">
              {current ? (
                <>
                  <Statistic title="Token" value={current.token_no ?? "–"} />
                  <Typography.Title level={4} style={{ marginTop: 8 }}>
                    {current.patient_name}
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    {current.patient_uhid} · {current.patient_age ?? "?"} yrs · {current.visit_type === "follow_up" ? "Follow-up" : "New"}
                  </Typography.Text>
                  {current.reason && <p style={{ marginTop: 8 }}>{current.reason}</p>}
                  {canAct && (
                    <Button type="primary" block style={{ marginTop: 16 }} onClick={() => act(current, "complete")}>
                      Complete consultation
                    </Button>
                  )}
                </>
              ) : (
                <Empty description="Nobody is with the doctor" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                  {canAct && (
                    <Button type="primary" disabled={!queue?.waiting.length} onClick={callNext}>
                      Call next patient
                    </Button>
                  )}
                </Empty>
              )}
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card title={`Waiting (${queue?.waiting.length ?? 0})`}>
              <List
                dataSource={queue?.waiting}
                locale={{ emptyText: "Nobody waiting" }}
                renderItem={(a, i) => (
                  <List.Item
                    actions={
                      canAct && !current && i === 0
                        ? [
                            <Button key="call" size="small" onClick={() => act(a, "start")}>
                              Call in
                            </Button>,
                          ]
                        : undefined
                    }
                  >
                    <List.Item.Meta
                      avatar={<Tag color="gold" style={{ fontSize: 16, padding: "4px 10px" }}>{a.token_no}</Tag>}
                      title={a.patient_name}
                      description={`${a.patient_uhid} · ${a.slot_time ? `slot ${a.slot_time.slice(0, 5)}` : "walk-in"} · waiting since ${dayjs(a.checked_in_at).format("HH:mm")}`}
                    />
                  </List.Item>
                )}
              />
            </Card>
          </Col>
          <Col xs={24} lg={6}>
            <Card title={`Seen today (${queue?.done.length ?? 0})`}>
              <List
                size="small"
                dataSource={queue?.done}
                locale={{ emptyText: "None yet" }}
                renderItem={(a) => (
                  <List.Item>
                    {a.token_no}. {a.patient_name}
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        </Row>
      )}
    </>
  );
}

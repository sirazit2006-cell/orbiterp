import { DeleteOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  TimePicker,
  Typography,
} from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, fieldErrors, Page } from "../api/client";
import type { Leave, Schedule } from "../api/types";
import { useDoctors } from "../components/useDoctors";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface SessionForm {
  weekdays: number[];
  time: [Dayjs, Dayjs];
  slot_minutes: number;
  max_patients?: number;
}

interface LeaveForm {
  range: [Dayjs, Dayjs];
  reason?: string;
}

/** Admin page: each doctor's weekly OPD sessions and their leave. */
export default function SchedulesPage() {
  const { message } = App.useApp();
  const { options } = useDoctors();
  const [params, setParams] = useSearchParams();
  const doctor = params.get("doctor") ? Number(params.get("doctor")) : undefined;
  const [sessions, setSessions] = useState<Schedule[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [sessionForm] = Form.useForm<SessionForm>();
  const [leaveForm] = Form.useForm<LeaveForm>();

  const load = useCallback(() => {
    if (!doctor) return;
    api.get<Schedule[]>("/schedules/", { params: { doctor } }).then((r) => setSessions(r.data));
    api.get<Page<Leave>>("/doctor-leaves/", { params: { doctor, page_size: 100 } }).then((r) => setLeaves(r.data.results));
  }, [doctor]);

  useEffect(load, [load]);

  const addSessions = async (v: SessionForm) => {
    const failures: string[] = [];
    for (const weekday of v.weekdays) {
      try {
        await api.post("/schedules/", {
          doctor,
          weekday,
          start_time: v.time[0].format("HH:mm"),
          end_time: v.time[1].format("HH:mm"),
          slot_minutes: v.slot_minutes,
          max_patients: v.max_patients ?? null,
        });
      } catch (err) {
        failures.push(`${WEEKDAYS[weekday]}: ${Object.values(fieldErrors(err))[0]}`);
      }
    }
    if (failures.length) message.error(failures.join(" "));
    else message.success("Sessions added");
    sessionForm.resetFields(["weekdays"]);
    load();
  };

  const toggle = async (s: Schedule, is_active: boolean) => {
    try {
      await api.patch(`/schedules/${s.id}/`, { is_active });
      load();
    } catch (err) {
      message.error(Object.values(fieldErrors(err))[0] ?? "Could not change the session.");
    }
  };

  const remove = async (s: Schedule) => {
    await api.delete(`/schedules/${s.id}/`);
    load();
  };

  const addLeave = async (v: LeaveForm) => {
    try {
      const { data } = await api.post<Leave>("/doctor-leaves/", {
        doctor,
        from_date: v.range[0].format("YYYY-MM-DD"),
        to_date: v.range[1].format("YYYY-MM-DD"),
        reason: v.reason ?? "",
      });
      message.success(
        data.flagged_appointments
          ? `Leave saved. ${data.flagged_appointments} booked appointment(s) now need a new slot; reception will see them on the Appointments page.`
          : "Leave saved. No booked appointments were affected.",
        6,
      );
      leaveForm.resetFields();
      load();
    } catch (err) {
      message.error(Object.values(fieldErrors(err))[0] ?? "Could not save the leave.");
    }
  };

  const removeLeave = async (l: Leave) => {
    await api.delete(`/doctor-leaves/${l.id}/`);
    load();
  };

  return (
    <>
      <Typography.Title level={3}>Doctor schedules</Typography.Title>
      <Select
        showSearch
        optionFilterProp="label"
        placeholder="Choose a doctor"
        style={{ minWidth: 300, marginBottom: 16 }}
        value={doctor}
        options={options}
        onChange={(v) => setParams({ doctor: String(v) })}
      />
      {!doctor ? (
        <Empty description="Choose a doctor to see and edit their OPD sessions" />
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={15}>
            <Card title="Weekly OPD sessions">
              <Table<Schedule>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={sessions}
                columns={[
                  { title: "Day", dataIndex: "weekday_name" },
                  { title: "Time", render: (_, s) => `${s.start_time.slice(0, 5)} to ${s.end_time.slice(0, 5)}` },
                  { title: "Slot", render: (_, s) => `${s.slot_minutes} min` },
                  { title: "Max patients", render: (_, s) => s.max_patients ?? "one per slot" },
                  { title: "Active", render: (_, s) => <Switch size="small" checked={s.is_active} onChange={(v) => toggle(s, v)} /> },
                  {
                    title: "",
                    render: (_, s) => (
                      <Popconfirm title="Delete this session?" onConfirm={() => remove(s)}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    ),
                  },
                ]}
              />
              <Typography.Title level={5} style={{ marginTop: 24 }}>
                Add sessions
              </Typography.Title>
              <Form
                form={sessionForm}
                layout="vertical"
                onFinish={addSessions}
                initialValues={{ slot_minutes: 15, time: [dayjs("10:00", "HH:mm"), dayjs("13:00", "HH:mm")] }}
              >
                <Row gutter={12}>
                  <Col xs={24} md={10}>
                    <Form.Item name="weekdays" label="Days" rules={[{ required: true }]}>
                      <Select mode="multiple" options={WEEKDAYS.map((d, i) => ({ value: i, label: d }))} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="time" label="From and to" rules={[{ required: true }]}>
                      <TimePicker.RangePicker format="HH:mm" minuteStep={5} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={4}>
                    <Form.Item name="slot_minutes" label="Slot (min)" rules={[{ required: true }]}>
                      <InputNumber min={5} max={120} step={5} style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={4}>
                    <Form.Item name="max_patients" label="Max patients">
                      <InputNumber min={1} style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                </Row>
                <Button type="primary" htmlType="submit">
                  Add
                </Button>
              </Form>
            </Card>
          </Col>
          <Col xs={24} xl={9}>
            <Card title="Leave">
              <Form form={leaveForm} layout="vertical" onFinish={addLeave}>
                <Form.Item name="range" label="Dates" rules={[{ required: true }]}>
                  <DatePicker.RangePicker format="DD MMM YYYY" style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item name="reason" label="Reason">
                  <Input maxLength={200} />
                </Form.Item>
                <Button htmlType="submit">Add leave</Button>
              </Form>
              <Table<Leave>
                rowKey="id"
                size="small"
                style={{ marginTop: 16 }}
                pagination={false}
                dataSource={leaves}
                columns={[
                  {
                    title: "Dates",
                    render: (_, l) =>
                      l.from_date === l.to_date
                        ? dayjs(l.from_date).format("DD MMM YYYY")
                        : `${dayjs(l.from_date).format("DD MMM")} to ${dayjs(l.to_date).format("DD MMM YYYY")}`,
                  },
                  { title: "Reason", dataIndex: "reason" },
                  {
                    title: "",
                    render: (_, l) => (
                      <Popconfirm title="Remove this leave?" onConfirm={() => removeLeave(l)}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    ),
                  },
                ]}
              />
            </Card>
          </Col>
        </Row>
      )}
      <Space />
    </>
  );
}

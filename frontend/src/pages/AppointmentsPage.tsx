import { CalendarOutlined, UserAddOutlined } from "@ant-design/icons";
import { Alert, App, Button, DatePicker, Dropdown, Input, Modal, Select, Space, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, fieldErrors, Page } from "../api/client";
import type { Appointment, AppointmentStatus, FollowUpDue, PatientSummary } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import BookAppointmentModal from "../components/BookAppointmentModal";
import RescheduleModal from "../components/RescheduleModal";
import StatusTag from "../components/StatusTag";
import { useDoctors } from "../components/useDoctors";

const STATUS_OPTIONS: { value: AppointmentStatus; label: string }[] = [
  { value: "booked", label: "Booked" },
  { value: "checked_in", label: "Checked in" },
  { value: "with_doctor", label: "With doctor" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" },
];

export default function AppointmentsPage() {
  const { hasRole } = useAuth();
  const { message } = App.useApp();
  const { options: doctorOptions } = useDoctors();
  const [params, setParams] = useSearchParams();
  const date = params.get("date") ?? dayjs().format("YYYY-MM-DD");
  const doctor = params.get("doctor") ? Number(params.get("doctor")) : undefined;
  const status = params.get("status") ?? undefined;
  const onlyFlagged = params.get("needs") === "1";
  const [rows, setRows] = useState<Appointment[]>([]);
  const [flagged, setFlagged] = useState(0);
  const [followUps, setFollowUps] = useState<FollowUpDue[]>([]);
  const [bookFor, setBookFor] = useState<FollowUpDue | null>(null);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState<null | "booking" | "walk_in">(null);
  const [moving, setMoving] = useState<Appointment | null>(null);
  const canBook = hasRole("reception");

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<Page<Appointment>>("/appointments/", {
        params: onlyFlagged
          ? { needs_reschedule: true, status: "booked", date__gte: dayjs().format("YYYY-MM-DD"), page_size: 500, ordering: "date,slot_time" }
          : { date, doctor, status, page_size: 500, ordering: "slot_time,token_no" },
      })
      .then((r) => setRows(r.data.results))
      .finally(() => setLoading(false));
    api
      .get<Page<Appointment>>("/appointments/", {
        params: { needs_reschedule: true, status: "booked", date__gte: dayjs().format("YYYY-MM-DD"), page_size: 1 },
      })
      .then((r) => setFlagged(r.data.count));
    if (canBook) api.get<FollowUpDue[]>("/opd/follow-ups/", { params: { date } }).then((r) => setFollowUps(r.data));
  }, [date, doctor, status, onlyFlagged, canBook]);

  useEffect(load, [load]);

  const act = async (appt: Appointment, action: string, body?: object) => {
    try {
      const { data } = await api.post<Appointment>(`/appointments/${appt.id}/${action}/`, body);
      message.success(
        action === "check_in" ? `${data.patient_name} checked in, token ${data.token_no}` : `${data.patient_name}: ${data.status_label}`,
      );
      load();
    } catch (err) {
      message.error(Object.values(fieldErrors(err))[0] ?? "That did not work.");
    }
  };

  const cancel = (appt: Appointment) => {
    let reason = "";
    Modal.confirm({
      title: `Cancel ${appt.patient_name}'s appointment?`,
      content: <Input placeholder="Reason, e.g. patient called to cancel" onChange={(e) => (reason = e.target.value)} />,
      okText: "Cancel appointment",
      okButtonProps: { danger: true },
      cancelText: "Keep it",
      onOk: () => act(appt, "cancel", { cancel_reason: reason }),
    });
  };

  const counts = STATUS_OPTIONS.map((s) => ({ ...s, n: rows.filter((r) => r.status === s.value).length })).filter((s) => s.n);

  return (
    <>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Appointments
        </Typography.Title>
        {canBook && (
          <Space>
            <Button icon={<UserAddOutlined />} onClick={() => setBooking("walk_in")}>
              Walk-in
            </Button>
            <Button type="primary" icon={<CalendarOutlined />} onClick={() => setBooking("booking")}>
              Book appointment
            </Button>
          </Space>
        )}
      </Space>

      {onlyFlagged && (
        <Alert
          type="info"
          style={{ marginBottom: 16 }}
          message="Showing upcoming appointments that fall on a doctor's leave. Reschedule each one, then go back."
          action={<Button size="small" onClick={() => setParams({})}>Back to day view</Button>}
        />
      )}

      {flagged > 0 && canBook && !onlyFlagged && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${flagged} upcoming appointment${flagged > 1 ? "s fall" : " falls"} on a doctor's leave and need${flagged > 1 ? "" : "s"} a new slot.`}
          action={
            <Button size="small" onClick={() => setParams({ needs: "1" })}>
              Show them
            </Button>
          }
        />
      )}

      {followUps.length > 0 && canBook && !onlyFlagged && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${followUps.length} patient${followUps.length > 1 ? "s were" : " was"} asked to come back on this date and ${followUps.length > 1 ? "have" : "has"} no appointment yet`}
          description={
            <Space direction="vertical" size={4}>
              {followUps.map((f) => (
                <Space key={`${f.patient}-${f.doctor}`} wrap>
                  <Link to={`/patients/${f.patient}`}>{f.patient_name}</Link>
                  <span style={{ color: "#888" }}>
                    {f.patient_uhid} · {f.patient_mobile} · {f.doctor_name} · last seen {dayjs(f.last_visit).format("DD MMM")}
                  </span>
                  <Button size="small" onClick={() => setBookFor(f)}>
                    Book
                  </Button>
                </Space>
              ))}
            </Space>
          }
        />
      )}

      <Space wrap style={{ marginBottom: 16 }}>
        <Button onClick={() => setParam("date", dayjs(date).subtract(1, "day").format("YYYY-MM-DD"))}>‹</Button>
        <DatePicker
          value={dayjs(date)}
          format="ddd, DD MMM YYYY"
          allowClear={false}
          onChange={(d) => setParam("date", d.format("YYYY-MM-DD"))}
        />
        <Button onClick={() => setParam("date", dayjs(date).add(1, "day").format("YYYY-MM-DD"))}>›</Button>
        <Button onClick={() => setParam("date", undefined)}>Today</Button>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="All doctors"
          style={{ minWidth: 240 }}
          value={doctor}
          options={doctorOptions}
          onChange={(v) => setParam("doctor", v ? String(v) : undefined)}
        />
        <Select
          allowClear
          placeholder="All statuses"
          style={{ minWidth: 160 }}
          value={status}
          options={STATUS_OPTIONS}
          onChange={(v) => setParam("status", v)}
        />
      </Space>

      <div style={{ marginBottom: 12 }}>
        {counts.map((c) => (
          <Tag key={c.value}>
            {c.label}: {c.n}
          </Tag>
        ))}
      </div>

      <Table<Appointment>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 900 }}
        columns={[
          {
            title: onlyFlagged ? "Date and time" : "Time",
            render: (_, a) => (
              <>
                {onlyFlagged && <div>{dayjs(a.date).format("DD MMM")}</div>}
                {a.slot_time ? a.slot_time.slice(0, 5) : <Tag>Walk-in</Tag>}
              </>
            ),
            width: 110,
          },
          { title: "Token", dataIndex: "token_no", width: 70, render: (t) => t ?? "–" },
          {
            title: "Patient",
            render: (_, a) => (
              <>
                <Link to={`/patients/${a.patient}`}>{a.patient_name}</Link>
                <div style={{ fontSize: 12, color: "#888" }}>
                  {a.patient_uhid} · {a.patient_mobile}
                </div>
              </>
            ),
          },
          {
            title: "Doctor",
            render: (_, a) => (
              <>
                {a.doctor_name}
                <div style={{ fontSize: 12, color: "#888" }}>{a.department_name}</div>
              </>
            ),
          },
          {
            title: "Visit",
            dataIndex: "visit_type",
            width: 100,
            render: (v) => (v === "follow_up" ? <Tag color="cyan">Follow-up</Tag> : "New"),
          },
          {
            title: "Status",
            width: 170,
            render: (_, a) => (
              <>
                <StatusTag status={a.status} label={a.status_label} />
                {a.needs_reschedule && a.status === "booked" && <Tag color="orange">Doctor on leave</Tag>}
              </>
            ),
          },
          {
            title: "",
            width: 210,
            render: (_, a) =>
              canBook && (
                <Space>
                  {a.status === "booked" && dayjs(a.date).isSame(dayjs(), "day") && (
                    <Button size="small" type="primary" onClick={() => act(a, "check_in")}>
                      Check in
                    </Button>
                  )}
                  {(a.status === "booked" || a.status === "checked_in") && (
                    <Dropdown
                      menu={{
                        items: [
                          ...(a.status === "booked"
                            ? [
                                { key: "reschedule", label: "Reschedule", onClick: () => setMoving(a) },
                                { key: "no_show", label: "Mark no-show", onClick: () => act(a, "no_show") },
                              ]
                            : []),
                          { key: "cancel", label: "Cancel", danger: true, onClick: () => cancel(a) },
                        ],
                      }}
                    >
                      <Button size="small">More</Button>
                    </Dropdown>
                  )}
                </Space>
              ),
          },
        ]}
      />

      <BookAppointmentModal
        open={booking !== null}
        walkIn={booking === "walk_in"}
        doctor={doctor}
        onClose={() => setBooking(null)}
        onBooked={(a) => setParams({ date: a.date })}
      />
      <BookAppointmentModal
        open={bookFor !== null}
        patient={bookFor ? ({ id: bookFor.patient, uhid: bookFor.patient_uhid, full_name: bookFor.patient_name, mobile: bookFor.patient_mobile, age: null } as PatientSummary) : undefined}
        doctor={bookFor?.doctor}
        date={bookFor?.follow_up_date}
        onClose={() => setBookFor(null)}
        onBooked={load}
      />
      <RescheduleModal appointment={moving} onClose={() => setMoving(null)} onDone={load} />
    </>
  );
}

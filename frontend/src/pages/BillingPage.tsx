import { BarChartOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Button, Card, DatePicker, Form, Input, Modal, Segmented, Space, Table, Typography } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, fieldErrors, Page } from "../api/client";
import type { Bill, BillSummary, VisitPendingOrders } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import PatientSelect from "../components/PatientSelect";
import BillStatusTag from "../components/billing/BillStatusTag";
import ShiftBar from "../components/billing/ShiftBar";
import { inr, num } from "../components/billing/money";
import { useShift } from "../components/billing/useShift";

const VIEWS = [
  { value: "unpaid", label: "To collect" },
  { value: "all", label: "All bills" },
];

export default function BillingPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const shift = useShift();
  const [params, setParams] = useSearchParams();
  const date = params.get("date") ?? dayjs().format("YYYY-MM-DD");
  const view = params.get("view") ?? "unpaid";
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<BillSummary[]>([]);
  const [waiting, setWaiting] = useState<VisitPendingOrders[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<Page<BillSummary>>("/bills/", {
        params: {
          // A search looks across all days, so a patient coming back for an old bill is found.
          ...(search ? { search } : { date }),
          ...(view === "unpaid" ? { status__in: "draft,partly_paid" } : {}),
          page_size: 500,
        },
      })
      .then((r) => setRows(r.data.results))
      .finally(() => setLoading(false));
    api.get<VisitPendingOrders[]>("/bills/pending-orders/", { params: { date } }).then((r) => setWaiting(r.data));
  }, [date, view, search]);

  const billOrders = async (v: VisitPendingOrders) => {
    try {
      const { data } = await api.post<Bill>(`/bills/bill-orders/${v.appointment}/`);
      navigate(`/billing/${data.id}`);
    } catch (err) {
      message.error(Object.values(fieldErrors(err))[0] ?? "Could not bill the tests.");
    }
  };

  useEffect(load, [load]);

  const create = async ({ patient }: { patient: number }) => {
    try {
      const { data } = await api.post<Bill>("/bills/", { patient });
      navigate(`/billing/${data.id}`);
    } catch (err) {
      message.error(Object.values(fieldErrors(err))[0] ?? "Could not start the bill.");
    }
  };

  const due = rows.filter((r) => r.status === "draft" || r.status === "partly_paid");
  const dueTotal = due.reduce((s, r) => s + num(r.balance), 0);

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Billing
        </Typography.Title>
        <Space wrap>
          {hasRole("cashier") && (
            <Button icon={<BarChartOutlined />} onClick={() => navigate("/billing/report")}>
              Collection report
            </Button>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            New bill
          </Button>
        </Space>
      </Space>

      <ShiftBar {...shift} />

      <Space wrap>
        <Segmented options={VIEWS} value={view} onChange={(v) => setParam("view", v === "unpaid" ? undefined : String(v))} />
        <Button onClick={() => setParam("date", dayjs(date).subtract(1, "day").format("YYYY-MM-DD"))} disabled={!!search}>
          ‹
        </Button>
        <DatePicker
          value={dayjs(date)}
          format="ddd, DD MMM YYYY"
          allowClear={false}
          disabled={!!search}
          onChange={(d) => setParam("date", d ? d.format("YYYY-MM-DD") : undefined)}
        />
        <Button onClick={() => setParam("date", dayjs(date).add(1, "day").format("YYYY-MM-DD"))} disabled={!!search}>
          ›
        </Button>
        <Button onClick={() => setParam("date", undefined)} disabled={!!search}>
          Today
        </Button>
        <Input.Search
          allowClear
          placeholder="Bill no, UHID, name or mobile"
          style={{ width: 280 }}
          onSearch={(v) => setSearch(v.trim())}
        />
      </Space>

      {view === "unpaid" && !search && waiting.length > 0 && (
        <Card size="small" title="Tests ordered by doctors, not billed yet">
          <Table<VisitPendingOrders>
            rowKey="appointment"
            size="small"
            pagination={false}
            dataSource={waiting}
            scroll={{ x: 700 }}
            columns={[
              { title: "Token", dataIndex: "token_no", width: 70, render: (t) => t ?? "–" },
              {
                title: "Patient",
                render: (_, v) => (
                  <>
                    <Link to={`/patients/${v.patient}`}>{v.patient_name}</Link>
                    <div style={{ fontSize: 12, color: "#888" }}>{v.patient_uhid}</div>
                  </>
                ),
              },
              { title: "Doctor", dataIndex: "doctor_name" },
              { title: "Tests", render: (_, v) => v.orders.map((o) => o.service_name).join(", ") },
              { title: "Amount", align: "right", render: (_, v) => inr(v.total) },
              {
                title: "",
                width: 110,
                render: (_, v) => (
                  <Button size="small" type="primary" onClick={() => billOrders(v)}>
                    Bill tests
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      )}

      {due.length > 0 && (
        <Typography.Text>
          {due.length} {due.length === 1 ? "bill" : "bills"} to collect, {inr(dueTotal)} in all.
        </Typography.Text>
      )}

      <Table<BillSummary>
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 900 }}
        locale={{ emptyText: view === "unpaid" ? "Nothing to collect. Patients appear here when they are checked in." : "No bills" }}
        onRow={(b) => ({ onDoubleClick: () => navigate(`/billing/${b.id}`) })}
        columns={[
          { title: "Bill no", render: (_, b) => b.bill_no ?? <Typography.Text type="secondary">Not paid yet</Typography.Text> },
          {
            title: "Patient",
            render: (_, b) => (
              <>
                <Link to={`/patients/${b.patient}`}>{b.patient_name}</Link>
                <div style={{ fontSize: 12, color: "#888" }}>{b.patient_uhid}</div>
              </>
            ),
          },
          { title: "Doctor", render: (_, b) => b.doctor_name ?? <Typography.Text type="secondary">No visit</Typography.Text> },
          ...(search ? [{ title: "Date", render: (_: unknown, b: BillSummary) => dayjs(b.date).format("DD MMM YYYY") }] : []),
          { title: "Amount", align: "right", render: (_, b) => inr(b.net_total) },
          { title: "Paid", align: "right", render: (_, b) => inr(num(b.paid_total) - num(b.refunded_total)) },
          {
            title: "Balance",
            align: "right",
            render: (_, b) => (num(b.balance) > 0 ? <b>{inr(b.balance)}</b> : inr(0)),
          },
          { title: "Status", render: (_, b) => <BillStatusTag status={b.status} /> },
          {
            title: "",
            width: 110,
            render: (_, b) => (
              <Button size="small" type={num(b.balance) > 0 ? "primary" : "default"} onClick={() => navigate(`/billing/${b.id}`)}>
                {num(b.balance) > 0 ? "Collect" : "Open"}
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title="New bill"
        open={creating}
        onCancel={() => setCreating(false)}
        onOk={() => form.submit()}
        okText="Start bill"
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          For a lab test, scan or procedure without a doctor visit today. Visit bills open by themselves at check-in.
        </Typography.Paragraph>
        <Form form={form} name="new-bill" layout="vertical" onFinish={create} preserve={false}>
          <Form.Item name="patient" label="Patient" rules={[{ required: true, message: "Choose a patient" }]}>
            <PatientSelect />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

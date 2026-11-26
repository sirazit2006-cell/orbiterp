import { DeleteOutlined, PercentageOutlined, PlusOutlined, PrinterOutlined } from "@ant-design/icons";
import {
  Alert, App, Button, Card, Col, Descriptions, Dropdown, Input, InputNumber, Result, Row, Select, Space, Spin,
  Table, Tag, Typography,
} from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, fieldErrors, Page } from "../api/client";
import type { Bill, BillItem, Hospital, Service } from "../api/types";
import BillStatusTag from "../components/billing/BillStatusTag";
import { DiscountModal, PayModal, RefundModal } from "../components/billing/BillModals";
import ShiftBar from "../components/billing/ShiftBar";
import { CATEGORY_LABEL, inr, num } from "../components/billing/money";
import { useShift } from "../components/billing/useShift";

export default function BillPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const shift = useShift();
  const [bill, setBill] = useState<Bill | null>(null);
  const [missing, setMissing] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [pick, setPick] = useState<{ service?: number; qty: number }>({ qty: 1 });
  const [custom, setCustom] = useState<{ description: string; rate?: number } | null>(null);
  const [dialog, setDialog] = useState<null | "pay" | "refund" | "discount">(null);

  const load = useCallback(
    () =>
      api
        .get<Bill>(`/bills/${id}/`)
        .then((r) => setBill(r.data))
        .catch(() => setMissing(true)),
    [id],
  );

  useEffect(() => {
    load();
    api.get<Page<Service>>("/services/", { params: { is_active: true, page_size: 500 } }).then((r) => setServices(r.data.results));
    api.get<Hospital>("/hospital/").then((r) => setHospital(r.data));
  }, [load]);

  const post = async (path: string, body?: object, ok?: string) => {
    try {
      const { data } = await api.post<Bill>(`/bills/${id}/${path}`, body);
      setBill(data);
      if (ok) message.success(ok);
      return true;
    } catch (err) {
      message.error(Object.values(fieldErrors(err))[0] ?? "That did not work.", 6);
      return false;
    }
  };

  const done = (b: Bill) => {
    setBill(b);
    shift.reload();
  };

  if (missing) return <Result status="404" title="Bill not found" />;
  if (!bill) return <Spin />;

  const editable = bill.is_editable;
  const balance = num(bill.balance);
  const refundable = num(bill.paid_total) - num(bill.refunded_total);
  const cancelled = bill.status === "cancelled";
  const canTakeMoney = !!shift.shift;

  const addService = async () => {
    if (!pick.service) return;
    if (await post("add_item/", { service: pick.service, qty: pick.qty })) setPick({ qty: 1 });
  };

  const addCustom = async () => {
    if (!custom?.description.trim() || custom.rate == null) {
      message.warning("Enter a description and a rate.");
      return;
    }
    if (await post("add_item/", { description: custom.description.trim(), rate: custom.rate })) setCustom(null);
  };

  const addAllOrders = async () => {
    for (const o of bill.pending_orders) {
      if (!(await post("add_item/", { order: o.id }))) return;
    }
    message.success("Ordered tests added.");
  };

  const billOrdersSeparately = async () => {
    try {
      const { data } = await api.post<Bill>(`/bills/bill-orders/${bill.appointment}/`);
      message.success("The ordered tests are on a new bill.");
      navigate(`/billing/${data.id}`);
    } catch (err) {
      message.error(Object.values(fieldErrors(err))[0] ?? "That did not work.");
    }
  };

  const cancelBill = () => {
    let reason = "";
    modal.confirm({
      title: "Cancel this bill?",
      content: (
        <Space direction="vertical" style={{ width: "100%" }}>
          {num(bill.paid_total) > 0 && <span>Money taken has been refunded. Only an admin can cancel a bill that had payments.</span>}
          <Input placeholder="Reason, e.g. patient left without the visit" onChange={(e) => (reason = e.target.value)} />
        </Space>
      ),
      okText: "Cancel bill",
      okButtonProps: { danger: true },
      cancelText: "Keep it",
      onOk: () => post("cancel/", { reason }, "Bill cancelled."),
    });
  };

  const serviceOptions = Object.entries(
    services.reduce<Record<string, Service[]>>((acc, s) => ((acc[s.category] ??= []).push(s), acc), {}),
  ).map(([cat, list]) => ({
    label: CATEGORY_LABEL[cat] ?? cat,
    options: list.map((s) => ({ value: s.id, label: `${s.name} · ${inr(s.price)}`, search: `${s.code} ${s.name}` })),
  }));

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
        <Space align="center" wrap>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {bill.bill_no ? `Bill ${bill.bill_no}` : "Bill"}
          </Typography.Title>
          <BillStatusTag status={bill.status} />
        </Space>
        <Space wrap>
          <Button onClick={() => navigate("/billing")}>Back to billing</Button>
          <Button icon={<PrinterOutlined />} onClick={() => navigate(`/print/bill/${bill.id}`)}>
            {bill.bill_no ? "Print bill" : "Print estimate"}
          </Button>
          {(refundable > 0 || !cancelled) && (
            <Dropdown
              menu={{
                items: [
                  ...(refundable > 0 ? [{ key: "refund", label: "Refund", disabled: !canTakeMoney, onClick: () => setDialog("refund") }] : []),
                  ...(!cancelled ? [{ key: "cancel", label: "Cancel bill", danger: true, onClick: cancelBill }] : []),
                ],
              }}
            >
              <Button>More</Button>
            </Dropdown>
          )}
          {balance > 0 && !cancelled && (
            <Button type="primary" size="large" disabled={!canTakeMoney} onClick={() => setDialog("pay")}>
              Take payment {inr(balance)}
            </Button>
          )}
        </Space>
      </Space>

      {!shift.shift && <ShiftBar {...shift} />}
      {cancelled && <Alert type="error" showIcon message="This bill is cancelled" description={bill.cancel_reason} />}

      <Card size="small">
        <Descriptions column={{ xs: 1, sm: 2, lg: 4 }} size="small">
          <Descriptions.Item label="Patient">
            <Link to={`/patients/${bill.patient}`}>{bill.patient_name}</Link>
          </Descriptions.Item>
          <Descriptions.Item label="UHID">{bill.patient_uhid}</Descriptions.Item>
          <Descriptions.Item label="Age / gender">
            {bill.patient_age ?? "?"} yrs, {{ M: "Male", F: "Female", O: "Other" }[bill.patient_gender]}
          </Descriptions.Item>
          <Descriptions.Item label="Mobile">{bill.patient_mobile}</Descriptions.Item>
          <Descriptions.Item label="Doctor">{bill.doctor_name ?? "No visit (direct bill)"}</Descriptions.Item>
          <Descriptions.Item label="Date">{dayjs(bill.date).format("DD MMM YYYY")}</Descriptions.Item>
        </Descriptions>
      </Card>

      {editable && bill.pending_orders.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="The doctor ordered tests that are not on the bill yet"
          description={
            <Space wrap>
              {bill.pending_orders.map((o) => (
                <Button key={o.id} size="small" icon={<PlusOutlined />} onClick={() => post("add_item/", { order: o.id })}>
                  {o.service_name} {inr(o.price)}
                </Button>
              ))}
              {bill.pending_orders.length > 1 && (
                <Button size="small" type="primary" onClick={addAllOrders}>
                  Add all
                </Button>
              )}
            </Space>
          }
        />
      )}
      {!editable && !cancelled && bill.pending_orders.length > 0 && bill.appointment && (
        <Alert
          type="warning"
          showIcon
          message={`The doctor ordered ${bill.pending_orders.map((o) => o.service_name).join(", ")}, not billed yet`}
          action={
            <Button type="primary" onClick={billOrdersSeparately}>
              Bill the tests
            </Button>
          }
        />
      )}
      {bill.visit_bills.length > 0 && (
        <Typography.Text type="secondary">
          Other bills for this visit:{" "}
          {bill.visit_bills.map((b, i) => (
            <span key={b.id}>
              {i > 0 && ", "}
              <Link to={`/billing/${b.id}`}>{b.bill_no ?? "unpaid bill"}</Link> ({inr(b.net_total)})
            </span>
          ))}
        </Typography.Text>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Card
            title="Items"
            extra={
              editable && (
                <Button icon={<PercentageOutlined />} onClick={() => setDialog("discount")} disabled={!bill.items.length}>
                  Discount
                </Button>
              )
            }
          >
            <Table<BillItem>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={bill.items}
              locale={{ emptyText: "No items yet. Add a service below." }}
              scroll={{ x: 640 }}
              columns={[
                {
                  title: "Item",
                  render: (_, i) => (
                    <>
                      {i.description}
                      {i.order && <Tag style={{ marginLeft: 6 }}>Ordered by doctor</Tag>}
                      <div style={{ fontSize: 12, color: "#888" }}>{CATEGORY_LABEL[i.category]}</div>
                    </>
                  ),
                },
                { title: "Qty", dataIndex: "qty", align: "right", width: 60 },
                { title: "Rate", align: "right", render: (_, i) => inr(i.rate) },
                { title: "Discount", align: "right", render: (_, i) => (num(i.discount) ? `−${inr(i.discount)}` : "") },
                { title: "GST", align: "right", render: (_, i) => (num(i.tax_amount) ? inr(i.tax_amount) : "") },
                { title: "Amount", align: "right", render: (_, i) => <b>{inr(i.amount)}</b> },
                ...(editable
                  ? [
                      {
                        title: "",
                        width: 50,
                        render: (_: unknown, i: BillItem) => (
                          <Button
                            size="small"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            aria-label={`Remove ${i.description}`}
                            onClick={() => post(`remove_item/${i.id}/`)}
                          />
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            {editable ? (
              <Space direction="vertical" style={{ width: "100%", marginTop: 16 }}>
                <Space.Compact style={{ width: "100%" }}>
                  <Select
                    showSearch
                    style={{ flex: 1 }}
                    placeholder="Add a service: lab test, scan, procedure…"
                    value={pick.service}
                    onChange={(v) => setPick({ ...pick, service: v })}
                    options={serviceOptions}
                    filterOption={(input, opt) =>
                      String((opt as { search?: string })?.search ?? "").toLowerCase().includes(input.toLowerCase())
                    }
                  />
                  <InputNumber min={1} max={999} value={pick.qty} onChange={(q) => setPick({ ...pick, qty: q ?? 1 })} style={{ width: 80 }} aria-label="Quantity" />
                  <Button type="primary" icon={<PlusOutlined />} disabled={!pick.service} onClick={addService}>
                    Add
                  </Button>
                </Space.Compact>
                {custom ? (
                  <Space.Compact style={{ width: "100%" }}>
                    <Input
                      placeholder="Description, e.g. dressing material"
                      value={custom.description}
                      onChange={(e) => setCustom({ ...custom, description: e.target.value })}
                      autoFocus
                    />
                    <InputNumber min={0} prefix="₹" placeholder="Rate" value={custom.rate} onChange={(r) => setCustom({ ...custom, rate: r ?? undefined })} style={{ width: 140 }} />
                    <Button onClick={addCustom}>Add</Button>
                    <Button onClick={() => setCustom(null)}>Cancel</Button>
                  </Space.Compact>
                ) : (
                  <Button type="link" style={{ padding: 0 }} onClick={() => setCustom({ description: "" })}>
                    Add a charge that is not in the list
                  </Button>
                )}
              </Space>
            ) : (
              !cancelled && (
                <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                  Items are locked once a payment is taken. Tests ordered later go on a second bill for the visit.
                </Typography.Paragraph>
              )
            )}
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="Summary">
            <Descriptions column={1} size="small" labelStyle={{ width: 140 }} contentStyle={{ justifyContent: "flex-end" }}>
              <Descriptions.Item label="Items total">{inr(bill.subtotal)}</Descriptions.Item>
              {num(bill.discount_total) > 0 && (
                <Descriptions.Item label="Discount">−{inr(bill.discount_total)}</Descriptions.Item>
              )}
              {num(bill.tax_total) > 0 && <Descriptions.Item label="GST">{inr(bill.tax_total)}</Descriptions.Item>}
              <Descriptions.Item label={<b>Net amount</b>}>
                <b>{inr(bill.net_total)}</b>
              </Descriptions.Item>
              <Descriptions.Item label="Paid">{inr(bill.paid_total)}</Descriptions.Item>
              {num(bill.refunded_total) > 0 && <Descriptions.Item label="Refunded">−{inr(bill.refunded_total)}</Descriptions.Item>}
              <Descriptions.Item label={<b>Balance</b>}>
                <Typography.Title level={4} style={{ margin: 0, color: balance > 0 ? "#cf1322" : undefined }}>
                  {inr(balance)}
                </Typography.Title>
              </Descriptions.Item>
            </Descriptions>
            {num(bill.discount_total) > 0 && (
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                Discount reason: {bill.discount_reason}
                {bill.discount_approved_by_name ? `, given by ${bill.discount_approved_by_name}` : ""}
              </Typography.Paragraph>
            )}
          </Card>
        </Col>
      </Row>

      {(bill.payments.length > 0 || bill.refunds.length > 0) && (
        <Card title="Payments and refunds">
          <Table
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ x: 640 }}
            dataSource={[
              ...bill.payments.map((p) => ({
                key: `p${p.id}`, no: p.receipt_no, at: p.received_at, mode: p.mode_label, detail: p.reference, amount: num(p.amount), by: p.received_by_name,
              })),
              ...bill.refunds.map((r) => ({
                key: `r${r.id}`, no: r.refund_no, at: r.refunded_at, mode: r.mode_label, detail: r.reason, amount: -num(r.amount), by: r.refunded_by_name,
              })),
            ].sort((a, b) => a.at.localeCompare(b.at))}
            columns={[
              { title: "Number", dataIndex: "no" },
              { title: "Time", dataIndex: "at", render: (t: string) => dayjs(t).format("DD MMM, HH:mm") },
              { title: "Mode", dataIndex: "mode" },
              { title: "Reference / reason", dataIndex: "detail" },
              {
                title: "Amount",
                dataIndex: "amount",
                align: "right",
                render: (a: number) => <span style={{ color: a < 0 ? "#cf1322" : undefined }}>{a < 0 ? `−${inr(-a)}` : inr(a)}</span>,
              },
              { title: "By", dataIndex: "by" },
            ]}
          />
        </Card>
      )}

      <PayModal bill={bill} open={dialog === "pay"} onClose={() => setDialog(null)} onDone={done} />
      <RefundModal bill={bill} open={dialog === "refund"} onClose={() => setDialog(null)} onDone={done} limit={hospital?.cashier_refund_limit} />
      <DiscountModal bill={bill} open={dialog === "discount"} onClose={() => setDialog(null)} onDone={setBill} limit={hospital?.cashier_discount_limit_percent} />
    </Space>
  );
}

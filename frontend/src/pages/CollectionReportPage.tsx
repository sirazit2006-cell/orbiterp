import { PrinterOutlined } from "@ant-design/icons";
import { Button, Card, Col, DatePicker, Empty, Row, Space, Spin, Statistic, Table, Tag, Typography } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, Page } from "../api/client";
import type { CollectionReport, PayMode, Shift } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { CATEGORY_LABEL, inr, num } from "../components/billing/money";

/** Day-end collections: money in and out by mode and cashier, with every discount, refund and cancellation. */
export default function CollectionReportPage() {
  const { hasRole, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const from = params.get("from") ?? dayjs().format("YYYY-MM-DD");
  const to = params.get("to") ?? from;
  const [report, setReport] = useState<CollectionReport | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    setReport(null);
    api.get<CollectionReport>("/reports/collection/", { params: { from, to } }).then((r) => setReport(r.data));
    api
      .get<Page<Shift>>("/shifts/", { params: { from, to, page_size: 200 } })
      .then((r) => setShifts(r.data.results));
  }, [from, to]);

  const setRange = (range: [Dayjs | null, Dayjs | null] | null) => {
    if (!range?.[0] || !range[1]) return setParams({});
    setParams({ from: range[0].format("YYYY-MM-DD"), to: range[1].format("YYYY-MM-DD") });
  };

  const sameDay = from === to;
  const title = sameDay ? dayjs(from).format("dddd, DD MMM YYYY") : `${dayjs(from).format("DD MMM")} to ${dayjs(to).format("DD MMM YYYY")}`;

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }} className="report">
      <style>{`@media print { .ant-layout-sider, .ant-layout-header, .noprint { display: none !important; } .ant-layout-content { padding: 0 !important; } }`}</style>
      <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Collection report
          </Typography.Title>
          <Typography.Text type="secondary">
            {title}
            {!hasRole("admin") && ` · your own collections, ${user?.full_name}`}
          </Typography.Text>
        </div>
        <Space className="noprint" wrap>
          <DatePicker.RangePicker value={[dayjs(from), dayjs(to)]} format="DD MMM YYYY" allowClear={false} onChange={(r) => setRange(r as [Dayjs, Dayjs])} />
          <Button onClick={() => setParams({})}>Today</Button>
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
            Print
          </Button>
        </Space>
      </Space>

      {!report ? (
        <Spin />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}><Card><Statistic title="Received" value={inr(report.total_received)} /></Card></Col>
            <Col xs={12} md={6}><Card><Statistic title="Refunded" value={inr(report.total_refunded)} /></Card></Col>
            <Col xs={12} md={6}><Card><Statistic title="Net collection" value={inr(report.net)} valueStyle={{ fontWeight: 600 }} /></Card></Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Bills" value={report.bills.count} suffix={report.bills.unpaid ? <Typography.Text type="danger" style={{ fontSize: 14 }}>({report.bills.unpaid} unpaid)</Typography.Text> : null} />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="By payment mode" size="small">
                <Table
                  rowKey="mode"
                  size="small"
                  pagination={false}
                  dataSource={(Object.keys(report.modes) as PayMode[]).map((m) => ({ mode: m, ...report.modes[m] }))}
                  columns={[
                    { title: "Mode", dataIndex: "label" },
                    { title: "Received", align: "right", render: (_, r) => inr(r.received) },
                    { title: "Refunded", align: "right", render: (_, r) => inr(r.refunded) },
                    { title: "Net", align: "right", render: (_, r) => <b>{inr(r.net)}</b> },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="By cashier" size="small">
                <Table
                  rowKey="name"
                  size="small"
                  pagination={false}
                  dataSource={report.cashiers}
                  locale={{ emptyText: "No payments" }}
                  columns={[
                    { title: "Cashier", dataIndex: "name" },
                    { title: "Receipts", dataIndex: "receipts", align: "right" },
                    { title: "Received", align: "right", render: (_, r) => inr(r.received) },
                    { title: "Refunded", align: "right", render: (_, r) => inr(r.refunded) },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Billed by department of service" size="small">
                <Table
                  rowKey="category"
                  size="small"
                  pagination={false}
                  dataSource={report.billed_by_category}
                  locale={{ emptyText: "No paid bills" }}
                  columns={[
                    { title: "Category", render: (_, r) => CATEGORY_LABEL[r.category] ?? r.category },
                    { title: "Billed", align: "right", render: (_, r) => inr(r.total) },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Cash shifts" size="small">
                <Table<Shift>
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={shifts}
                  locale={{ emptyText: "No shifts" }}
                  scroll={{ x: 480 }}
                  columns={[
                    { title: "Cashier", dataIndex: "cashier_name" },
                    {
                      title: "Time",
                      render: (_, s) => `${dayjs(s.opened_at).format(sameDay ? "HH:mm" : "DD MMM HH:mm")} – ${s.closed_at ? dayjs(s.closed_at).format("HH:mm") : "open"}`,
                    },
                    { title: "Expected cash", align: "right", render: (_, s) => inr(s.status === "closed" ? s.expected_cash : s.totals.expected_cash) },
                    {
                      title: "Counted",
                      align: "right",
                      render: (_, s) =>
                        s.status === "open" ? (
                          <Tag color="gold">Open</Tag>
                        ) : num(s.difference) === 0 ? (
                          inr(s.counted_cash)
                        ) : (
                          <span title={s.note} style={{ color: "#cf1322" }}>
                            {inr(s.counted_cash)} ({num(s.difference) > 0 ? "+" : "−"}
                            {inr(Math.abs(num(s.difference)))})
                          </span>
                        ),
                    },
                  ]}
                />
              </Card>
            </Col>
          </Row>

          <Card title={`Discounts (${report.discounts.length})`} size="small">
            {report.discounts.length ? (
              <Table
                rowKey="bill"
                size="small"
                pagination={false}
                dataSource={report.discounts}
                columns={[
                  { title: "Bill", render: (_, d) => <Link to={`/billing/${d.bill}`}>{d.bill_no ?? "unpaid"}</Link> },
                  { title: "Patient", dataIndex: "patient" },
                  { title: "Amount", align: "right", render: (_, d) => inr(d.amount) },
                  { title: "Reason", dataIndex: "reason" },
                  { title: "Given by", dataIndex: "by" },
                ]}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No discounts" />
            )}
          </Card>
          <Card title={`Refunds (${report.refunds.length})`} size="small">
            {report.refunds.length ? (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={report.refunds}
                columns={[
                  { title: "Refund no", dataIndex: "refund_no" },
                  { title: "Time", render: (_, r) => dayjs(r.refunded_at).format("DD MMM, HH:mm") },
                  { title: "Mode", dataIndex: "mode_label" },
                  { title: "Amount", align: "right", render: (_, r) => inr(r.amount) },
                  { title: "Reason", dataIndex: "reason" },
                  { title: "By", dataIndex: "refunded_by_name" },
                ]}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No refunds" />
            )}
          </Card>
          <Card title={`Cancelled bills (${report.cancelled.length})`} size="small">
            {report.cancelled.length ? (
              <Table
                rowKey="bill"
                size="small"
                pagination={false}
                dataSource={report.cancelled}
                columns={[
                  { title: "Bill", render: (_, c) => <Link to={`/billing/${c.bill}`}>{c.bill_no ?? "unpaid"}</Link> },
                  { title: "Patient", dataIndex: "patient" },
                  { title: "Reason", dataIndex: "reason" },
                ]}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No cancelled bills" />
            )}
          </Card>
        </>
      )}
    </Space>
  );
}

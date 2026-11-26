import { Alert, App, Button, Form, Input, InputNumber, Modal, Space, Typography } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { api, fieldErrors } from "../../api/client";
import type { Shift } from "../../api/types";
import { inr, num } from "./money";

interface Props {
  shift: Shift | null;
  loaded: boolean;
  reload: () => Promise<unknown>;
}

/** Shows whether the cashier's drawer is open, with the open and day-end close steps. */
export default function ShiftBar({ shift, loaded, reload }: Props) {
  const { message, modal } = App.useApp();
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openForm] = Form.useForm();
  const [closeForm] = Form.useForm();
  const counted = Form.useWatch("counted_cash", closeForm);

  if (!loaded) return null;

  const open = async ({ opening_cash }: { opening_cash: number }) => {
    setBusy(true);
    try {
      await api.post("/shifts/open/", { opening_cash: opening_cash ?? 0 });
      await reload();
      setOpening(false);
      message.success("Shift opened. You can take payments now.");
    } catch (err) {
      message.error(Object.values(fieldErrors(err))[0] ?? "Could not open the shift.");
    } finally {
      setBusy(false);
    }
  };

  const close = async (values: { counted_cash: number; note?: string }) => {
    if (!shift) return;
    setBusy(true);
    try {
      const { data } = await api.post<Shift>(`/shifts/${shift.id}/close/`, values);
      setClosing(false);
      closeForm.resetFields();
      await reload();
      const diff = num(data.difference);
      modal.info({
        title: "Shift closed",
        content: (
          <Space direction="vertical">
            <span>Expected cash: {inr(data.expected_cash)}</span>
            <span>Counted cash: {inr(data.counted_cash)}</span>
            <b style={{ color: diff === 0 ? "#389e0d" : "#cf1322" }}>
              {diff === 0 ? "The drawer matches." : diff > 0 ? `Excess of ${inr(diff)}` : `Short by ${inr(-diff)}`}
            </b>
            {data.note && <span>Note: {data.note}</span>}
          </Space>
        ),
      });
    } catch (err) {
      const errors = fieldErrors(err);
      if (errors.note) closeForm.setFields([{ name: "note", errors: [errors.note] }]);
      else message.error(Object.values(errors)[0] ?? "Could not close the shift.");
    } finally {
      setBusy(false);
    }
  };

  if (!shift) {
    return (
      <>
        <Alert
          type="warning"
          showIcon
          message="Your cash shift is not open"
          description="Open it with the cash in your drawer before taking or returning money."
          action={
            <Button type="primary" onClick={() => setOpening(true)}>
              Open shift
            </Button>
          }
        />
        <Modal
          title="Open cash shift"
          open={opening}
          onCancel={() => setOpening(false)}
          onOk={() => openForm.submit()}
          okText="Open shift"
          confirmLoading={busy}
          destroyOnClose
        >
          <Form form={openForm} name="open-shift" layout="vertical" onFinish={open} initialValues={{ opening_cash: 0 }} preserve={false}>
            <Form.Item name="opening_cash" label="Cash in the drawer now (float)" rules={[{ required: true }]}>
              <InputNumber min={0} step={100} prefix="₹" style={{ width: "100%" }} autoFocus />
            </Form.Item>
          </Form>
        </Modal>
      </>
    );
  }

  const t = shift.totals;
  const expected = num(t.expected_cash);
  const diff = counted == null ? null : num(counted) - expected;

  return (
    <>
      <Alert
        type="info"
        message={
          <Space wrap size="large">
            <span>
              Shift open since <b>{dayjs(shift.opened_at).format("DD MMM, HH:mm")}</b>
            </span>
            <span>
              Cash in drawer <b>{inr(expected)}</b>
            </span>
            <span>Card {inr(num(t.by_mode.card.received) - num(t.by_mode.card.refunded))}</span>
            <span>UPI {inr(num(t.by_mode.upi.received) - num(t.by_mode.upi.refunded))}</span>
          </Space>
        }
        action={<Button onClick={() => setClosing(true)}>Close shift</Button>}
      />
      <Modal
        title="Close shift and count the cash"
        open={closing}
        onCancel={() => setClosing(false)}
        onOk={() => closeForm.submit()}
        okText="Close shift"
        confirmLoading={busy}
      >
        <Space direction="vertical" style={{ width: "100%", marginBottom: 16 }}>
          <span>Opening cash: {inr(shift.opening_cash)}</span>
          <span>
            Cash received {inr(t.by_mode.cash.received)}, cash refunded {inr(t.by_mode.cash.refunded)}
          </span>
          <Typography.Text strong>The drawer should hold {inr(expected)}</Typography.Text>
        </Space>
        <Form form={closeForm} name="close-shift" layout="vertical" onFinish={close}>
          <Form.Item name="counted_cash" label="Cash you counted" rules={[{ required: true, message: "Enter the counted cash" }]}>
            <InputNumber min={0} step={10} prefix="₹" style={{ width: "100%" }} autoFocus />
          </Form.Item>
          {diff !== null && (
            <Typography.Paragraph type={diff === 0 ? "success" : "danger"}>
              {diff === 0 ? "Matches." : diff > 0 ? `Excess of ${inr(diff)}` : `Short by ${inr(-diff)}`}
            </Typography.Paragraph>
          )}
          <Form.Item
            name="note"
            label="Note"
            rules={[{ required: diff !== null && Math.abs(diff) > 0.001, message: "Explain the difference" }]}
          >
            <Input.TextArea rows={2} placeholder="Needed only if the count does not match" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

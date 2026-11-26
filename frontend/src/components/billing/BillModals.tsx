import { App, Form, Input, InputNumber, Modal, Radio, Typography } from "antd";
import { useEffect, useState } from "react";
import { api, fieldErrors } from "../../api/client";
import type { Bill, PayMode } from "../../api/types";
import { inr, num } from "./money";

const MODES = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
];

interface BaseProps {
  bill: Bill;
  open: boolean;
  onClose: () => void;
  onDone: (bill: Bill) => void;
}

/** Post to a bill action and map field errors back onto the form. */
function useBillAction(bill: Bill, onDone: (b: Bill) => void) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const run = async (action: string, body: object, form: ReturnType<typeof Form.useForm>[0], ok: (b: Bill) => string) => {
    setBusy(true);
    try {
      const { data } = await api.post<Bill>(`/bills/${bill.id}/${action}/`, body);
      message.success(ok(data));
      onDone(data);
      return true;
    } catch (err) {
      const errors = fieldErrors(err);
      const fields = Object.keys(form.getFieldsValue(true) as Record<string, unknown>);
      const onForm = Object.entries(errors).filter(([k]) => fields.includes(k));
      if (onForm.length) form.setFields(onForm.map(([name, e]) => ({ name, errors: [e] })));
      else message.error(Object.values(errors)[0] ?? "That did not work.", 6);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

export function PayModal({ bill, open, onClose, onDone }: BaseProps) {
  const [form] = Form.useForm();
  const { busy, run } = useBillAction(bill, onDone);
  const mode: PayMode = Form.useWatch("mode", form) ?? "cash";
  const amount = Form.useWatch("amount", form);
  const tendered = Form.useWatch("tendered", form);

  useEffect(() => {
    if (open) form.setFieldsValue({ mode: "cash", amount: num(bill.balance), reference: "", tendered: undefined });
  }, [open, bill.balance, form]);

  const submit = async (v: { mode: PayMode; amount: number; reference?: string }) => {
    const ok = await run("pay", { mode: v.mode, amount: v.amount, reference: v.reference ?? "" }, form, (b) => {
      const receipt = b.payments[b.payments.length - 1];
      return num(b.balance) > 0
        ? `Receipt ${receipt.receipt_no} for ${inr(receipt.amount)}. ${inr(b.balance)} still to pay.`
        : `Receipt ${receipt.receipt_no}. Bill paid in full.`;
    });
    if (ok) onClose();
  };

  const change = mode === "cash" && tendered && amount ? num(tendered) - num(amount) : null;

  return (
    <Modal title={`Take payment, balance ${inr(bill.balance)}`} open={open} onCancel={onClose} onOk={() => form.submit()} okText="Take payment" confirmLoading={busy}>
      <Form form={form} name="pay" layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item name="mode" label="Mode">
          <Radio.Group options={MODES} optionType="button" buttonStyle="solid" />
        </Form.Item>
        <Form.Item
          name="amount"
          label="Amount"
          extra="To split across modes, take part now and the rest as a second payment."
          rules={[{ required: true, message: "Enter the amount" }]}
        >
          <InputNumber min={0.01} max={num(bill.balance)} prefix="₹" style={{ width: "100%" }} autoFocus />
        </Form.Item>
        {mode === "cash" ? (
          <Form.Item name="tendered" label="Cash handed over (optional)">
            <InputNumber min={0} prefix="₹" style={{ width: "100%" }} />
          </Form.Item>
        ) : (
          <Form.Item
            name="reference"
            label={mode === "card" ? "Card slip number" : "UPI transaction ID"}
            rules={[{ required: true, message: "Enter the reference number" }]}
          >
            <Input />
          </Form.Item>
        )}
        {change !== null && change >= 0 && (
          <Typography.Title level={4} style={{ margin: 0 }}>
            Return {inr(change)}
          </Typography.Title>
        )}
        {change !== null && change < 0 && <Typography.Text type="danger">Less than the amount being paid.</Typography.Text>}
      </Form>
    </Modal>
  );
}

export function RefundModal({ bill, open, onClose, onDone, limit }: BaseProps & { limit?: number }) {
  const [form] = Form.useForm();
  const { busy, run } = useBillAction(bill, onDone);
  const refundable = num(bill.paid_total) - num(bill.refunded_total);

  useEffect(() => {
    if (open) form.setFieldsValue({ mode: bill.payments[bill.payments.length - 1]?.mode ?? "cash", amount: refundable, reason: "" });
  }, [open, bill, refundable, form]);

  const submit = async (v: { mode: PayMode; amount: number; reason: string }) => {
    const ok = await run("refund", v, form, (b) => `Refund ${b.refunds[b.refunds.length - 1].refund_no} recorded.`);
    if (ok) onClose();
  };

  return (
    <Modal title="Refund" open={open} onCancel={onClose} onOk={() => form.submit()} okText="Record refund" okButtonProps={{ danger: true }} confirmLoading={busy}>
      <Typography.Paragraph type="secondary">
        Up to {inr(refundable)} can be returned on this bill.
        {limit ? ` Refunds above ${inr(limit)} need an admin.` : ""}
      </Typography.Paragraph>
      <Form form={form} name="refund" layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item name="mode" label="Returned as">
          <Radio.Group options={MODES} optionType="button" buttonStyle="solid" />
        </Form.Item>
        <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
          <InputNumber min={0.01} max={refundable} prefix="₹" style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="reason" label="Reason" rules={[{ required: true, whitespace: true, message: "Give a reason" }]}>
          <Input placeholder="e.g. test not done, doctor unavailable" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function DiscountModal({ bill, open, onClose, onDone, limit }: BaseProps & { limit?: number }) {
  const [form] = Form.useForm();
  const { busy, run } = useBillAction(bill, onDone);
  const kind: "percent" | "amount" = Form.useWatch("kind", form) ?? "percent";
  const value = Form.useWatch("value", form);
  const gross = num(bill.subtotal);
  const off = kind === "percent" ? (gross * num(value)) / 100 : num(value);

  useEffect(() => {
    if (open) {
      const existing = num(bill.discount_total);
      form.setFieldsValue({ kind: "amount", value: existing || undefined, reason: bill.discount_reason });
      if (!existing) form.setFieldsValue({ kind: "percent" });
    }
  }, [open, bill, form]);

  const submit = async (v: { kind: "percent" | "amount"; value: number; reason: string }) => {
    const ok = await run("discount", { [v.kind]: v.value ?? 0, reason: v.reason ?? "" }, form, (b) =>
      num(b.discount_total) > 0 ? `Discount of ${inr(b.discount_total)} applied.` : "Discount removed.",
    );
    if (ok) onClose();
  };

  return (
    <Modal title="Discount on the whole bill" open={open} onCancel={onClose} onOk={() => form.submit()} okText="Apply" confirmLoading={busy}>
      <Typography.Paragraph type="secondary">
        Bill value before discount is {inr(gross)}.{limit ? ` Above ${limit}% needs an admin.` : ""} Enter 0 to remove a discount.
      </Typography.Paragraph>
      <Form form={form} name="discount" layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item name="kind">
          <Radio.Group
            optionType="button"
            options={[
              { value: "percent", label: "Percent" },
              { value: "amount", label: "Amount" },
            ]}
          />
        </Form.Item>
        <Form.Item name="value" label={kind === "percent" ? "Percent off" : "Amount off"} rules={[{ required: true, message: "Enter a value" }]}>
          <InputNumber min={0} max={kind === "percent" ? 100 : gross} prefix={kind === "amount" ? "₹" : undefined} suffix={kind === "percent" ? "%" : undefined} style={{ width: "100%" }} autoFocus />
        </Form.Item>
        {value ? <Typography.Paragraph>Patient pays {inr(Math.max(gross - off, 0))} before tax.</Typography.Paragraph> : null}
        <Form.Item name="reason" label="Reason" rules={[{ required: num(value) > 0, whitespace: true, message: "Give a reason" }]}>
          <Input placeholder="e.g. senior citizen, staff family, hospital scheme" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

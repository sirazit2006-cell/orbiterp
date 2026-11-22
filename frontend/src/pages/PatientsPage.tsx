import { PlusOutlined } from "@ant-design/icons";
import { Button, Input, Space, Table, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, Page } from "../api/client";
import type { PatientSummary } from "../api/types";
import { useAuth } from "../auth/AuthContext";

const GENDER = { M: "Male", F: "Female", O: "Other" } as const;

export default function PatientsPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const page = Number(params.get("page") ?? 1);
  const [data, setData] = useState<Page<PatientSummary> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get<Page<PatientSummary>>("/patients/", { params: { q: q || undefined, page } })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [q, page]);

  return (
    <>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Patients
        </Typography.Title>
        {hasRole("reception") && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/patients/new")}>
            Register patient
          </Button>
        )}
      </Space>
      <Input.Search
        placeholder="Search by mobile number, name or UHID"
        defaultValue={q}
        allowClear
        enterButton
        autoFocus
        size="large"
        onSearch={(value) => setParams(value ? { q: value } : {})}
        style={{ maxWidth: 520, marginBottom: 16 }}
      />
      <Table<PatientSummary>
        rowKey="id"
        loading={loading}
        dataSource={data?.results}
        onRow={(p) => ({ onClick: () => navigate(`/patients/${p.id}`), style: { cursor: "pointer" } })}
        pagination={{
          current: page,
          pageSize: 25,
          total: data?.count,
          showSizeChanger: false,
          onChange: (p) => setParams({ ...(q ? { q } : {}), page: String(p) }),
        }}
        columns={[
          { title: "UHID", dataIndex: "uhid" },
          { title: "Name", dataIndex: "full_name" },
          { title: "Gender", dataIndex: "gender", render: (g: keyof typeof GENDER) => GENDER[g] },
          { title: "Age", dataIndex: "age" },
          { title: "Mobile", dataIndex: "mobile" },
          { title: "City", dataIndex: "city" },
          { title: "Registered", dataIndex: "created_at", render: (d: string) => dayjs(d).format("DD MMM YYYY") },
        ]}
        scroll={{ x: 720 }}
      />
    </>
  );
}

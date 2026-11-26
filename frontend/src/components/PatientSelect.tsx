import { Select, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { api, Page } from "../api/client";
import type { PatientSummary } from "../api/types";

interface Props {
  id?: string;
  value?: number;
  onChange?: (id: number) => void;
  initial?: PatientSummary;
}

/** Search patients by mobile, name or UHID as the user types. */
export default function PatientSelect({ id, value, onChange, initial }: Props) {
  const [options, setOptions] = useState<PatientSummary[]>(initial ? [initial] : []);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const search = (q: string) => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) return;
    timer.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get<Page<PatientSummary>>("/patients/", { params: { q } });
        setOptions(data.results);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  return (
    <Select
      id={id}
      showSearch
      value={value}
      onChange={onChange}
      filterOption={false}
      onSearch={search}
      notFoundContent={loading ? <Spin size="small" /> : "Type a mobile number, name or UHID"}
      placeholder="Search patient"
      options={options.map((p) => ({
        value: p.id,
        label: `${p.uhid} · ${p.full_name} · ${p.age ?? "?"} yrs · ${p.mobile}`,
      }))}
    />
  );
}

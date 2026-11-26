import { useEffect, useState } from "react";
import { api, Page } from "../api/client";
import type { Doctor } from "../api/types";

/** Active doctors, loaded once, with Select options grouped by department. */
export function useDoctors() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  useEffect(() => {
    api
      .get<Page<Doctor>>("/doctors/", { params: { is_active: true, page_size: 200 } })
      .then((r) => setDoctors(r.data.results));
  }, []);

  const departments = [...new Set(doctors.map((d) => d.department_name))].sort();
  const options = departments.map((dept) => ({
    label: dept,
    options: doctors
      .filter((d) => d.department_name === dept)
      .map((d) => ({ value: d.id, label: `${d.name}${d.specialization ? ` · ${d.specialization}` : ""}` })),
  }));
  return { doctors, options };
}

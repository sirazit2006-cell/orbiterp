import { Result } from "antd";
import { ReactNode } from "react";
import type { Role } from "../api/types";
import { useAuth } from "../auth/AuthContext";

export default function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) {
    return <Result status="403" title="Not allowed" subTitle="Your role does not give access to this page." />;
  }
  return <>{children}</>;
}

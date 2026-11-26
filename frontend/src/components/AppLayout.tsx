import {
  CalendarOutlined,
  OrderedListOutlined,
  ScheduleOutlined,
  DashboardOutlined,
  DollarOutlined,
  LogoutOutlined,
  MedicineBoxOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Button, Layout, Menu, Space, Tag, Typography } from "antd";
import type { ItemType } from "antd/es/menu/interface";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const { Sider, Header, Content } = Layout;

export default function AppLayout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // OPD consultation and billing arrive in the next steps; shown disabled so staff see what is coming.
  const items: ItemType[] = [
    { key: "/", icon: <DashboardOutlined />, label: "Dashboard" },
    { key: "/patients", icon: <TeamOutlined />, label: "Patients" },
    { key: "/appointments", icon: <CalendarOutlined />, label: "Appointments" },
    { key: "/queue", icon: <OrderedListOutlined />, label: "OPD queue" },
    ...(hasRole("admin") ? [{ key: "/schedules", icon: <ScheduleOutlined />, label: "Doctor schedules" }] : []),
    { key: "/opd", icon: <MedicineBoxOutlined />, label: "OPD", disabled: true },
    { key: "/billing", icon: <DollarOutlined />, label: "Billing", disabled: true },
  ];

  const selected = "/" + (location.pathname.split("/")[1] ?? "");

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider breakpoint="lg" collapsedWidth={0} theme="light" style={{ borderRight: "1px solid #eee" }}>
        <div style={{ padding: "18px 24px", fontWeight: 700, fontSize: 18, color: "#0b6e8a" }}>OrbitERP</div>
        <Menu mode="inline" selectedKeys={[selected]} items={items} onClick={(e) => navigate(e.key)} />
      </Sider>
      <Layout>
        <Header
          style={{
            background: "#fff",
            borderBottom: "1px solid #eee",
            display: "flex",
            justifyContent: "flex-end",
            paddingInline: 24,
          }}
        >
          <Space>
            <Typography.Text strong>{user?.full_name}</Typography.Text>
            {user?.roles.map((r) => (
              <Tag key={r}>{r}</Tag>
            ))}
            <Button icon={<LogoutOutlined />} onClick={logout}>
              Sign out
            </Button>
          </Space>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

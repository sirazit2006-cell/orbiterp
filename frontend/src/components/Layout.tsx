import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { fmtToday, initials } from '../lib/format'
import { Icon, type IconName } from './Icon'
import { CrumbCtx, type Crumb } from './page'

const roleLabel: Record<string, string> = {
  reception: 'Reception', nurse: 'Nurse', doctor: 'Doctor', billing: 'Billing', admin: 'Admin',
}

/** Modules that come after registration are shown so staff see where things will live. */
const later: { group: string; items: [IconName, string][] }[] = [
  { group: 'Front desk', items: [['calendar', 'Appointments'], ['calendarPlus', 'Book & check-in'], ['queue', 'Doctor queue']] },
  { group: 'Billing', items: [['receipt', 'Billing counter']] },
]

export default function Layout() {
  const { user, signOut } = useAuth()
  const [crumbs, setCrumbs] = useState<Crumb[]>([])

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><i><Icon name="plus" lg /></i><div>OrbitERP<small>OPD · Version 1</small></div></div>
        <div className="ng">Front desk</div>
        <NavLink className={({ isActive }) => `nv${isActive ? ' on' : ''}`} to="/patients"><Icon name="patients" />Patients</NavLink>
        {later[0].items.map(([icon, label]) => (
          <span key={label} className="nv off" title="Coming in a later module"><Icon name={icon} />{label}<span className="soon">Soon</span></span>
        ))}
        <div className="ng">{later[1].group}</div>
        {later[1].items.map(([icon, label]) => (
          <span key={label} className="nv off" title="Coming in a later module"><Icon name={icon} />{label}<span className="soon">Soon</span></span>
        ))}
        <div className="me">
          <span className="av">{initials(user?.name ?? '')}</span>
          <div className="sm"><b>{user?.name}</b><small>{user?.roles.map((r) => roleLabel[r]).join(', ')}{user?.desk ? ` · ${user.desk}` : ''}</small></div>
          <button className="out" type="button" onClick={() => signOut('manual')} title="Sign out" aria-label="Sign out"><Icon name="logout" /></button>
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <div className="crumb">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1
              const label = typeof c === 'string' ? c : c.label
              return <span key={i}>{last ? <b>{label}</b> : typeof c === 'string' ? label : <NavLink to={c.to} style={{ color: 'inherit' }}>{label}</NavLink>}{last ? '' : ' / '}</span>
            })}
          </div>
          <div className="sp" />
          {user?.desk && <span className="pill">{user.desk}</span>}
          <span className="pill">{fmtToday()}</span>
        </header>
        <div className="page"><CrumbCtx.Provider value={setCrumbs}><Outlet /></CrumbCtx.Provider></div>
      </div>
    </div>
  )
}

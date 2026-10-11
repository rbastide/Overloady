import { useEffect, useState } from 'react';
import { Icon, type IconName } from './Icons';

export type AppTab = 'dashboard' | 'logger' | 'analytics' | 'routines' | 'history' | 'exercises' | 'profile';

interface NavItem {
  id: AppTab;
  label: string;
  shortLabel: string;
  icon: IconName;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Tableau de bord', shortLabel: 'Accueil', icon: 'home' },
  { id: 'logger', label: 'Séance active', shortLabel: 'Séance', icon: 'dumbbell' },
  { id: 'routines', label: 'Programmes', shortLabel: 'Programmes', icon: 'clipboard' },
  { id: 'exercises', label: 'Exercices', shortLabel: 'Exercices', icon: 'list' },
  { id: 'analytics', label: 'Progression', shortLabel: 'Stats', icon: 'chart' },
  { id: 'history', label: 'Historique', shortLabel: 'Historique', icon: 'history' },
  { id: 'profile', label: 'Profil', shortLabel: 'Profil', icon: 'user' },
];

// Phones: 4 destinations in the bottom bar, the rest lives in the "Plus" sheet.
const BOTTOM_TABS: AppTab[] = ['dashboard', 'logger', 'analytics', 'history'];
const MORE_TABS: AppTab[] = ['routines', 'exercises', 'profile'];
// On desktop the profile is reached through the user card at the bottom of the sidebar.
const SIDEBAR_ITEMS = NAV_ITEMS.filter((item) => item.id !== 'profile');

const GOAL_LABELS: Record<string, string> = {
  FORCE: 'Force',
  BODYBUILDING: 'Hypertrophie',
  ENDURANCE: 'Endurance',
};

const itemById = (id: AppTab) => NAV_ITEMS.find((i) => i.id === id)!;

interface NavigationProps {
  activeTab: AppTab;
  onNavigate: (tab: AppTab) => void;
  /** Running session shown in the top bars: its name and elapsed time. */
  session: { name: string; clock: string } | null;
  displayName: string;
  goal?: string;
  testWeekStatus: { testWeekCompleted: boolean; testWeekProgress: number } | null;
  onOpenTestWeek: () => void;
  onOpenPlateCalc: () => void;
  onLogout: () => void;
}

export function Navigation({
  activeTab,
  onNavigate,
  session,
  displayName,
  goal,
  testWeekStatus,
  onOpenTestWeek,
  onOpenPlateCalc,
  onLogout,
}: NavigationProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const goalLabel = GOAL_LABELS[(goal || 'BODYBUILDING').toUpperCase()] || 'Hypertrophie';
  const initial = (displayName[0] || 'A').toUpperCase();
  const testWeekLabel = testWeekStatus
    ? testWeekStatus.testWeekCompleted
      ? 'Calibration terminée'
      : `Semaine test ${testWeekStatus.testWeekProgress}/3`
    : null;

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const go = (tab: AppTab) => {
    setMoreOpen(false);
    onNavigate(tab);
  };

  const runAndClose = (action: () => void) => {
    setMoreOpen(false);
    action();
  };

  return (
    <>
      {/* ===== Desktop / tablet sidebar ===== */}
      <aside className="sidebar" aria-label="Navigation principale">
        <button type="button" className="sidebar-brand" onClick={() => go('dashboard')}>
          <span className="brand-mark">
            <Icon name="bolt" size={18} filled strokeWidth={1.4} />
          </span>
          <span className="sidebar-brand-text sidebar-label">
            <span className="brand-title">OVERLOADY</span>
            <span className="brand-subtitle">Athletic Studio</span>
          </span>
        </button>

        <nav className="sidebar-nav">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-tab={item.id}
              className={`sidebar-link ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => go(item.id)}
              title={item.label}
              aria-current={activeTab === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} size={19} />
              <span className="sidebar-label">{item.label}</span>
              {item.id === 'logger' && session && <span className="live-dot" aria-label="Séance en cours" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {testWeekLabel && (
            <button
              type="button"
              className={`sidebar-status ${testWeekStatus?.testWeekCompleted ? 'is-done' : ''}`}
              onClick={onOpenTestWeek}
              title={testWeekLabel}
            >
              <span className="sidebar-status-dot" aria-hidden="true" />
              <span className="sidebar-label">{testWeekLabel}</span>
              <Icon name="flask" size={15} />
            </button>
          )}
          <button
            type="button"
            data-tab="profile"
            className={`sidebar-user ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => go('profile')}
            title="Profil"
            aria-current={activeTab === 'profile' ? 'page' : undefined}
          >
            <span className="avatar">{initial}</span>
            <span className="sidebar-label sidebar-user-text">
              <strong>{displayName}</strong>
              <small>{goalLabel}</small>
            </span>
          </button>
          <button type="button" className="sidebar-link sidebar-logout" onClick={onLogout} title="Déconnexion">
            <Icon name="logout" size={18} />
            <span className="sidebar-label">Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* ===== Desktop / tablet top bar: running session + tools ===== */}
      <header className="desk-topbar">
        <div className="desk-topbar-inner">
          {session && activeTab !== 'logger' ? (
            <button type="button" className="topbar-session" onClick={() => go('logger')} title="Revenir à la séance">
              <span className="topbar-session-label">En cours</span>
              <span className="topbar-session-name">{session.name}</span>
              <Icon name="chevronRight" size={14} />
            </button>
          ) : (
            <span className="topbar-crumb">{session && activeTab === 'logger' ? session.name : itemById(activeTab).label}</span>
          )}

          <div className="desk-topbar-actions">
            {testWeekStatus && !testWeekStatus.testWeekCompleted && (
              <button type="button" className="topbar-chip is-active" onClick={onOpenTestWeek} title={testWeekLabel || ''}>
                <Icon name="flask" size={15} />
                <span>{testWeekLabel}</span>
              </button>
            )}
            <button type="button" className="topbar-chip" onClick={onOpenPlateCalc} title="Calculateur disques & 1RM">
              <Icon name="calculator" size={15} />
              <span>Disques & 1RM</span>
            </button>
            {session && (
              <button type="button" className="topbar-clock" onClick={() => go('logger')} title="Durée de la séance">
                <span className="topbar-clock-dot" aria-hidden="true" />
                <span>{session.clock}</span>
              </button>
            )}
            <button type="button" className="topbar-avatar" onClick={() => go('profile')} aria-label="Profil" title="Profil">
              <Icon name="user" size={17} />
            </button>
          </div>
        </div>
      </header>

      {/* ===== Mobile top bar ===== */}
      <header className="mobile-topbar">
        <button type="button" className="mobile-topbar-brand" onClick={() => go('dashboard')} aria-label="Accueil">
          <span className="brand-mark">
            <Icon name="bolt" size={15} filled strokeWidth={1.4} />
          </span>
          <span className="brand-title">OVERLOADY</span>
        </button>
        <div className="mobile-topbar-actions">
          {session && (
            <button type="button" className="topbar-clock" onClick={() => go('logger')} aria-label="Revenir à la séance">
              <span className="topbar-clock-dot" aria-hidden="true" />
              <span>{session.clock}</span>
            </button>
          )}
          {testWeekStatus && !testWeekStatus.testWeekCompleted && (
            <button type="button" className="topbar-icon is-info" onClick={onOpenTestWeek} aria-label={testWeekLabel || ''}>
              <Icon name="flask" size={18} />
              <span className="icon-btn-badge">{testWeekStatus.testWeekProgress}/3</span>
            </button>
          )}
          <button type="button" className="topbar-icon" onClick={onOpenPlateCalc} aria-label="Calculateur disques & 1RM">
            <Icon name="calculator" size={18} />
          </button>
          <button type="button" className="topbar-avatar" onClick={() => go('profile')} aria-label="Profil">
            <Icon name="user" size={17} />
          </button>
        </div>
      </header>

      {/* ===== Mobile bottom tab bar ===== */}
      <nav className="tabbar" aria-label="Navigation">
        {BOTTOM_TABS.map((id) => (
          <TabbarButton key={id} item={itemById(id)} active={activeTab === id} live={id === 'logger' && !!session} onClick={() => go(id)} />
        ))}
        <button
          type="button"
          className={`tabbar-btn ${MORE_TABS.includes(activeTab) || moreOpen ? 'active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <Icon name="menu" size={20} />
          <span className="tabbar-label">Plus</span>
        </button>
      </nav>

      {/* ===== Mobile "Plus" sheet ===== */}
      {moreOpen && (
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="sheet" role="dialog" aria-label="Plus" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-user">
              <span className="avatar avatar-lg">{initial}</span>
              <div>
                <strong>{displayName}</strong>
                <small>Programme {goalLabel}</small>
              </div>
            </div>

            <div className="sheet-group">
              {MORE_TABS.map((id) => {
                const item = itemById(id);
                return (
                  <button
                    key={id}
                    type="button"
                    data-tab={id}
                    className={`sheet-item ${activeTab === id ? 'active' : ''}`}
                    onClick={() => go(id)}
                  >
                    <Icon name={item.icon} size={20} />
                    <span>{item.label}</span>
                    <Icon name="chevronRight" size={18} className="sheet-chevron" />
                  </button>
                );
              })}
            </div>

            <div className="sheet-group">
              {testWeekLabel && (
                <button type="button" className="sheet-item" onClick={() => runAndClose(onOpenTestWeek)}>
                  <Icon name="flask" size={20} />
                  <span>{testWeekLabel}</span>
                  <Icon name="chevronRight" size={18} className="sheet-chevron" />
                </button>
              )}
              <button type="button" className="sheet-item" onClick={() => runAndClose(onOpenPlateCalc)}>
                <Icon name="calculator" size={20} />
                <span>Calculateur disques & 1RM</span>
                <Icon name="chevronRight" size={18} className="sheet-chevron" />
              </button>
            </div>

            <div className="sheet-group">
              <button type="button" className="sheet-item danger" onClick={() => runAndClose(onLogout)}>
                <Icon name="logout" size={20} />
                <span>Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TabbarButton({
  item,
  active,
  live,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  live: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-tab={item.id}
      className={`tabbar-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <span className="tabbar-icon">
        <Icon name={item.icon} size={20} />
        {live && <span className="live-dot" aria-label="Séance en cours" />}
      </span>
      <span className="tabbar-label">{item.shortLabel}</span>
    </button>
  );
}

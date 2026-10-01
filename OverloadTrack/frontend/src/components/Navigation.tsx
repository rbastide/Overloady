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
  { id: 'logger', label: 'Séance', shortLabel: 'Séance', icon: 'dumbbell' },
  { id: 'analytics', label: 'Analytique & PRs', shortLabel: 'Stats', icon: 'chart' },
  { id: 'history', label: 'Historique', shortLabel: 'Historique', icon: 'history' },
  { id: 'routines', label: 'Programmes', shortLabel: 'Programmes', icon: 'clipboard' },
  { id: 'exercises', label: 'Exercices', shortLabel: 'Exercices', icon: 'list' },
  { id: 'profile', label: 'Profil', shortLabel: 'Profil', icon: 'user' },
];

// Bottom bar keeps 4 destinations + the central workout button; the rest lives in the "Plus" sheet.
const BOTTOM_LEFT: AppTab[] = ['dashboard', 'analytics'];
const BOTTOM_RIGHT: AppTab[] = ['history'];
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
  hasActiveSession: boolean;
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
  hasActiveSession,
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
          <span className="brand-bolt">
            <Icon name="bolt" size={18} strokeWidth={2.4} />
          </span>
          <span className="brand-title sidebar-label">OVERLOADY</span>
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
              <Icon name={item.icon} />
              <span className="sidebar-label">{item.label}</span>
              {item.id === 'logger' && hasActiveSession && <span className="live-dot" aria-label="Séance en cours" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-section">
          <span className="sidebar-section-title sidebar-label">Outils</span>
          {testWeekLabel && (
            <button
              type="button"
              className={`sidebar-link ${testWeekStatus?.testWeekCompleted ? 'is-done' : 'is-info'}`}
              onClick={onOpenTestWeek}
              title={testWeekLabel}
            >
              <Icon name="flask" />
              <span className="sidebar-label">{testWeekLabel}</span>
            </button>
          )}
          <button type="button" className="sidebar-link" onClick={onOpenPlateCalc} title="Calculateur disques & 1RM">
            <Icon name="calculator" />
            <span className="sidebar-label">Disques & 1RM</span>
          </button>
        </div>

        <div className="sidebar-footer">
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
          <button type="button" className="icon-btn danger" onClick={onLogout} title="Déconnexion" aria-label="Déconnexion">
            <Icon name="logout" size={20} />
          </button>
        </div>
      </aside>

      {/* ===== Mobile top bar ===== */}
      <header className="mobile-topbar">
        <button type="button" className="mobile-topbar-brand" onClick={() => go('dashboard')} aria-label="Accueil">
          <span className="brand-bolt">
            <Icon name="bolt" size={16} strokeWidth={2.4} />
          </span>
        </button>
        <h1 className="mobile-topbar-title">{itemById(activeTab).label}</h1>
        <div className="mobile-topbar-actions">
          {testWeekStatus && !testWeekStatus.testWeekCompleted && (
            <button type="button" className="icon-btn info" onClick={onOpenTestWeek} aria-label={testWeekLabel || ''}>
              <Icon name="flask" size={20} />
              <span className="icon-btn-badge">{testWeekStatus.testWeekProgress}/3</span>
            </button>
          )}
          <button type="button" className="icon-btn" onClick={onOpenPlateCalc} aria-label="Calculateur disques & 1RM">
            <Icon name="calculator" size={20} />
          </button>
          <button type="button" className="avatar avatar-btn" onClick={() => go('profile')} aria-label="Profil">
            {initial}
          </button>
        </div>
      </header>

      {/* ===== Mobile bottom tab bar ===== */}
      <nav className="tabbar" aria-label="Navigation">
        {BOTTOM_LEFT.map((id) => (
          <TabbarButton key={id} item={itemById(id)} active={activeTab === id} onClick={() => go(id)} />
        ))}
        <button
          type="button"
          data-tab="logger"
          className={`tabbar-main ${activeTab === 'logger' ? 'active' : ''}`}
          onClick={() => go('logger')}
          aria-label="Séance"
        >
          <span className="tabbar-main-circle">
            <Icon name="dumbbell" size={26} strokeWidth={2.2} />
            {hasActiveSession && <span className="live-dot" />}
          </span>
          <span className="tabbar-label">Séance</span>
        </button>
        {BOTTOM_RIGHT.map((id) => (
          <TabbarButton key={id} item={itemById(id)} active={activeTab === id} onClick={() => go(id)} />
        ))}
        <button
          type="button"
          className={`tabbar-btn ${MORE_TABS.includes(activeTab) || moreOpen ? 'active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <Icon name="menu" />
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
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    <Icon name="chevronRight" size={18} className="sheet-chevron" />
                  </button>
                );
              })}
            </div>

            <div className="sheet-group">
              {testWeekLabel && (
                <button type="button" className="sheet-item" onClick={() => runAndClose(onOpenTestWeek)}>
                  <Icon name="flask" />
                  <span>{testWeekLabel}</span>
                  <Icon name="chevronRight" size={18} className="sheet-chevron" />
                </button>
              )}
              <button type="button" className="sheet-item" onClick={() => runAndClose(onOpenPlateCalc)}>
                <Icon name="calculator" />
                <span>Calculateur disques & 1RM</span>
                <Icon name="chevronRight" size={18} className="sheet-chevron" />
              </button>
            </div>

            <div className="sheet-group">
              <button type="button" className="sheet-item danger" onClick={() => runAndClose(onLogout)}>
                <Icon name="logout" />
                <span>Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TabbarButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-tab={item.id}
      className={`tabbar-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <Icon name={item.icon} />
      <span className="tabbar-label">{item.shortLabel}</span>
    </button>
  );
}

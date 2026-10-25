import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { useSyncState } from '../lib/connectivity';

const SYNCED_FOR_MS = 4000;

const sessions = (n: number) => `${n} séance${n > 1 ? 's' : ''}`;

/**
 * The network as the gym lives it, in the top bar: offline, sessions waiting to be sent, then a
 * brief "Synchronisé". Nothing at all when everything is online and sent.
 */
export function SyncStatus() {
  const { online, pending, syncing, syncedAt } = useSyncState();
  // "Synchronisé" shows for a few seconds after a sync, then the status steps aside
  const [hiddenSyncAt, setHiddenSyncAt] = useState<number | null>(null);
  useEffect(() => {
    if (!syncedAt) return;
    const timer = window.setTimeout(() => setHiddenSyncAt(syncedAt), SYNCED_FOR_MS);
    return () => window.clearTimeout(timer);
  }, [syncedAt]);

  let tone: 'offline' | 'pending' | 'synced';
  let label: string;
  let detail: string;
  if (!online) {
    tone = 'offline';
    label = pending > 0 ? `Hors ligne · ${pending}` : 'Hors ligne';
    detail =
      pending > 0
        ? `Hors ligne : ${sessions(pending)} en attente d'envoi, elle${pending > 1 ? 's partiront' : ' partira'} au retour du réseau`
        : 'Hors ligne : ta séance se note sur le téléphone';
  } else if (syncing || pending > 0) {
    tone = 'pending';
    label = syncing ? 'Envoi…' : `${pending} en attente`;
    detail = `${sessions(pending)} en attente d'envoi`;
  } else if (syncedAt && hiddenSyncAt !== syncedAt) {
    tone = 'synced';
    label = 'Synchronisé';
    detail = 'Tes séances sont enregistrées sur le serveur';
  } else {
    return <span className="sync-status-slot" role="status" aria-live="polite" />;
  }

  return (
    <span className="sync-status-slot" role="status" aria-live="polite">
      <span className={`sync-status is-${tone}`} title={detail}>
        <Icon name={tone === 'offline' ? 'cloudOff' : tone === 'synced' ? 'check' : 'cloud'} size={14} strokeWidth={2.2} />
        <span className="sync-status-label" aria-hidden="true">{label}</span>
        <span className="sr-only">{detail}</span>
      </span>
    </span>
  );
}

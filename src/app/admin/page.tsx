'use client';

import { useState } from 'react';
import useSWR from 'swr';

import { explorerTx } from '@/lib/config';
import { humaniseError, REGISTRY_ERRORS, VOUCHER_ERRORS } from '@/lib/errors';
import { registry, voucher } from '@/lib/protocol';
import { useWallet } from '@/lib/wallet';
import { useToast } from '@/components/Toast';
import { Button, Card, Empty, ExplorerLink } from '@/components/ui';

type ContractKind = 'registry' | 'voucher';

const CONTRACT_LABELS: Record<ContractKind, string> = {
  registry: 'Registry contract',
  voucher: 'Voucher contract',
};

const CONTRACT_ERRORS: Record<ContractKind, Record<number, string>> = {
  registry: REGISTRY_ERRORS,
  voucher: VOUCHER_ERRORS,
};

async function getAdmin(kind: ContractKind): Promise<string> {
  return kind === 'registry' ? registry.getAdmin() : voucher.getAdmin();
}

async function getPendingAdmin(kind: ContractKind): Promise<string | null> {
  return kind === 'registry'
    ? registry.getPendingAdmin()
    : voucher.getPendingAdmin();
}

async function proposeAdmin(
  kind: ContractKind,
  admin: string,
  newAdmin: string,
  sign: (xdr: string) => Promise<string>,
) {
  return kind === 'registry'
    ? registry.proposeAdmin(admin, newAdmin, sign)
    : voucher.proposeAdmin(admin, newAdmin, sign);
}

async function acceptAdmin(
  kind: ContractKind,
  nominee: string,
  sign: (xdr: string) => Promise<string>,
) {
  return kind === 'registry'
    ? registry.acceptAdmin(nominee, sign)
    : voucher.acceptAdmin(nominee, sign);
}

export default function AdminPage() {
  const { address, signTransaction, connect } = useWallet();
  const toast = useToast();

  const [busy, setBusy] = useState<ContractKind | null>(null);
  const [nomineeDraft, setNomineeDraft] = useState<Record<ContractKind, string>>({
    registry: '',
    voucher: '',
  });

  const contracts: ContractKind[] = ['registry', 'voucher'];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Admin console</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Hand over the administrator role in two steps: propose a nominee, then
          the nominee accepts. The change takes effect only after acceptance, so
          a typo in the address cannot strand the contract.
        </p>
      </div>

      {!address && (
        <Empty>Connect the administrator wallet to propose or accept a handover.</Empty>
      )}

      {contracts.map((kind) => (
        <AdminContractCard
          key={kind}
          kind={kind}
          address={address}
          busy={busy === kind}
          setBusy={(v) => setBusy(v ? kind : null)}
          nomineeDraft={nomineeDraft[kind]}
          setNomineeDraft={(v) =>
            setNomineeDraft((prev) => ({ ...prev, [kind]: v }))
          }
          signTransaction={signTransaction}
          connect={connect}
          toast={toast}
        />
      ))}
    </div>
  );
}

function AdminContractCard({
  kind,
  address,
  busy,
  setBusy,
  nomineeDraft,
  setNomineeDraft,
  signTransaction,
  connect,
  toast,
}: {
  kind: ContractKind;
  address: string | null;
  busy: boolean;
  setBusy: (v: boolean) => void;
  nomineeDraft: string;
  setNomineeDraft: (v: string) => void;
  signTransaction: (xdr: string) => Promise<string>;
  connect: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const adminKey = ['admin', kind];
  const pendingKey = ['pending-admin', kind];

  const { data: admin, error: adminError, mutate: mutateAdmin } = useSWR(
    adminKey,
    () => getAdmin(kind),
  );
  const { data: pending, error: pendingError, mutate: mutatePending } = useSWR(
    pendingKey,
    () => getPendingAdmin(kind),
  );

  const isAdmin =
    !!address && !!admin && address.toLowerCase() === admin.toLowerCase();
  const isNominee =
    !!address && !!pending && address.toLowerCase() === pending.toLowerCase();

  async function handlePropose() {
    if (!address) return void connect();
    const target = nomineeDraft.trim();
    if (!target) return;
    setBusy(true);
    try {
      const res = await proposeAdmin(kind, address, target, signTransaction);
      await mutateAdmin();
      await mutatePending();
      toast.success(
        <>
          Handover proposed.{' '}
          <ExplorerLink href={explorerTx(res.hash)}>View transaction</ExplorerLink>
        </>,
      );
      setNomineeDraft('');
    } catch (err) {
      toast.error(humaniseError(err, CONTRACT_ERRORS[kind]));
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept() {
    if (!address) return void connect();
    setBusy(true);
    try {
      const res = await acceptAdmin(kind, address, signTransaction);
      await mutateAdmin();
      await mutatePending();
      toast.success(
        <>
          Handover accepted.{' '}
          <ExplorerLink href={explorerTx(res.hash)}>View transaction</ExplorerLink>
        </>,
      );
    } catch (err) {
      toast.error(humaniseError(err, CONTRACT_ERRORS[kind]));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="font-medium">{CONTRACT_LABELS[kind]}</h2>

      {adminError && (
        <p className="text-sm text-[var(--color-ink-soft)]">
          {humaniseError(adminError, CONTRACT_ERRORS[kind])}
        </p>
      )}
      {pendingError && (
        <p className="text-sm text-[var(--color-ink-soft)]">
          {humaniseError(pendingError, CONTRACT_ERRORS[kind])}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs text-[var(--color-ink-soft)]">Current admin</div>
          <div className="mt-1 break-all text-sm">
            {admin ?? (adminError ? '—' : 'Loading…')}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--color-ink-soft)]">Pending admin</div>
          <div className="mt-1 break-all text-sm">
            {pending === undefined
              ? 'Loading…'
              : pending === null
                ? 'None'
                : pending}
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Propose a new admin</div>
          <div className="flex flex-wrap gap-2">
            <input
              value={nomineeDraft}
              onChange={(e) => setNomineeDraft(e.target.value)}
              placeholder="New admin address"
              className="min-w-[16rem] flex-1 rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
            />
            <Button
              disabled={busy || !nomineeDraft.trim()}
              onClick={() => void handlePropose()}
            >
              {busy ? 'Confirming…' : 'Propose'}
            </Button>
          </div>
        </div>
      )}

      {isNominee && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--color-ink-soft)]">
            You are the nominated administrator for this contract. Accept to
            complete the handover.
          </p>
          <Button disabled={busy} onClick={() => void handleAccept()}>
            {busy ? 'Confirming…' : 'Accept handover'}
          </Button>
        </div>
      )}
    </Card>
  );
}

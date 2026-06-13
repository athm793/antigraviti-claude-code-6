"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "./ConfirmModal";
import type { User } from "@/lib/types";

export function UsersManager({
  initialUsers,
  currentUserId,
}: {
  initialUsers: User[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState("");
  const admins = users.filter((u) => u.is_admin).length;

  function replaceUser(updated: User) {
    setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)));
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      <CreateUserForm
        onCreated={(user) => {
          setUsers((list) => [...list, user]);
          router.refresh();
        }}
        onError={setError}
      />

      <div className="flex flex-col gap-3">
        {users.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            isSelf={user.id === currentUserId}
            isLastAdmin={user.is_admin && admins <= 1}
            onUpdated={(updated) => {
              replaceUser(updated);
              router.refresh();
            }}
            onDeleted={(id) => {
              setUsers((list) => list.filter((u) => u.id !== id));
              router.refresh();
            }}
            onError={setError}
          />
        ))}
      </div>
    </div>
  );
}

function CreateUserForm({
  onCreated,
  onError,
}: {
  onCreated: (user: User) => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const id = useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onError("");

    if (password.length < 8) {
      onError("Password must be at least 8 characters");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, isAdmin }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onError(data.error ?? "Failed to create user");
        setSaving(false);
        return;
      }

      const user = await res.json();
      onCreated(user);
      setEmail("");
      setName("");
      setPassword("");
      setIsAdmin(false);
      setOpen(false);
    } catch {
      onError("Network error — check your connection and try again");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-[#00C4B4] hover:bg-[#00a89a] text-black font-semibold text-sm px-5 min-h-[44px] rounded-lg transition-colors self-start"
      >
        + Add User
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#111118] border border-[#2a2a38] rounded-xl p-4 flex flex-col gap-4"
    >
      <h2 className="text-sm font-semibold text-white">New User</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-email`} className="text-sm font-medium text-[#c8c8d8]">
            Email
          </label>
          <input
            id={`${id}-email`}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            className={inputCls}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-medium text-[#c8c8d8]">
            Name <span className="text-[#8b8b9e] font-normal">(optional)</span>
          </label>
          <input
            id={`${id}-name`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Teammate name"
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-password`} className="text-sm font-medium text-[#c8c8d8]">
          Temporary Password
        </label>
        <input
          id={`${id}-password`}
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          className={inputCls}
        />
        <p className="text-xs text-[#8b8b9e]">
          Share this with your teammate — they can use it to sign in right away.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-[#c8c8d8] cursor-pointer min-h-[44px]">
        <input
          type="checkbox"
          checked={isAdmin}
          onChange={(e) => setIsAdmin(e.target.checked)}
          className="w-4 h-4 accent-[#00C4B4]"
        />
        Grant admin access (can manage configs and users)
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-[#00C4B4] hover:bg-[#00a89a] disabled:opacity-50 text-black font-semibold text-sm px-5 min-h-[44px] rounded-lg transition-colors"
        >
          {saving ? "Creating…" : "Create User"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="bg-[#0a0a10] hover:bg-[#15151f] text-[#c8c8d8] border border-[#2a2a38] hover:border-[#363650] text-sm px-5 min-h-[44px] rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function UserRow({
  user,
  isSelf,
  isLastAdmin,
  onUpdated,
  onDeleted,
  onError,
}: {
  user: User;
  isSelf: boolean;
  isLastAdmin: boolean;
  onUpdated: (user: User) => void;
  onDeleted: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  async function patch(body: Record<string, unknown>) {
    onError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onError(data.error ?? "Failed to update user");
        return;
      }
      const updated = await res.json();
      onUpdated(updated);
    } catch {
      onError("Network error — check your connection and try again");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      onError("Password must be at least 8 characters");
      return;
    }
    await patch({ password: newPassword });
    setNewPassword("");
    setResetOpen(false);
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 4000);
  }

  async function handleToggleAdmin() {
    await patch({ isAdmin: !user.is_admin });
  }

  async function handleDelete() {
    onError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onError(data.error ?? "Failed to delete user");
        return;
      }
      onDeleted(user.id);
    } catch {
      onError("Network error — check your connection and try again");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="bg-[#111118] border border-[#2a2a38] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-white text-sm font-semibold">
              {user.name || user.email}
            </span>
            {user.is_admin && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#00C4B4] bg-[#00C4B4]/15 px-2 py-0.5 rounded-full">
                Admin
              </span>
            )}
            {isSelf && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#8b8b9e] bg-[#1a1a28] px-2 py-0.5 rounded-full">
                You
              </span>
            )}
          </div>
          <p className="text-[#8b8b9e] text-xs mt-0.5">{user.email}</p>
          {resetSuccess && (
            <p className="text-[#00C4B4] text-xs mt-1">
              Password reset. Share the new password with this person — they
              can sign in with it right away.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setResetOpen((v) => !v)}
            disabled={busy}
            className="text-sm bg-[#0a0a10] hover:bg-[#15151f] text-[#c8c8d8] border border-[#2a2a38] hover:border-[#363650] px-3 min-h-[44px] rounded-lg transition-colors disabled:opacity-50"
          >
            Reset Password
          </button>
          <button
            onClick={handleToggleAdmin}
            disabled={busy || (user.is_admin && isLastAdmin)}
            title={user.is_admin && isLastAdmin ? "Can't remove the last admin" : undefined}
            className="text-sm bg-[#0a0a10] hover:bg-[#15151f] text-[#c8c8d8] border border-[#2a2a38] hover:border-[#363650] px-3 min-h-[44px] rounded-lg transition-colors disabled:opacity-50"
          >
            {user.is_admin ? "Remove Admin" : "Make Admin"}
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={busy || isSelf || (user.is_admin && isLastAdmin)}
            title={
              isSelf
                ? "You can't delete your own account"
                : user.is_admin && isLastAdmin
                  ? "Can't delete the last admin"
                  : undefined
            }
            className="text-sm bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 px-3 min-h-[44px] rounded-lg transition-colors disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      {resetOpen && (
        <form onSubmit={handleResetPassword} className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-[#c8c8d8]">New Password</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={inputCls}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="bg-[#00C4B4] hover:bg-[#00a89a] disabled:opacity-50 text-black font-semibold text-sm px-4 min-h-[44px] rounded-lg transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setResetOpen(false)}
            className="bg-[#0a0a10] hover:bg-[#15151f] text-[#c8c8d8] border border-[#2a2a38] hover:border-[#363650] text-sm px-4 min-h-[44px] rounded-lg transition-colors"
          >
            Cancel
          </button>
        </form>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Delete user"
        message={`Permanently delete ${user.email}? They will lose access immediately. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

const inputCls =
  "w-full bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-2.5 min-h-[44px] text-sm text-white placeholder-[#4a4a58] focus:outline-none focus:border-[#00C4B4]/40 transition-colors";

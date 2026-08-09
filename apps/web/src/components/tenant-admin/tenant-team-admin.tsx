"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  canActorReactivateMember,
  canActorSuspendMember,
  roleOptionsForActor,
  TENANT_ADMIN_ROLE_LABELS,
  TENANT_MEMBER_STATUS_LABELS,
  tenantMemberPublicMessage,
  type TenantMember
} from "@/features/tenant-admin/tenant-admin";
import type { RoleSlug } from "@/types/domain";

export function TenantTeamAdmin({
  tenantName,
  actorRole,
  initialMembers
}: {
  tenantName: string;
  actorRole: RoleSlug;
  initialMembers: TenantMember[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
  const roleOptions = useMemo(() => roleOptionsForActor(actorRole), [actorRole]);

  async function reloadMembers() {
    const response = await fetch("/api/admin/team", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("TEAM_RELOAD_FAILED");
    const body = await response.json();
    setMembers(body.data ?? []);
  }

  async function submit(userId: string, body: Record<string, string>) {
    setLoadingUserId(userId);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/team/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.code ?? payload.error ?? "TENANT_MEMBER_ERROR");

      await reloadMembers();
      setMessage({ type: "success", text: "L’équipe a été mise à jour." });
    } catch (error) {
      setMessage({ type: "error", text: tenantMemberPublicMessage(error instanceof Error ? error.message : undefined) });
    } finally {
      setLoadingUserId(null);
    }
  }

  return (
    <section className="tenant-admin-layout" aria-label="Administration des membres du tenant">
      <Card className="tenant-admin-summary">
        <p className="muted">Tenant actif</p>
        <h2>{tenantName}</h2>
        <p>{members.length} membre{members.length > 1 ? "s" : ""} rattaché{members.length > 1 ? "s" : ""}.</p>
      </Card>

      {message ? (
        <p className={message.type === "success" ? "form-message success" : "form-message error"} role={message.type === "error" ? "alert" : "status"} aria-live="polite">
          {message.text}
        </p>
      ) : null}

      {members.length === 0 ? (
        <EmptyState title="Aucun membre" body="Aucun utilisateur n’est rattaché à ce tenant." />
      ) : (
        <div className="tenant-admin-members">
          {members.map((member) => (
            <Card as="article" className="tenant-admin-member-card" key={member.userId}>
              <div className="tenant-admin-member-main">
                <div>
                  <h2>{member.name}</h2>
                  <p className="muted">{member.email}</p>
                </div>
                <div className="tenant-admin-badges">
                  <Badge tone={member.status === "active" ? "success" : member.status === "suspended" ? "warning" : "neutral"}>{TENANT_MEMBER_STATUS_LABELS[member.status]}</Badge>
                  <Badge>{TENANT_ADMIN_ROLE_LABELS[member.role]}</Badge>
                  {member.isCurrentUser ? <Badge tone="info">Vous</Badge> : null}
                </div>
              </div>

              <div className="tenant-admin-actions">
                <label>
                  <span>Rôle</span>
                  <select
                    className="input"
                    value={member.role}
                    disabled={loadingUserId === member.userId || member.status === "invited" || (actorRole === "admin" && member.role === "owner")}
                    onChange={(event) => submit(member.userId, { action: "change_role", role: event.target.value })}
                  >
                    {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                    {actorRole === "admin" && member.role === "owner" ? <option value="owner">Propriétaire</option> : null}
                  </select>
                </label>
                {canActorSuspendMember(actorRole, member) ? (
                  <Button type="button" variant="danger" disabled={loadingUserId === member.userId} onClick={() => submit(member.userId, { action: "suspend" })}>
                    Suspendre
                  </Button>
                ) : null}
                {canActorReactivateMember(actorRole, member) ? (
                  <Button type="button" variant="subtle" disabled={loadingUserId === member.userId} onClick={() => submit(member.userId, { action: "reactivate" })}>
                    Réactiver
                  </Button>
                ) : null}
              </div>
              {member.status === "invited" ? <p className="muted">Les invitations existantes sont affichées mais ne sont pas gérées dans cette version.</p> : null}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
